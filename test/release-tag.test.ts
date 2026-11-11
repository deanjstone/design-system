// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// design-system#203 (argus-config#1259): the Release tags the promoted SHA on `deploy` and
// pushes no commit anywhere. This runs the real semantic-release, with the repo's own
// .releaserc.json minus the GitHub plugin (no network, no token), against a bare local
// remote whose `main` and `deploy` are what the owner's promotion leaves. The old stamp
// and restore release made two commits, tagged one that `deploy` never held, and pushed
// the other to `main`; every case here fails against it.

vi.setConfig({ testTimeout: 60_000 })

const root = fileURLToPath(new URL("../", import.meta.url))
const semanticRelease = join(root, "node_modules/.bin/semantic-release")

const identity = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
}

let dir: string
let remote: string
let work: string

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: { ...process.env, ...identity } }).trim()

const commit = (message: string) => {
  writeFileSync(join(work, "f.txt"), `${message}\n${Math.random()}\n`)
  git(work, "add", "-A")
  git(work, "commit", "-q", "-m", message)
  return git(work, "rev-parse", "HEAD")
}

// The owner's promotion: deploy fast-forwarded to a SHA already on main.
const promote = (sha: string) => git(work, "push", "-q", "origin", `${sha}:refs/heads/deploy`)

const release = () => {
  const config = JSON.parse(readFileSync(join(root, ".releaserc.json"), "utf8")) as { plugins: string[] }
  const configPath = join(dir, "releaserc.json")
  writeFileSync(
    configPath,
    JSON.stringify({ ...config, plugins: config.plugins.filter((plugin) => plugin !== "@semantic-release/github") }),
  )
  git(work, "fetch", "-q", "origin", "deploy")
  git(work, "checkout", "-q", "-B", "deploy", "origin/deploy")
  return spawnSync(semanticRelease, ["--no-ci", "--extends", configPath, "--repository-url", `file://${remote}`], {
    cwd: work,
    encoding: "utf8",
    env: { ...process.env, ...identity, GITHUB_ACTIONS: "", CI: "" },
  })
}

const remoteHeads = () => git(remote, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads")
const remoteTags = () => git(remote, "tag", "--list", "v*").split("\n").filter(Boolean)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "release-tag-"))
  remote = join(dir, "remote.git")
  work = join(dir, "work")
  git(dir, "init", "-q", "--bare", "-b", "main", remote)
  git(dir, "clone", "-q", remote, work)
  git(work, "checkout", "-q", "-B", "main")
  commit("feat: first")
  git(work, "push", "-q", "origin", "main")
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("the release tags the promoted SHA and pushes nothing", () => {
  it("a feat promotion gets a version whose tag is the promoted SHA, on deploy", () => {
    const promoted = commit("feat: add a block")
    git(work, "push", "-q", "origin", "main")
    promote(promoted)
    const before = remoteHeads()

    const result = release()
    expect(result.status, result.stdout + result.stderr).toBe(0)

    expect(remoteTags()).toEqual(["v1.0.0"])
    expect(git(remote, "rev-parse", "v1.0.0^{commit}")).toBe(promoted)
    expect(git(remote, "merge-base", "--is-ancestor", "v1.0.0", "deploy")).toBe("")
    expect(remoteHeads()).toBe(before)
  })

  it("leaves main and deploy exactly where they were, with no bot commit anywhere", () => {
    const promoted = commit("fix: a bug")
    git(work, "push", "-q", "origin", "main")
    promote(promoted)
    const commitsBefore = git(remote, "rev-list", "--count", "--branches")

    expect(release().status).toBe(0)

    // semantic-release also records the channel in a `refs/notes/semantic-release-*` ref, which is
    // no branch: every branch holds the same commits as before.
    expect(git(remote, "rev-list", "--count", "--branches")).toBe(commitsBefore)
    expect(git(remote, "log", "--branches", "--format=%s", "--grep=^chore(release)")).toBe("")
  })

  it("a second promotion is versioned from the first tag, which deploy holds", () => {
    const first = commit("feat: one")
    git(work, "push", "-q", "origin", "main")
    promote(first)
    expect(release().status).toBe(0)

    const second = commit("fix: two")
    git(work, "push", "-q", "origin", "main")
    promote(second)
    const result = release()
    expect(result.status, result.stdout + result.stderr).toBe(0)

    expect(remoteTags()).toEqual(["v1.0.0", "v1.0.1"])
    expect(git(remote, "rev-parse", "v1.0.1^{commit}")).toBe(second)
    expect(git(remote, "merge-base", "--is-ancestor", "v1.0.1", "deploy")).toBe("")
  })

  it("a chore-only promotion yields no version", () => {
    const first = commit("feat: one")
    git(work, "push", "-q", "origin", "main")
    promote(first)
    expect(release().status).toBe(0)

    const chore = commit("chore: tidy")
    git(work, "push", "-q", "origin", "main")
    promote(chore)
    const before = remoteHeads()
    const result = release()

    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(remoteTags()).toEqual(["v1.0.0"])
    expect(remoteHeads()).toBe(before)
  })
})
