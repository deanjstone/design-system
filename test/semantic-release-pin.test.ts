// @vitest-environment node

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// scripts/release/semantic-release-pin.mjs makes a tag a reproducible pin
// (design-system#65). With design-system#179 the release runs on a push to
// `deploy`, which the owner only ever fast-forwards to a SHA already on main, so
// the plugin must never push to `deploy`. It commits the release files itself
// (no @semantic-release/git, which pushes to the release branch), tags a stamped
// commit S, and lands the version bump on `main` even when main has moved on
// since the promoted SHA. Every case runs against real git repos in a temp dir.

vi.setConfig({ testTimeout: 30_000 })

const root = fileURLToPath(new URL("../", import.meta.url))
const pluginPath = join(root, "scripts/release/semantic-release-pin.mjs")

const identity = {
  GIT_AUTHOR_NAME: "bot",
  GIT_AUTHOR_EMAIL: "bot@example.com",
  GIT_COMMITTER_NAME: "bot",
  GIT_COMMITTER_EMAIL: "bot@example.com",
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: { ...process.env, ...identity } }).trim()

const registry = {
  items: [
    { name: "button", registryDependencies: [] },
    { name: "card", registryDependencies: ["deanjstone/design-system/button", "https://example.com/other.json"] },
  ],
}

let dir: string
let remote: string
let work: string
let racer: string

const write = (cwd: string, file: string, content: string) => writeFileSync(join(cwd, file), content)
const show = (ref: string, file: string) => git(remote, "show", `${ref}:${file}`)

// What `buildCommand` does in CI, reduced to a copy: r/ mirrors registry.json.
const buildCommand = "mkdir -p r && cp registry.json r/registry.json"

const context = (extra: Record<string, unknown> = {}) => ({
  cwd: work,
  env: { ...process.env, ...identity },
  logger: { log: () => {} },
  nextRelease: { gitTag: "v1.1.0", version: "1.1.0", notes: "### Features\n\n* a thing" },
  branch: { name: "deploy" },
  options: { repositoryUrl: remote },
  ...extra,
})

// The files @semantic-release/changelog and /npm leave in the working tree.
const bumpReleaseFiles = () => {
  write(work, "CHANGELOG.md", "# Changelog\n\n## 1.1.0\n")
  write(work, "package.json", `${JSON.stringify({ name: "x", version: "1.1.0" }, null, 2)}\n`)
}

const prepare = async (pluginConfig: Record<string, unknown>) => {
  const { prepare: run } = await import(pluginPath)
  return run({ buildCommand, ...pluginConfig }, context())
}

const releaseFilesConfig = { releaseFiles: ["CHANGELOG.md", "package.json"], targetBranch: "main" }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "release-pin-"))
  remote = join(dir, "remote.git")
  work = join(dir, "work")
  racer = join(dir, "racer")
  git(dir, "init", "-q", "--bare", "-b", "main", remote)
  git(dir, "clone", "-q", remote, work)
  write(work, "registry.json", `${JSON.stringify(registry, null, 2)}\n`)
  write(work, "package.json", `${JSON.stringify({ name: "x", version: "1.0.0" }, null, 2)}\n`)
  write(work, "CHANGELOG.md", "# Changelog\n")
  mkdirSync(join(work, "r"))
  write(work, "r/registry.json", `${JSON.stringify(registry, null, 2)}\n`)
  git(work, "add", "-A")
  git(work, "commit", "-q", "-m", "feat: first")
  git(work, "push", "-q", "origin", "HEAD:main", "HEAD:deploy")
  git(work, "checkout", "-q", "-B", "deploy", "origin/deploy")
  git(dir, "clone", "-q", remote, racer)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("semantic-release-pin: release on the release branch (before #179)", () => {
  it("pushes the floating restore commit to the release branch and leaves HEAD on the stamped commit", async () => {
    // @semantic-release/git has already made the release commit and pushed it.
    git(work, "checkout", "-q", "-B", "main", "origin/main")
    bumpReleaseFiles()
    git(work, "add", "-A")
    git(work, "commit", "-q", "-m", "chore(release): 1.1.0 [skip ci]")
    const { prepare: run } = await import(pluginPath)
    await run({ buildCommand }, context({ branch: { name: "main" } }))

    const head = git(work, "rev-parse", "HEAD")
    expect(git(work, "show", "HEAD:registry.json")).toContain("deanjstone/design-system/button#v1.1.0")
    expect(show("main", "registry.json")).toContain('"deanjstone/design-system/button"')
    expect(git(remote, "merge-base", "--is-ancestor", head, "main")).toBe("")
  })
})

describe("semantic-release-pin: release from a promotion (#179)", () => {
  it("tags a stamped commit, lands the bump on main by fast-forward, and never pushes deploy", async () => {
    const deployBefore = git(remote, "rev-parse", "deploy")
    bumpReleaseFiles()
    await prepare(releaseFilesConfig)

    const stamped = git(work, "rev-parse", "HEAD")
    expect(git(work, "show", "HEAD:registry.json")).toContain("deanjstone/design-system/button#v1.1.0")
    expect(git(work, "show", "HEAD:r/registry.json")).toContain("deanjstone/design-system/button#v1.1.0")
    expect(git(work, "show", "HEAD:CHANGELOG.md")).toContain("## 1.1.0")
    expect(git(work, "log", "-1", "--format=%s", "HEAD")).toMatch(/^chore\(release\): pin registryDependencies to v1\.1\.0/)

    expect(git(remote, "rev-parse", "deploy")).toBe(deployBefore)
    expect(show("main", "registry.json")).not.toContain("#v1.1.0")
    expect(show("main", "CHANGELOG.md")).toContain("## 1.1.0")
    expect(show("main", "package.json")).toContain('"version": "1.1.0"')
    // The tag's commit is in main's history, so the next `git tag --merged` finds it.
    expect(spawnOk(remote, "merge-base", "--is-ancestor", stamped, "main")).toBe(true)
    expect(git(remote, "log", "-1", "--format=%s", "main")).toMatch(/^chore\(release\): restore floating/)
  })

  it("merges the bump onto a main that moved past the promoted SHA, keeping the newer commit", async () => {
    git(racer, "config", "user.email", "agent@example.com")
    git(racer, "config", "user.name", "Agent")
    write(racer, "later.txt", "landed after the promotion\n")
    git(racer, "add", "-A")
    git(racer, "commit", "-q", "-m", "feat: landed after the promotion")
    git(racer, "push", "-q", "origin", "HEAD:main")
    const racerSha = git(racer, "rev-parse", "HEAD")

    bumpReleaseFiles()
    await prepare(releaseFilesConfig)

    const stamped = git(work, "rev-parse", "HEAD")
    expect(show("main", "later.txt")).toContain("landed after the promotion")
    expect(show("main", "CHANGELOG.md")).toContain("## 1.1.0")
    expect(show("main", "registry.json")).not.toContain("#v1.1.0")
    expect(git(remote, "rev-parse", "main^1")).toBe(racerSha)
    expect(spawnOk(remote, "merge-base", "--is-ancestor", stamped, "main")).toBe(true)
    // The stamped commit is the promoted SHA plus the release, not the newer main.
    expect(spawnOk(work, "cat-file", "-e", `${stamped}:later.txt`)).toBe(false)
    expect(git(remote, "log", "-1", "--format=%s", "main")).toMatch(/^chore\(release\): restore floating/)
  })

  it("fails and pushes nothing when main changed the same release file", async () => {
    git(racer, "config", "user.email", "agent@example.com")
    git(racer, "config", "user.name", "Agent")
    write(racer, "CHANGELOG.md", "# Changelog\n\nhand edit\n")
    git(racer, "add", "-A")
    git(racer, "commit", "-q", "-m", "docs: edit the changelog")
    git(racer, "push", "-q", "origin", "HEAD:main")
    const mainBefore = git(remote, "rev-parse", "main")

    bumpReleaseFiles()
    await expect(prepare(releaseFilesConfig)).rejects.toThrow(/conflict/i)
    expect(git(remote, "rev-parse", "main")).toBe(mainBefore)
  })

  it("refuses to publish a tag with an unpinned in-repo dependency, pushing nothing", async () => {
    const mainBefore = git(remote, "rev-parse", "main")
    bumpReleaseFiles()
    await expect(prepare({ ...releaseFilesConfig, buildCommand: "mkdir -p r && echo '{\"name\":\"card\",\"registryDependencies\":[\"deanjstone/design-system/button\"]}' > r/card.json" })).rejects.toThrow(/pin every in-repo/)
    expect(git(remote, "rev-parse", "main")).toBe(mainBefore)
  })
})

function spawnOk(cwd: string, ...args: string[]) {
  try {
    execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore", env: { ...process.env, ...identity } })
    return true
  } catch {
    return false
  }
}
