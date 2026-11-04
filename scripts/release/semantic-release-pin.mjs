// semantic-release plugin (prepare step): makes the tag a reproducible pin.
//
// Runs after @semantic-release/git, so `main` already holds the release
// commit (or, with `releaseFiles`, makes that commit itself; see below). It then:
//   1. stamps `#<tag>` into every in-repo registryDependencies entry of
//      registry.json and rebuilds r/ from it,
//   2. checks that nothing in either was left unpinned,
//   3. commits that stamped tree (S), then a commit R whose tree is the
//      release commit's again,
//   4. detaches HEAD at S (semantic-release tags HEAD once prepare ends, so
//      the tag lands on S), then pushes R to the release branch, so `main`
//      ends up with the release commit's tree and floats.
//
// S has to sit in main's history: semantic-release finds the last release
// with `git tag --merged <branch>`, and a tag on an off-branch commit would
// be invisible to it. A commit cannot contain its own SHA, so the tag name is
// the self-reference. design-system#65.
//
// Release from a promotion (design-system#179). The release runs on a push to
// `deploy`, which the owner only fast-forwards to a SHA already on `main`, so
// nothing here may ever push to `deploy`: it would stop being a fast-forward of
// main. Two options turn that on:
//   - `releaseFiles` (e.g. CHANGELOG.md, package.json): the plugin commits those
//     files itself, on top of the promoted SHA, instead of @semantic-release/git,
//     which pushes the release branch.
//   - `targetBranch` (e.g. main): where the restore commit lands. `main` may have
//     moved past the promoted SHA, so when the restore commit is not a
//     fast-forward the plugin merges it into the fetched tip of `targetBranch`
//     (a three-way merge of the version bump, refusing a conflict). That keeps the
//     stamped commit S in main's history, which is how semantic-release finds the
//     last release (`git tag --merged`) when the next promotion arrives.

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

  const { releaseFiles } = pluginConfig
  const targetBranch = pluginConfig.targetBranch ?? branch.name
  const ref = nextRelease.gitTag
  const promotedCommit = await git(["rev-parse", "HEAD"])
  const releaseCommit = releaseFiles
    ? await commitReleaseFiles({ git, promotedCommit, releaseFiles, nextRelease })
    : promotedCommit
  const releaseTree = await git(["rev-parse", `${releaseCommit}^{tree}`])

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

  // Detach first (the working tree already holds S's content; staging it lets
  // checkout accept that), so a failure here pushes nothing.
  await git(["add", "--all", "--", "registry.json", "r", ...(releaseFiles ?? [])])
  await git(["checkout", "--detach", stampCommit])
  const landing = await landOnTarget({ git, repositoryUrl: options.repositoryUrl, targetBranch, restoreCommit })
  await git(["push", options.repositoryUrl, `${landing}:refs/heads/${targetBranch}`])
  logger.log("Pinned registryDependencies to %s on %s; %s keeps %s", ref, stampCommit, targetBranch, landing)
}

// The release commit, made on top of the promoted SHA from the files the
// changelog and npm plugins just wrote. Nothing is pushed.
async function commitReleaseFiles({ git, promotedCommit, releaseFiles, nextRelease }) {
  const scratch = await mkdtemp(join(tmpdir(), "release-files-"))
  try {
    const indexEnv = { GIT_INDEX_FILE: join(scratch, "index") }
    await git(["read-tree", promotedCommit], indexEnv)
    await git(["add", "--all", "--", ...releaseFiles], indexEnv)
    const tree = await git(["write-tree"], indexEnv)
    return await git([
      "commit-tree",
      tree,
      "-p",
      promotedCommit,
      "-m",
      `chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}`,
    ])
  } finally {
    await rm(scratch, { recursive: true })
  }
}

// The commit to push to the target branch: the restore commit itself when that
// is a fast-forward, otherwise a merge of it into the target's fetched tip.
async function landOnTarget({ git, repositoryUrl, targetBranch, restoreCommit }) {
  const tracking = "refs/semantic-release-pin/target"
  await git(["fetch", "--quiet", repositoryUrl, `+refs/heads/${targetBranch}:${tracking}`])
  const tip = await git(["rev-parse", tracking])
  const fastForward = await git(["merge-base", "--is-ancestor", tip, restoreCommit]).then(
    () => true,
    () => false,
  )
  if (fastForward) return restoreCommit

  let mergedTree
  try {
    mergedTree = (await git(["merge-tree", "--write-tree", tip, restoreCommit])).split("\n")[0]
  } catch (error) {
    if (error.code === 1) {
      throw new Error(
        `The release's version bump conflicts with ${targetBranch} (${tip}); nothing was pushed.\n${error.stdout ?? ""}`,
      )
    }
    throw error
  }
  return git([
    "commit-tree",
    mergedTree,
    "-p",
    tip,
    "-p",
    restoreCommit,
    "-m",
    "chore(release): restore floating registryDependencies on main [skip ci]",
  ])
}
