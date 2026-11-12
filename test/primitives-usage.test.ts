import { describe, expect, it } from "vitest"

import {
  SCALE,
  againstScale,
  classTokens,
  componentsOf,
  countClass,
  cssVariables,
  emptyCounts,
  fingerprint,
  importsOf,
  measureCss,
  measureScript,
  scaleFor,
  toPx,
} from "../docs/audits/primitives-usage/measure.mjs"

// The audit's numbers (docs/audits/2026-11-12-primitives-usage.md) come from these parsers,
// so what each one counts is pinned here.

const THEME = ":root { --radius: 0.625rem; } @theme inline { --text-xs: 0.8125rem; --radius-md: calc(var(--radius) - 2px); --radius-lg: var(--radius); }"
const context = {
  scale: scaleFor(cssVariables(THEME)),
  semanticColours: new Set(["primary", "muted-foreground", "border"]),
  tokenNames: new Set(["--primary", "--safe-b"]),
}

describe("toPx", () => {
  it("reads px, rem, calc over a variable and max()", () => {
    expect(toPx("13px")).toBe(13)
    expect(toPx("0.875rem")).toBe(14)
    expect(toPx("calc(var(--radius) - 2px)", { "--radius": "0.625rem" })).toBe(8)
    expect(toPx("max(1rem,16px)")).toBe(16)
  })

  it("returns null where there is no fixed length", () => {
    expect(toPx("var(--unknown)")).toBeNull()
    expect(toPx("50%")).toBeNull()
  })
})

describe("scaleFor", () => {
  it("lays the app's own steps over Tailwind's defaults", () => {
    expect(context.scale.text.xs).toBe(13)
    expect(context.scale.text.sm).toBe(14)
    expect(context.scale.radius.md).toBe(8)
    expect(context.scale.radius.lg).toBe(10)
  })

  it("takes the first declaration of a variable, the bare :root one", () => {
    expect(cssVariables(":root { --radius: 10px; } [data-theme=ds] { --radius: 12px; }")["--radius"]).toBe("10px")
  })
})

describe("countClass", () => {
  const count = (...tokens: string[]) => {
    const counts = emptyCounts()
    for (const token of tokens) countClass(token, counts, context.scale, context.semanticColours)
    return counts
  }

  it("resolves named steps through the app's scale", () => {
    const counts = count("text-xs", "md:text-sm", "font-medium", "rounded-lg", "px-2.5", "gap-4")
    expect(counts.fontSize).toEqual({ 13: 1, 14: 1 })
    expect(counts.fontWeight).toEqual({ 500: 1 })
    expect(counts.radius).toEqual({ 10: 1 })
    expect(counts.spacing).toEqual({ 10: 1, 16: 1 })
    expect(counts.fontSizeLiteral).toEqual({})
  })

  it("counts an arbitrary literal as hardcoded and as a literal size", () => {
    const counts = count("text-[13px]", "rounded-[10px]", "p-[7px]", "bg-[#fff]", "grid-cols-[1fr_14rem]")
    expect(counts.arbitraryLiteral).toEqual({ text: 1, spacing: 1, size: 0, radius: 1, colour: 1, other: 1 })
    expect(counts.fontSizeLiteral).toEqual({ 13: 1 })
    expect(counts.radiusLiteral).toEqual({ 10: 1 })
  })

  it("does not count a var-backed arbitrary value as hardcoded", () => {
    const counts = count("pb-[var(--safe-b)]", "w-(--anchor-width)", "max-h-[calc(100dvh-var(--safe-t))]")
    expect(counts.arbitraryVarBacked).toBe(3)
    expect(Object.values(counts.arbitraryLiteral).reduce((sum, value) => sum + value, 0)).toBe(0)
  })

  it("tells a semantic colour from a palette colour, and neither from a text size", () => {
    const counts = count("text-muted-foreground", "bg-primary/10", "border-border", "bg-red-500", "text-white", "text-sm")
    expect(counts.semanticColourClasses).toBe(3)
    expect(counts.paletteColourClasses).toBe(2)
  })

  it("records control and row heights between 24 and 64px only", () => {
    expect(count("h-8", "min-h-11", "size-4", "h-96").height).toEqual({ "h:32": 1, "min-h:44": 1 })
  })
})

describe("measureScript", () => {
  it("finds classes after an apostrophe in JSX text, raw colours and inline sizes", () => {
    const source = `
      const Tile = () => <p className="text-[11px] font-semibold">don't lose this</p>
      const Row = () => <div className={cn('flex h-11 px-3', active && "bg-primary")} style={{ fontSize: 13, width: "var(--w)" }} />
      const fill = "#ff0000"
      const tint = { color: "rgb(0 0 0 / 0.5)", edge: "var(--primary)", own: "var(--row-gap)" }
    `
    const counts = measureScript(source, context)
    expect(counts.fontSize).toEqual({ 11: 1, 13: 1 })
    expect(counts.rawColours).toBe(2)
    expect(counts.inlineStyleLiterals).toBe(1)
    expect(counts.inlineStyleVarBacked).toBe(1)
    expect(counts.tokenVarUses).toBe(1)
    expect(counts.localVarUses).toBe(2)
    expect(counts.semanticColourClasses).toBe(1)
  })
})

describe("measureCss", () => {
  it("skips declarations the registry ships and measures the rest", () => {
    const css = ":root { --primary: #0a6f75; --mine: #123456; } .x { color: #fff; font-size: 0.8rem; padding: 6px 12px; border-radius: 9999px; }"
    const counts = measureCss(css, { ...context, registryDeclarations: new Set(["--primary:#0a6f75"]) })
    expect(counts.registryDeclarations).toBe(1)
    expect(counts.localTokenDefinitions).toBe(1)
    expect(counts.rawColours).toBe(1)
    expect(counts.fontSize).toEqual({ 12.8: 1 })
    expect(counts.spacing).toEqual({ 6: 1, 12: 1 })
    expect(counts.radius).toEqual({ full: 1 })
  })
})

describe("againstScale", () => {
  it("splits on-scale, off-scale and neutral", () => {
    expect(againstScale({ 0: 3, 4: 2, 6: 5, full: 1 }, SCALE.spacing)).toEqual({ on: 2, off: 5, neutral: 4, offValues: { 6: 5 } })
  })
})

describe("fingerprint", () => {
  const registry = `"use client"\n\n// Header the CLI drops.\nimport { cn } from "@/lib/utils"\nexport const a = cn(\n  "cn-menu-target relative cn-font-heading text-base",\n  className\n)\n`
  const installed = `import { cn } from "@/lib/utils"\nexport const a = cn("relative text-base", className )\n`

  it("matches a registry source to what the shadcn CLI installs", () => {
    expect(fingerprint(registry, { stripLeadingComment: true })).toBe(fingerprint(installed))
  })

  it("keeps a comment a consumer added as a difference", () => {
    expect(fingerprint(`// @ts-nocheck\n${installed}`)).not.toBe(fingerprint(installed))
  })
})

describe("importsOf and componentsOf", () => {
  it("lists static, re-exported and dynamic specifiers with their lines", () => {
    const source = `import * as React from "react"\nimport {\n  Button,\n} from "@/components/ui/button"\nexport { x } from "./x"\nconst lazy = () => import("./lazy")\n`
    expect(importsOf(source).map((entry) => entry.specifier).sort()).toEqual(["./lazy", "./x", "@/components/ui/button", "react"])
  })

  it("lists declared components", () => {
    const source = `export function StatusBadge() {}\nconst Row = ({ a }) => null\nexport const Tile = memo(function Tile() {})\nfunction helper() {}\n`
    expect(componentsOf(source).map((entry) => entry.name).sort()).toEqual(["Row", "StatusBadge", "Tile"])
  })
})

describe("classTokens", () => {
  it("splits on whitespace and quotes and drops trailing punctuation", () => {
    expect(classTokens(`className="flex h-8"} x='p-2',`)).toEqual(["className=", "flex", "h-8", "x=", "p-2"])
  })
})
