// semantic-release plugin (prepare step): makes the tag a reproducible pin.
//
// Runs after @semantic-release/git, so `main` already holds the release
// commit. It then:
//   1. stamps `#<tag>` into every in-repo registryDependencies entry of
//      registry.json and rebuilds r/ from it,
//   2. checks that nothing in either was left unpinned,
//   3. commits that stamped tree (S), then a commit R whose tree is the
//      release commit's again, and pushes R to the release branch, so
//      `main` ends up exactly as it was and floats,
//   4. detaches HEAD at S. semantic-release tags HEAD once prepare ends, so
//      the tag lands on S.
//
// S has to sit in main's history: semantic-release finds the last release
// with `git tag --merged <branch>`, and a tag on an off-branch commit would
// be invisible to it. A commit cannot contain its own SHA, so the tag name is
// the self-reference. design-system#65.

import { execFile, exec } from "node:child_process"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { findUnpinned, pinRegistry } from "./pin-registry-dependencies.mjs"

const run = promisify(execFile)
const runShell = promisify(exec)

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"))

export async function prepare(pluginConfig, context) {
  const { buildCommand } = pluginConfig
  if (!buildCommand) {
    throw new Error("semantic-release-pin needs a `buildCommand` that rebuilds r/ from registry.json")
  }
  const { cwd, logger, nextRelease, branch, options } = context
  const env = { ...process.env, ...context.env }
  const git = async (args, extraEnv = {}) =>
    (await run("git", args, { cwd, env: { ...env, ...extraEnv } })).stdout.trim()

  const ref = nextRelease.gitTag
  const releaseCommit = await git(["rev-parse", "HEAD"])
  const releaseTree = await git(["rev-parse", "HEAD^{tree}"])

  const registryPath = join(cwd, "registry.json")
  await writeFile(
    registryPath,
    `${JSON.stringify(pinRegistry(await readJson(registryPath), ref), null, 2)}\n`,
  )
  await runShell(buildCommand, { cwd, env })

  const builtFiles = (await readdir(join(cwd, "r"))).filter((file) => file.endsWith(".json"))
  const unpinned = [
    ...findUnpinned(await readJson(registryPath), ref).map((found) => ({ file: "registry.json", ...found })),
    ...(
      await Promise.all(
        builtFiles.map(async (file) =>
          findUnpinned(await readJson(join(cwd, "r", file)), ref).map((found) => ({
            file: `r/${file}`,
            ...found,
          })),
        ),
      )
    ).flat(),
  ]
  if (unpinned.length > 0) {
    throw new Error(
      `Tagged content must pin every in-repo registryDependencies entry to ${ref}; found:\n${unpinned
        .map(({ file, item, entry }) => `  ${file}: ${item} -> ${entry}`)
        .join("\n")}`,
    )
  }

  // A scratch index builds the stamped tree without touching the real index.
  const scratch = await mkdtemp(join(tmpdir(), "pin-registry-"))
  let stampCommit
  try {
    const indexEnv = { GIT_INDEX_FILE: join(scratch, "index") }
    await git(["read-tree", releaseCommit], indexEnv)
    await git(["add", "--all", "--", "registry.json", "r"], indexEnv)
    const stampedTree = await git(["write-tree"], indexEnv)
    stampCommit = await git(
      ["commit-tree", stampedTree, "-p", releaseCommit, "-m", `chore(release): pin registryDependencies to ${ref} [skip ci]`],
    )
  } finally {
    await rm(scratch, { recursive: true })
  }
  const restoreCommit = await git([
    "commit-tree",
    releaseTree,
    "-p",
    stampCommit,
    "-m",
    "chore(release): restore floating registryDependencies on main [skip ci]",
  ])

  await git(["push", options.repositoryUrl, `${restoreCommit}:refs/heads/${branch.name}`])
  await git(["checkout", "--detach", stampCommit])
  logger.log("Pinned registryDependencies to %s on %s; main keeps %s", ref, stampCommit, restoreCommit)
}
