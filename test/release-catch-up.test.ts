// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// design-system#179. A release runs from `deploy`, which holds only the promoted
// SHA. The previous release's tagged commit lands on `main`, possibly above the
// SHA promoted next, so `git tag --merged` on deploy cannot see it and
// semantic-release would compute the version from an older tag. The catch-up
// script merges the newest tag reachable from main into the LOCAL release
// checkout (never pushed), with the tree unchanged except the cumulative
// CHANGELOG.md, so the release starts from the right version.

vi.setConfig({ testTimeout: 30_000 })

const root = fileURLToPath(new URL("../", import.meta.url))
const script = join(root, "scripts/release/catch-up-release-tags.sh")

const identity = {
  GIT_AUTHOR_NAME: "bot",
  GIT_AUTHOR_EMAIL: "bot@example.com",
  GIT_COMMITTER_NAME: "bot",
  GIT_COMMITTER_EMAIL: "bot@example.com",
}
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: { ...process.env, ...identity } }).trim()

let dir: string
let remote: string
let work: string

const commit = (file: string, content: string, message: string) => {
  writeFileSync(join(work, file), content)
  git(work, "add", "-A")
  git(work, "commit", "-q", "-m", message)
  return git(work, "rev-parse", "HEAD")
}

// A release made the way the plugin makes one: S (tagged, carries the changelog)
// as a child of the promoted SHA, then main takes S in through a merge commit.
const releaseOnto = (promoted: string, version: string, changelog: string) => {
  git(work, "checkout", "-q", "--detach", promoted)
  const stamped = commit("CHANGELOG.md", changelog, `chore(release): pin registryDependencies to v${version} [skip ci]`)
  git(work, "tag", `v${version}`, stamped)
  git(work, "checkout", "-q", "main")
  git(work, "merge", "-q", "--no-ff", "-s", "ours", "-m", `chore(release): restore floating ${version} [skip ci]`, stamped)
  git(work, "push", "-q", "origin", "main", `v${version}`)
}

const run = (env: Record<string, string> = {}) =>
  spawnSync("bash", [script], {
    cwd: work,
    encoding: "utf8",
    env: { ...process.env, ...identity, CATCH_UP_FROM: "main", ...env },
  })

const deployAt = (sha: string) => {
  git(work, "checkout", "-q", "-B", "deploy", sha)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "catch-up-"))
  remote = join(dir, "remote.git")
  work = join(dir, "work")
  git(dir, "init", "-q", "--bare", "-b", "main", remote)
  git(dir, "clone", "-q", remote, work)
  git(work, "checkout", "-q", "-B", "main")
  commit("CHANGELOG.md", "# Changelog\n", "feat: first")
  git(work, "push", "-q", "origin", "main")
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("scripts/release/catch-up-release-tags.sh", () => {
  it("does nothing when no release tag exists yet", () => {
    const head = git(work, "rev-parse", "HEAD")
    deployAt(head)
    const result = run()
    expect(result.status, result.stderr).toBe(0)
    expect(git(work, "rev-parse", "HEAD")).toBe(head)
  })

  it("does nothing when deploy already contains the newest release tag", () => {
    const first = git(work, "rev-parse", "HEAD")
    releaseOnto(first, "1.0.0", "# Changelog\n\n## 1.0.0\n")
    const later = commit("a.txt", "a\n", "feat: after the release")
    git(work, "push", "-q", "origin", "main")
    deployAt(later)
    const result = run()
    expect(result.status, result.stderr).toBe(0)
    expect(git(work, "rev-parse", "HEAD")).toBe(later)
  })

  it("merges the newest tag into a deploy that sits below the release, locally, keeping the tree except the changelog", () => {
    const first = git(work, "rev-parse", "HEAD")
    const promotedNext = commit("a.txt", "a\n", "fix: promoted after the release started")
    git(work, "push", "-q", "origin", "main")
    git(work, "checkout", "-q", "--detach", first)
    releaseOnto(first, "1.0.0", "# Changelog\n\n## 1.0.0\n")
    // main is now: first, promotedNext, merge(release). deploy = promotedNext, below the merge.
    deployAt(promotedNext)
    const remoteMain = git(remote, "rev-parse", "main")

    const result = run()
    expect(result.status, result.stderr).toBe(0)
    expect(git(work, "tag", "--merged", "HEAD", "--list", "v*")).toBe("v1.0.0")
    expect(readFileSync(join(work, "CHANGELOG.md"), "utf8")).toContain("## 1.0.0")
    expect(readFileSync(join(work, "a.txt"), "utf8")).toBe("a\n")
    expect(git(work, "rev-parse", "HEAD^1")).toBe(promotedNext)
    expect(git(work, "log", "-1", "--format=%s")).toMatch(/^chore: catch up/)
    expect(git(remote, "rev-parse", "main")).toBe(remoteMain)
    expect(spawnSync("git", ["-C", remote, "rev-parse", "--verify", "--quiet", "deploy"]).status).not.toBe(0)
  })

  it("takes the newest tag by version, not by name order", () => {
    const first = git(work, "rev-parse", "HEAD")
    releaseOnto(first, "9.0.0", "# Changelog\n\n## 9.0.0\n")
    const mid = git(work, "rev-parse", "main")
    const next = commit("b.txt", "b\n", "feat: more")
    git(work, "push", "-q", "origin", "main")
    releaseOnto(next, "10.0.0", "# Changelog\n\n## 10.0.0\n\n## 9.0.0\n")
    deployAt(first)
    expect(mid).not.toBe("")
    const result = run()
    expect(result.status, result.stderr).toBe(0)
    expect(git(work, "tag", "--merged", "HEAD", "--list", "v*", "--sort=-v:refname").split("\n")[0]).toBe("v10.0.0")
    expect(readFileSync(join(work, "CHANGELOG.md"), "utf8")).toContain("## 10.0.0")
  })

  it("refuses to run without a source branch", () => {
    const result = run({ CATCH_UP_FROM: "" })
    expect(result.status).toBe(2)
  })
})
