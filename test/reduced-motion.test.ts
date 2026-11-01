// @vitest-environment node

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { compile } from "tailwindcss"
import { describe, expect, it } from "vitest"

// Reduced motion (design-system#147). Each component's classes are run through the
// real Tailwind compiler, so these assert on the CSS a consumer receives: under
// `prefers-reduced-motion: reduce` the looping spinner and skeleton stop, and the
// sheet and drawer fade instead of sliding. The rendered proof is
// scripts/verify-reduced-motion.mjs (document.getAnimations() under emulateMedia).

const require = createRequire(import.meta.url)
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const candidatesOf = (source: string) => [...new Set(source.split(/["'`\s{}()<>=,;]+/).filter((token) => token.length > 1))]

const compileUtilities = async (...paths: string[]) => {
  const loadStylesheet = async (id: string, base: string) => {
    const file = id === "tailwindcss" ? require.resolve("tailwindcss/index.css") : require.resolve(id.startsWith("tailwindcss/") ? id : id, { paths: [base] })
    return { path: file, base: dirname(file), content: readFileSync(file, "utf8") }
  }
  const compiler = await compile('@import "tailwindcss";', { base: process.cwd(), loadStylesheet })
  return compiler.build(paths.flatMap((path) => candidatesOf(read(path))))
}

const reduceBlock = (css: string) => {
  const blocks: string[] = []
  let index = css.indexOf("@media (prefers-reduced-motion: reduce)")
  while (index !== -1) {
    let depth = 0
    let end = css.indexOf("{", index)
    for (let cursor = end; cursor < css.length; cursor++) {
      if (css[cursor] === "{") depth++
      if (css[cursor] === "}" && --depth === 0) {
        end = cursor
        break
      }
    }
    blocks.push(css.slice(index, end + 1))
    index = css.indexOf("@media (prefers-reduced-motion: reduce)", end)
  }
  return blocks.join("\n")
}

describe("looping indicators", () => {
  it.each([
    ["spinner", "../registry/base-nova/ui/spinner.tsx", ".animate-spin"],
    ["skeleton", "../registry/base-nova/ui/skeleton.tsx", ".animate-pulse"],
    ["sonner loading icon", "../registry/base-nova/ui/sonner.tsx", ".animate-spin"],
  ])("stops the %s under reduce", async (_name, path, utility) => {
    const css = await compileUtilities(path)
    const reduced = reduceBlock(css)
    expect(reduced).toContain("animation: none")
    expect(css).toContain(utility)
    expect(read(path)).toMatch(/motion-reduce:animate-none/)
  })
})

describe("sheet and drawer", () => {
  it("drops the sheet slide under reduce and keeps the opacity fade", async () => {
    const reduced = reduceBlock(await compileUtilities("../registry/base-nova/ui/sheet.tsx"))
    expect(reduced).toMatch(/data-starting-style[\s\S]*?translate: none !important/)
    expect(reduced).toMatch(/data-ending-style[\s\S]*?translate: none !important/)
    expect(read("../registry/base-nova/ui/sheet.tsx")).toContain("data-starting-style:opacity-0")
  })

  it("replaces the drawer slide with a fade under reduce", async () => {
    const reduced = reduceBlock(await compileUtilities("../registry/base-nova/ui/drawer.tsx"))
    expect(reduced).toMatch(/data-starting-style[\s\S]*?transform: none !important/)
    expect(reduced).toMatch(/data-ending-style[\s\S]*?transform: none !important/)
    expect(reduced).toMatch(/data-starting-style[\s\S]*?opacity: 0% !important/)
    expect(reduced).toMatch(/data-ending-style[\s\S]*?opacity: 0% !important/)
  })
})
