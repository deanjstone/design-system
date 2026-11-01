// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// scripts/check.sh runs the three CI checks before a push (argus-config#1013,
// #1015). pnpm and npx are stubs on PATH inside a throwaway git repo: no
// network, no real scan. Each stub appends its arguments to calls.txt and exits
// with the status the test picks.

const root = fileURLToPath(new URL("../", import.meta.url))
const scriptSource = join(root, "scripts/check.sh")

let repo: string
let bin: string

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()

const stub = (name: string, body: string) => {
  writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`)
  chmodSync(join(bin, name), 0o755)
}

// pnpm and the impeccable call exit with STUB_FAIL_<step> when set; the shadcn
// build call writes STUB_BUILD_WRITES (a path under the repo) when set.
const installStubs = () => {
  stub("pnpm", `echo "pnpm $*" >> "$CALLS"\n[ -z "\${STUB_FAIL_TEST:-}" ] || exit 1`)
  stub(
    "npx",
    `echo "npx $*" >> "$CALLS"
case "$*" in
  *impeccable*) [ -z "\${STUB_FAIL_DETECT:-}" ] || exit 1 ;;
  *shadcn*) [ -z "\${STUB_BUILD_WRITES:-}" ] || echo regenerated > "$STUB_BUILD_WRITES" ;;
esac`,
  )
}

const run = (env: Record<string, string> = {}) =>
  spawnSync("bash", ["scripts/check.sh"], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: join(bin, "calls.txt"), ...env },
  })

const calls = () => {
  try {
    return readFileSync(join(bin, "calls.txt"), "utf8").trim().split("\n")
  } catch {
    return []
  }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "check-script-repo-"))
  bin = mkdtempSync(join(tmpdir(), "check-script-bin-"))
  git("init", "-q", "-b", "main")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
  mkdirSync(join(repo, "scripts"))
  copyFileSync(scriptSource, join(repo, "scripts/check.sh"))
  mkdirSync(join(repo, "r"))
  writeFileSync(join(repo, "r/item.json"), "committed\n")
  git("add", "-A")
  git("commit", "-q", "-m", "init")
  installStubs()
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
  rmSync(bin, { recursive: true, force: true })
})

describe("scripts/check.sh", () => {
  it("runs test, detect and build in order, then prints one pass line with the short sha", () => {
    const result = run()
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(`check: pass ${git("rev-parse", "--short", "HEAD")}`)
    expect(calls()).toEqual([
      "pnpm test",
      expect.stringMatching(/^npx --yes impeccable@\S+ detect registry\/ theme\/$/),
      expect.stringMatching(/^npx --yes shadcn@\S+ build --output \.\/r$/),
    ])
  })

  it("fails on step 1 and stops when the tests fail", () => {
    const result = run({ STUB_FAIL_TEST: "1" })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("FAIL at step 1/3 (pnpm test)")
    expect(result.stdout).not.toContain("check: pass")
    expect(calls()).toEqual(["pnpm test"])
  })

  it("fails on step 2 and stops when the detector fails", () => {
    const result = run({ STUB_FAIL_DETECT: "1" })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("FAIL at step 2/3 (impeccable detect")
    expect(calls()).toHaveLength(2)
  })

  it("fails on step 3 when the build changes a tracked r/ file", () => {
    const result = run({ STUB_BUILD_WRITES: join(repo, "r/item.json") })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("FAIL at step 3/3 (r/ is out of date")
    expect(result.stdout).not.toContain("check: pass")
  })

  it("fails on step 3 when the build creates a new, untracked r/ file", () => {
    const result = run({ STUB_BUILD_WRITES: join(repo, "r/new-item.json") })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("FAIL at step 3/3 (r/ is out of date")
  })

  it("passes when the build rewrites r/ with identical bytes", () => {
    writeFileSync(join(repo, "r/item.json"), "regenerated\n")
    git("add", "-A")
    git("commit", "-q", "-m", "regenerate")
    const result = run({ STUB_BUILD_WRITES: join(repo, "r/item.json") })
    expect(result.status).toBe(0)
  })
})

// The script's pins must equal the CI jobs it mirrors, or a green local check
// says nothing about CI. A bump has to land in all places in one commit.
describe("pins match CI", () => {
  const read = (path: string) => readFileSync(join(root, path), "utf8")
  const script = read("scripts/check.sh")
  const design = read(".github/workflows/design.yml")
  const pkg = read("package.json")

  const scriptPin = (name: string) => script.match(new RegExp(`^${name}=(\\S+)$`, "m"))?.[1]

  it("impeccable version equals design.yml's", () => {
    const ci = design.match(/npx --yes impeccable@(\S+) detect registry\/ theme\//)?.[1]
    expect(ci).toBeDefined()
    expect(scriptPin("IMPECCABLE_VERSION")).toBe(ci)
  })

  it("shadcn version equals design.yml's build step and package.json's build:theme", () => {
    const ci = design.match(/npx --yes shadcn@(\S+) build --output \.\/r/)?.[1]
    expect(ci).toBeDefined()
    expect(scriptPin("SHADCN_VERSION")).toBe(ci)
    expect(pkg).toContain(`npx shadcn@${ci} build --output ./r`)
  })

  it("test step is the same command test.yml runs", () => {
    expect(read(".github/workflows/test.yml")).toMatch(/run: pnpm test$/m)
    expect(script).toMatch(/^pnpm test \|\| /m)
  })

  it("is wired as pnpm check", () => {
    expect(JSON.parse(pkg).scripts.check).toBe("bash scripts/check.sh")
  })
})
