// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// file-diff is listed in registry.json (design-system#205): the flag that publishes it. Its source files
// must exist, and what they import must be declared, or a consumer's install breaks.

const root = fileURLToPath(new URL("..", import.meta.url))
const registry = JSON.parse(readFileSync(`${root}registry.json`, "utf8"))
const find = (name: string) => registry.items.find((entry: { name: string }) => entry.name === name)
const block = find("file-diff")
const core = find("diff-core")

describe("file-diff registry entry", () => {
  it("is listed as a block, and its parser as a lib", () => {
    expect(block?.type).toBe("registry:block")
    expect(core?.type).toBe("registry:lib")
  })

  it("points at source files that exist", () => {
    for (const file of [...block.files, ...core.files]) expect(existsSync(`${root}${file.path}`)).toBe(true)
  })

  it("declares the items and packages its source imports", () => {
    const source = readFileSync(`${root}${block.files[0].path}`, "utf8")
    for (const dependency of ["button", "collapsible", "diff-core"]) {
      expect(block.registryDependencies, dependency).toContain(`deanjstone/design-system/${dependency}`)
    }
    expect(source).toContain('from "@/lib/diff-core"')
    for (const name of ["lucide-react"]) expect(block.dependencies).toContain(name)
    expect(block.dependencies.some((entry: string) => entry.startsWith("cn"))).toBe(true)
  })

  it("has no registry dependency of its own on the parser's package set", () => {
    expect(core.dependencies ?? []).toEqual([])
  })
})
