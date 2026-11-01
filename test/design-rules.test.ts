// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { checkSource } from "../registry/design-check/design-rules.mjs"

// The safe-area and iPhone rules of the design-check item (design-system#137).
// Every rule has a fixture that must fail and a fixture that must pass.

const root = fileURLToPath(new URL("../", import.meta.url))
const scriptPath = join(root, "registry/design-check/design-rules.mjs")

const rulesFor = (path: string, text: string) => checkSource(path, text).map((finding) => finding.rule)

describe("viewport-height-unit", () => {
  it.each(["min-h-screen", "h-screen", "md:min-h-screen", "sm:h-screen"])("fails %s in a class string", (token) => {
    expect(rulesFor("a.tsx", `export const A = () => <div className="flex ${token} bg-background" />`)).toContain(
      "viewport-height-unit",
    )
  })

  it("passes min-h-app, min-h-dvh and class names that only contain the word", () => {
    expect(
      rulesFor("a.tsx", `<div className="min-h-app min-h-dvh h-screen-safe max-h-dvh" />`),
    ).not.toContain("viewport-height-unit")
  })

  it("fails 100vh in css and in an arbitrary value", () => {
    expect(rulesFor("a.css", ".page { min-height: 100vh; }")).toContain("viewport-height-unit")
    expect(rulesFor("a.tsx", `<div className="min-h-[100vh]" />`)).toContain("viewport-height-unit")
    expect(rulesFor("a.css", ".page { height: calc(100vh - 3rem); }")).toContain("viewport-height-unit")
  })

  it("passes 100dvh and the 100vh fallback the theme's min-h-app utility ships", () => {
    expect(rulesFor("a.css", ".page { min-height: 100dvh; }")).not.toContain("viewport-height-unit")
    const fallback = `.min-h-app {\n  min-height: 100dvh;\n  @supports not (min-height: 100dvh) {\n    min-height: 100vh;\n  }\n}`
    expect(rulesFor("a.css", fallback)).not.toContain("viewport-height-unit")
  })

  it("honours a design-rules-ignore marker on the line or the line above", () => {
    expect(rulesFor("a.css", ".a { min-height: 100vh; /* design-rules-ignore */ }")).toEqual([])
    expect(rulesFor("a.css", "/* design-rules-ignore */\n.a { min-height: 100vh; }")).toEqual([])
  })

  it("reports the line of the finding", () => {
    const [finding] = checkSource("a.css", ".a {\n  color: red;\n  min-height: 100vh;\n}")
    expect(finding).toMatchObject({ rule: "viewport-height-unit", line: 3, file: "a.css" })
  })
})

describe("viewport-fit-cover", () => {
  const head = (content: string) => `<html><head><meta name="viewport" content="${content}"></head></html>`

  it("fails a viewport meta with no viewport-fit=cover", () => {
    expect(rulesFor("index.html", head("width=device-width, initial-scale=1"))).toContain("viewport-fit-cover")
  })

  it("passes a viewport meta with viewport-fit=cover", () => {
    expect(rulesFor("index.html", head("width=device-width, initial-scale=1, viewport-fit=cover"))).toEqual([])
  })

  it("ignores files with no viewport meta", () => {
    expect(rulesFor("partial.html", "<div>no head here</div>")).toEqual([])
  })
})

describe("fixed-without-safe-edge", () => {
  it("fails a fixed element placed with plain offsets", () => {
    expect(rulesFor("a.tsx", `<button className="fixed right-4 bottom-4 size-12" />`)).toContain(
      "fixed-without-safe-edge",
    )
    expect(rulesFor("a.tsx", `<nav className="md:fixed inset-x-0 bottom-0 h-16" />`)).toContain(
      "fixed-without-safe-edge",
    )
  })

  it("passes a fixed element with a max(…env…) edge, a design-system edge utility or a full-bleed inset", () => {
    for (const className of [
      "fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-4",
      "fixed inset-corner-br size-12",
      "fixed inset-x-0 bottom-0 pb-edge px-edge",
      "fixed inset-x-0 top-0 pt-safe",
      "fixed inset-0 bg-black/40",
    ]) {
      expect(rulesFor("a.tsx", `<div className="${className}" />`), className).not.toContain("fixed-without-safe-edge")
    }
  })

  it("ignores prose that only contains the word", () => {
    expect(rulesFor("a.tsx", `const note = "a fixed price"`)).toEqual([])
  })

  it("fails position: fixed in css without an env edge and passes it with one", () => {
    expect(rulesFor("a.css", ".fab { position: fixed; right: 1rem; bottom: 1rem; }")).toContain("fixed-without-safe-edge")
    expect(
      rulesFor("a.css", ".fab { position: fixed; right: max(1.3rem, env(safe-area-inset-right)); bottom: max(0.5rem, env(safe-area-inset-bottom)); }"),
    ).not.toContain("fixed-without-safe-edge")
    expect(rulesFor("a.css", ".fab { position: fixed; right: var(--edge-r); bottom: var(--edge-b); }")).not.toContain(
      "fixed-without-safe-edge",
    )
    expect(rulesFor("a.css", ".scrim { position: fixed; inset: 0; }")).not.toContain("fixed-without-safe-edge")
  })
})

describe("side-inset-without-floor", () => {
  it("fails env(safe-area-inset-left|right) used with no max() floor", () => {
    expect(rulesFor("a.css", ".a { padding-left: env(safe-area-inset-left); }")).toContain("side-inset-without-floor")
    expect(rulesFor("a.css", ".a { margin-right: env(safe-area-inset-right, 0px); }")).toContain(
      "side-inset-without-floor",
    )
    expect(rulesFor("a.tsx", `<div className="pl-[env(safe-area-inset-left)]" />`)).toContain("side-inset-without-floor")
  })

  it("fails a max() whose only floor is zero, the pl-safe pattern", () => {
    expect(rulesFor("a.css", ".a { padding-left: max(env(safe-area-inset-left), 0px); }")).toContain(
      "side-inset-without-floor",
    )
    expect(rulesFor("a.css", ".a { padding-right: max(0, env(safe-area-inset-right)); }")).toContain(
      "side-inset-without-floor",
    )
  })

  it("fails the pl-safe, pr-safe and px-safe utilities", () => {
    for (const token of ["pl-safe", "pr-safe", "px-safe", "md:pl-safe"]) {
      expect(rulesFor("a.tsx", `<div className="flex ${token}" />`), token).toContain("side-inset-without-floor")
    }
  })

  it("passes a real floor on either side of the comma", () => {
    expect(rulesFor("a.css", ".a { padding-left: max(1rem, env(safe-area-inset-left)); }")).toEqual([])
    expect(rulesFor("a.css", ".a { padding-left: max(env(safe-area-inset-left), var(--gutter)); }")).toEqual([])
    expect(rulesFor("a.tsx", `<div className="pl-[max(1rem,env(safe-area-inset-left))]" />`)).toEqual([])
  })

  it("lets a custom property define a token from the bare inset", () => {
    expect(rulesFor("a.css", ":root { --safe-l: env(safe-area-inset-left, 0px); }")).toEqual([])
  })

  it("does not flag the theme's own pl-safe and pr-safe definitions", () => {
    const definitions = "@utility pl-safe {\n  padding-left: max(env(safe-area-inset-left), 0px);\n}\n@utility pr-safe {\n  padding-right: max(env(safe-area-inset-right), 0px);\n}"
    expect(rulesFor("app.css", definitions)).toEqual([])
  })

  it("leaves top and bottom insets to their own utilities", () => {
    expect(rulesFor("a.css", ".a { padding-top: env(safe-area-inset-top); }")).toEqual([])
    expect(rulesFor("a.tsx", `<div className="pt-safe pb-safe" />`)).toEqual([])
  })
})

describe("form-text-under-16", () => {
  it("fails a form control that drops under 16px at any breakpoint", () => {
    expect(rulesFor("a.tsx", `<input className="h-11 text-base md:text-sm" />`)).toContain("form-text-under-16")
    expect(rulesFor("a.tsx", `<Input className="text-sm" />`)).toContain("form-text-under-16")
    expect(rulesFor("a.tsx", `<textarea className="text-xs" />`)).toContain("form-text-under-16")
    expect(rulesFor("a.tsx", `<select className="lg:text-[13px]" />`)).toContain("form-text-under-16")
  })

  it("passes a form control at 16px or larger, and small text on other elements", () => {
    expect(rulesFor("a.tsx", `<input className="h-11 text-base" />`)).toEqual([])
    expect(rulesFor("a.tsx", `<Input className="text-lg" />`)).toEqual([])
    expect(rulesFor("a.tsx", `<p className="text-sm text-muted-foreground" />`)).toEqual([])
  })

  it("does not read past the end of the tag", () => {
    expect(rulesFor("a.tsx", `<><input className="text-base" /><p className="text-sm" /></>`)).toEqual([])
  })
})

describe("focus-ring-alpha-only", () => {
  it("fails a focus indicator that is only a translucent ring", () => {
    expect(rulesFor("a.tsx", `<a className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />`)).toContain(
      "focus-ring-alpha-only",
    )
  })

  it("passes a translucent ring beside a solid outline or border", () => {
    for (const className of [
      "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-2 focus-visible:outline-ring",
      "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
      "focus-visible:ring-2 focus-visible:ring-ring",
    ]) {
      expect(rulesFor("a.tsx", `<a className="${className}" />`), className).not.toContain("focus-ring-alpha-only")
    }
  })
})

describe("the command line", () => {
  let repo: string
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()
  const write = (path: string, text: string) => {
    mkdirSync(join(repo, path, ".."), { recursive: true })
    writeFileSync(join(repo, path), text)
  }

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "design-rules-"))
    git("init", "-q", "-b", "main")
    git("config", "user.email", "t@example.com")
    git("config", "user.name", "t")
    write("README.md", "base\n")
    git("add", "-A")
    git("commit", "-q", "-m", "base")
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  const run = (...args: string[]) => spawnSync("node", [scriptPath, ...args], { cwd: repo, encoding: "utf8" })

  it("exits 1 and names file, line and rule for a changed file with a finding", () => {
    const base = git("rev-parse", "HEAD")
    write("src/page.tsx", `export const A = () => (\n  <div className="min-h-screen" />\n)\n`)
    git("add", "-A")
    git("commit", "-q", "-m", "page")
    const result = run(base)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain("src/page.tsx:2")
    expect(result.stdout).toContain("viewport-height-unit")
  })

  it("exits 0 when the changed files are clean", () => {
    const base = git("rev-parse", "HEAD")
    write("src/page.tsx", `export const A = () => <div className="min-h-app" />\n`)
    git("add", "-A")
    git("commit", "-q", "-m", "page")
    const result = run(base)
    expect(result.status).toBe(0)
  })

  it("skips the registry-owned ui directory", () => {
    const base = git("rev-parse", "HEAD")
    write("components.json", JSON.stringify({ aliases: { ui: "@/components/ui" } }))
    write("components/ui/shell.tsx", `export const A = () => <div className="min-h-screen" />\n`)
    git("add", "-A")
    git("commit", "-q", "-m", "ui")
    expect(run(base).status).toBe(0)
  })

  it("does not scan files the change left alone", () => {
    write("src/old.tsx", `export const A = () => <div className="min-h-screen" />\n`)
    git("add", "-A")
    git("commit", "-q", "-m", "old")
    const base = git("rev-parse", "HEAD")
    write("src/new.tsx", `export const B = () => <div className="min-h-app" />\n`)
    git("add", "-A")
    git("commit", "-q", "-m", "new")
    expect(run(base).status).toBe(0)
  })

  it("exits 2 on a usage error", () => {
    expect(run().status).toBe(2)
  })
})
