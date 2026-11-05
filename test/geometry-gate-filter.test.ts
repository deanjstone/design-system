// @vitest-environment node

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// design-system#184: the Curve geometry gate takes ~4.5 minutes and its inputs
// change rarely, so test.yml runs it only when a file it reads changed. These tests
// pin the changed-files check that decides it, and the workflow wiring around it.

const root = fileURLToPath(new URL("..", import.meta.url))
const script = join(root, "scripts/ci/geometry-inputs-changed.sh")
const read = (path: string) => readFileSync(join(root, path), "utf8")

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } }).trim()

let repo: string

const commit = (files: Record<string, string>, message: string) => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), content)
  }
  git(repo, "add", "-A")
  git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", message)
  return git(repo, "rev-parse", "HEAD")
}

const decide = (base: string, head: string, event = "push", ref = "refs/heads/main") =>
  execFileSync("bash", [script, base, head], { cwd: repo, encoding: "utf8", env: { ...process.env, GITHUB_EVENT_NAME: event, GITHUB_REF: ref } }).trim()

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "geometry-filter-"))
  git(repo, "init", "-q", "-b", "main")
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe("geometry-inputs-changed.sh", () => {
  it("is false when only files the gate never reads changed", () => {
    const base = commit({ "README.md": "a", "test/foo.test.ts": "a", "docs/x.md": "a" }, "base")
    const head = commit({ "README.md": "b", "docs/x.md": "b", "test/foo.test.ts": "b" }, "docs only")
    expect(decide(base, head)).toBe("geometry=false")
  })

  it.each([
    "registry/base-nova/ui/button.tsx",
    "theme/tokens.css",
    "scripts/geometry-gate/run.mjs",
    "scripts/geometry-gate/aria/dialog.yml",
    "package.json",
    "pnpm-lock.yaml",
    ".github/workflows/test.yml",
    ".github/actions/host-pnpm/action.yml",
    "scripts/ci/geometry-inputs-changed.sh",
  ])("is true when %s changed", (path) => {
    const base = commit({ "README.md": "a", [path]: "a" }, "base")
    const head = commit({ [path]: "b" }, "touch input")
    expect(decide(base, head)).toBe("geometry=true")
  })

  it("is true when an input was deleted", () => {
    const base = commit({ "registry/lib/utils.ts": "a", "README.md": "a" }, "base")
    git(repo, "rm", "-q", "registry/lib/utils.ts")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "delete")
    expect(decide(base, git(repo, "rev-parse", "HEAD"))).toBe("geometry=true")
  })

  it("looks at every commit in the range, not just the last", () => {
    const base = commit({ "README.md": "a" }, "base")
    commit({ "registry/lib/utils.ts": "a" }, "input")
    const head = commit({ "README.md": "b" }, "docs")
    expect(decide(base, head)).toBe("geometry=true")
  })

  it.each([
    ["an all-zero base (a new branch)", "0000000000000000000000000000000000000000"],
    ["an empty base", ""],
    ["a base the clone does not have", "1234567890123456789012345678901234567890"],
  ])("is true, failing safe, for %s", (_name, base) => {
    commit({ "README.md": "a" }, "base")
    const head = commit({ "README.md": "b" }, "docs only")
    expect(decide(base, head)).toBe("geometry=true")
  })

  it("diffs a pull request against its merge base, so a base that moved on does not count", () => {
    const fork = commit({ "README.md": "a" }, "fork point")
    git(repo, "checkout", "-q", "-b", "pr")
    const head = commit({ "README.md": "b" }, "docs only on the PR")
    git(repo, "checkout", "-q", "main")
    const base = commit({ "registry/lib/utils.ts": "a" }, "input lands on main meanwhile")
    expect(fork).not.toBe(base)
    expect(decide(base, head, "pull_request", "refs/pull/1/merge")).toBe("geometry=false")
  })

  it("is always true on a push to deploy, whatever changed: Release trusts that run", () => {
    const base = commit({ "README.md": "a" }, "base")
    const head = commit({ "README.md": "b" }, "docs only")
    expect(decide(base, head, "push", "refs/heads/deploy")).toBe("geometry=true")
  })

  it("is always true when run by hand (workflow_dispatch or schedule)", () => {
    const base = commit({ "README.md": "a" }, "base")
    const head = commit({ "README.md": "b" }, "docs only")
    expect(decide(base, head, "workflow_dispatch")).toBe("geometry=true")
  })
})

describe("test.yml wiring (design-system#184)", () => {
  const workflow = read(".github/workflows/test.yml")
  const geometryJob = workflow.slice(workflow.indexOf("  geometry:"), workflow.indexOf("  lint:"))

  it("has a changes job that runs the filter script with full history", () => {
    expect(workflow).toMatch(/^ {2}changes:/m)
    expect(workflow).toContain("bash scripts/ci/geometry-inputs-changed.sh")
    expect(workflow).toMatch(/fetch-depth: 0/)
    expect(workflow).toMatch(/geometry: \$\{\{ steps\.\w+\.outputs\.geometry \}\}/)
  })

  it("passes the pull request or push range to the script", () => {
    expect(workflow).toContain("github.event.pull_request.base.sha")
    expect(workflow).toContain("github.event.before")
  })

  it("runs the geometry job only when the changes job says so", () => {
    expect(geometryJob).toMatch(/needs: changes/)
    expect(geometryJob).toMatch(/if: needs\.changes\.outputs\.geometry == 'true'/)
  })

  it("leaves the other jobs unconditional", () => {
    const rest = workflow.replace(geometryJob, "")
    expect(rest).not.toMatch(/needs\.changes/)
  })
})

describe.each([".github/workflows/test.yml", ".github/workflows/design.yml"])("concurrency in %s (design-system#184)", (file) => {
  const workflow = read(file)

  it("cancels superseded pull request runs", () => {
    expect(workflow).toMatch(/^concurrency:/m)
    expect(workflow).toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/)
  })

  it("gives each push its own group, so a main or deploy SHA is never cancelled or dropped", () => {
    expect(workflow).toMatch(/group: .*github\.workflow.*github\.event\.pull_request\.number.*github\.sha/)
  })
})
