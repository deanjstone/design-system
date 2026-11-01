// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// design-system#152, decision 6: a literal-ban check any repo can run in report
// mode for its baseline (decision 10) and then in blocking mode, plus the drift
// and config check of 6b. Each case builds a throwaway git repo, because the
// script scans `git ls-files`.

const root = fileURLToPath(new URL("../", import.meta.url))
const linksJson = join(root, "registry/links/links.json")
const scriptSource = join(root, "registry/links")

let repo: string
let upstream: string

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "link-check-repo-"))
  upstream = mkdtempSync(join(tmpdir(), "link-check-upstream-"))
  execFileSync("git", ["init", "-q", repo])
  copyFileSync(linksJson, join(repo, "links.json"))
  copyFileSync(linksJson, join(upstream, "links.json"))
  mkdirSync(join(repo, "scripts"))
  copyFileSync(join(scriptSource, "link-check.sh"), join(repo, "scripts/link-check.sh"))
  copyFileSync(join(scriptSource, "link-check-config.mjs"), join(repo, "scripts/link-check-config.mjs"))
})
afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
  rmSync(upstream, { recursive: true, force: true })
})

const write = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), text)
}

type Run = { code: number | null; out: string; err: string; counts: Record<string, number> }
function check(args: string[] = [], env: Record<string, string> = {}): Run {
  execFileSync("git", ["add", "-A"], { cwd: repo })
  const result = spawnSync("bash", ["scripts/link-check.sh", ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, LINK_CHECK_REPO: "fixture", LINKS_UPSTREAM: `file://${upstream}/links.json`, ...env },
  })
  const summary = result.stdout.match(/^link-check: summary (\S+) (.*)$/m)
  const counts = Object.fromEntries((summary?.[2] ?? "").split(" ").map((pair) => pair.split("=")).map(([k, v]) => [k, Number.isNaN(Number(v)) ? v : Number(v)]))
  return { code: result.status, out: result.stdout, err: result.stderr, counts }
}

describe("literal ban", () => {
  it("passes a repo with no host literals, in both modes", () => {
    write("src/a.ts", "export const x = 1\n")
    expect(check().counts).toMatchObject({ literals: 0, retired: 0, config: 0, drift: 0 })
    expect(check(["--mode", "block"]).code).toBe(0)
  })

  it("flags a myargus.cc literal: report mode exits 0, blocking mode exits 1", () => {
    write("src/a.ts", 'export const home = "https://ops.myargus.cc/plans"\n')
    const report = check()
    expect(report.code).toBe(0)
    expect(report.counts).toMatchObject({ literals: 1, mode: "report" })
    expect(report.out).toContain("link-check: literal src/a.ts:1:")
    const block = check(["--mode", "block"])
    expect(block.code).toBe(1)
    expect(block.counts).toMatchObject({ literals: 1, mode: "block" })
  })

  it("reads the mode from LINK_CHECK_MODE too, and rejects an unknown one", () => {
    write("src/a.ts", 'const x = "myargus.cc"\n')
    expect(check([], { LINK_CHECK_MODE: "block" }).code).toBe(1)
    expect(check(["--mode", "loud"]).code).toBe(2)
  })

  it("flags the tailnet host", () => {
    write("scripts/run.sh", "curl https://homelab.tail00500e.ts.net:3791/health\n")
    expect(check().counts.literals).toBe(1)
  })

  it("counts every matching line", () => {
    write("src/a.ts", 'a("myargus.cc")\nb("x")\nc("budget.myargus.cc")\n')
    expect(check().counts.literals).toBe(2)
  })

  it.each([
    ["markdown", "docs/guide.md", "See https://ops.myargus.cc/"],
    ["mdx", "docs/guide.mdx", "See https://ops.myargus.cc/"],
    ["a test directory", "test/links.ts", "https://ops.myargus.cc/"],
    ["a tests directory", "packages/x/tests/a.ts", "https://ops.myargus.cc/"],
    ["a test file", "src/a.test.ts", "https://ops.myargus.cc/"],
    ["a spec file", "src/a.spec.tsx", "https://ops.myargus.cc/"],
    ["a fixtures directory", "src/__fixtures__/a.json", '{"u":"https://ops.myargus.cc/"}'],
    ["a lockfile", "pnpm-lock.yaml", "resolution: myargus.cc"],
    ["a changelog", "CHANGELOG.md", "myargus.cc"],
    ["wrangler config", "workers/a/wrangler.toml", 'pattern = "api.myargus.cc/watchtower/*"'],
    ["a Pages _redirects file", "public/_redirects", "/old https://ops.myargus.cc/ 301"],
    ["a vendored file", "src/lib/links.ts", "// link-check:vendored\nexport const REGISTRY = 'myargus.cc'"],
  ])("exempts %s", (_name, path, text) => {
    write(path, `${text}\n`)
    expect(check().counts.literals).toBe(0)
  })

  it("honours .link-check-ignore globs", () => {
    write("generated/out.js", 'var u = "https://ops.myargus.cc/"\n')
    write("src/b.ts", 'var u = "https://ops.myargus.cc/"\n')
    write(".link-check-ignore", "# generated output\ngenerated/**\n")
    const run = check()
    expect(run.counts.literals).toBe(1)
    expect(run.out).toContain("src/b.ts")
    expect(run.out).not.toContain("generated/out.js")
  })

  it("flags the domain inside a longer string too", () => {
    write("src/a.ts", 'const x = "notmyargus.cc.example"\n')
    expect(check().counts.literals).toBe(1)
  })
})

describe("retired hosts", () => {
  it("fails on a reference to a retired host, and counts it apart from literals", () => {
    write("src/a.ts", 'fetch("https://read.myargus.cc/x")\nfetch("https://api.read.myargus.cc/y")\nfetch("https://thread.myargus.cc/")\n')
    const run = check()
    expect(run.counts).toMatchObject({ literals: 3, retired: 2 })
    expect(run.out).toContain("link-check: retired src/a.ts:1:")
    expect(run.out).toContain("link-check: retired src/a.ts:2:")
    expect(run.out).not.toContain("link-check: retired src/a.ts:3:")
    expect(check(["--mode", "block"]).code).toBe(1)
  })

  it("lets markdown and test fixtures mention one", () => {
    write("docs/history.md", "read.myargus.cc is retired")
    write("test/a.test.ts", "'edms.myargus.cc'")
    expect(check().counts.retired).toBe(0)
  })
})

describe("vendored registry drift", () => {
  const current = JSON.parse(readFileSync(linksJson, "utf8")).revision as number
  const bump = (dir: string, revision: number, extra: Record<string, unknown> = {}) => {
    const data = JSON.parse(readFileSync(join(dir, "links.json"), "utf8"))
    writeFileSync(join(dir, "links.json"), JSON.stringify({ ...data, revision, ...extra }))
  }

  it("is clean when the vendored copy equals design-system's", () => {
    expect(check().counts.drift).toBe(0)
  })

  it("fails when the vendored copy is behind", () => {
    bump(upstream, current + 1)
    const run = check()
    expect(run.counts.drift).toBe(1)
    expect(run.out).toMatch(new RegExp(`link-check: drift .*revision ${current}.*revision ${current + 1}`))
    expect(check(["--mode", "block"]).code).toBe(1)
  })

  it("fails when the same revision holds different content", () => {
    bump(upstream, current, { domain: "example.org" })
    expect(check().counts.drift).toBe(1)
  })

  it("passes when the vendored copy is ahead", () => {
    bump(repo, current + 2)
    expect(check().counts.drift).toBe(0)
  })

  it("says so, without failing, when design-system cannot be reached", () => {
    const run = check(["--mode", "block"], { LINKS_UPSTREAM: `file://${upstream}/missing.json` })
    expect(run.code).toBe(0)
    expect(run.out).toContain("link-check: drift skipped")
  })

  it("stops with usage when no vendored links.json can be found", () => {
    rmSync(join(repo, "links.json"))
    const run = check()
    expect(run.code).toBe(2)
    expect(run.err).toMatch(/links\.json/)
  })
})

describe("config checks (decision 6b)", () => {
  it("accepts a Vite base, router basename and manifest that match the registry", () => {
    write("apps/reader/vite.config.ts", "export default { base: '/reader/' }\n")
    write("apps/reader/src/main.tsx", "<BrowserRouter basename=\"/reader\" />\n")
    write("apps/reader/public/manifest.webmanifest", JSON.stringify({ start_url: "/reader/", scope: "/reader/" }))
    write("apps/ops/public/manifest.webmanifest", JSON.stringify({ start_url: "/", scope: "/" }))
    write("workers/watchtower/wrangler.toml", 'routes = [{ pattern = "api.myargus.cc/watchtower/*", zone_name = "myargus.cc" }]\n')
    expect(check().counts.config).toBe(0)
  })

  it("flags a Vite base the registry does not list", () => {
    write("apps/x/vite.config.ts", "export default { base: '/nope/' }\n")
    const run = check()
    expect(run.counts.config).toBe(1)
    expect(run.out).toContain("link-check: config apps/x/vite.config.ts:")
    expect(run.out).toContain("/nope/")
  })

  it("flags a router basename the registry does not list", () => {
    write("apps/x/src/main.tsx", "createBrowserRouter(routes, { basename: '/zzz' })\n")
    expect(check().counts.config).toBe(1)
  })

  it("flags a manifest start_url outside its scope, or at an unlisted root", () => {
    write("a/manifest.webmanifest", JSON.stringify({ start_url: "/reader/", scope: "/knowledge/" }))
    write("b/manifest.json", JSON.stringify({ start_url: "/nope/", scope: "/nope/" }))
    expect(check().counts.config).toBe(3)
  })

  it("leaves a package manifest and a manifest with no start_url alone", () => {
    write("package.json", JSON.stringify({ name: "x" }))
    write("ecosystem/manifest.json", JSON.stringify({ entries: [] }))
    expect(check().counts.config).toBe(0)
  })

  it("flags a wrangler route on an unlisted or retired host, or off the registered path", () => {
    write("workers/a/wrangler.toml", 'route = "unlisted.myargus.cc/*"\n')
    write("workers/b/wrangler.jsonc", '{ "routes": [{ "pattern": "api.read.myargus.cc/*", "zone_name": "myargus.cc" }] }\n')
    write("workers/c/wrangler.toml", 'routes = [{ pattern = "api.myargus.cc/unlisted/*", zone_name = "myargus.cc" }]\n')
    const run = check()
    expect(run.counts.config).toBe(3)
    expect(run.out).toMatch(/config workers\/b\/wrangler\.jsonc:\d+: .*retired/)
  })

  it("flags a _redirects target on a retired host", () => {
    write("public/_redirects", "/old https://edms.myargus.cc/ 301\n/ok https://ops.myargus.cc/ 301\n")
    const run = check()
    expect(run.counts.config).toBe(1)
    expect(run.out).toContain("public/_redirects")
  })

  it("accepts an MCP route at either its current host or its moveTo target", () => {
    write("workers/m/wrangler.toml", 'routes = [{ pattern = "mcp.myargus.cc/memory/*", zone_name = "myargus.cc" }, { pattern = "memory.myargus.cc/*", zone_name = "myargus.cc" }]\n')
    expect(check().counts.config).toBe(0)
  })
})

describe("report", () => {
  it("prints one summary line naming the repo", () => {
    write("src/a.ts", '"myargus.cc"\n')
    const run = check()
    expect(run.out).toMatch(/^link-check: summary fixture literals=1 retired=0 config=0 drift=0 mode=report$/m)
  })

  it("falls back to the directory name when the repo has no origin", () => {
    const run = check([], { LINK_CHECK_REPO: "" })
    expect(run.out).toMatch(/^link-check: summary link-check-repo-\S+ /m)
  })
})

describe("the shipped workflow", () => {
  const workflow = readFileSync(join(scriptSource, "link-check.yml"), "utf8")

  it("starts in report mode and runs the shipped script", () => {
    expect(workflow).toMatch(/^\s+LINK_CHECK_MODE: report$/m)
    expect(workflow).toContain("bash scripts/link-check.sh")
  })

  it("runs on pull requests and on pushes to main", () => {
    expect(workflow).toMatch(/^on:\n\s+pull_request:/m)
    expect(workflow).toMatch(/push:\n\s+branches: \[main\]/)
  })

  it("carries the vendored marker in every shipped file", () => {
    for (const file of ["link-check.sh", "link-check-config.mjs", "link-check.yml", "links.json", "links.sh"]) {
      const head = readFileSync(join(scriptSource, file), "utf8").split("\n").slice(0, 10).join("\n")
      expect(head, file).toContain("link-check:vendored")
    }
  })
})
