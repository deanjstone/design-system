// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// The grouped list is three registry items (design-system#194): the model, the hook that keeps a view's
// display settings and the block. Listing them in registry.json is the flag that publishes them.

type Item = { name: string; type: string; registryDependencies?: string[]; dependencies?: string[]; files: { path: string }[] }

const root = fileURLToPath(new URL("..", import.meta.url))
const registry: { items: Item[] } = JSON.parse(readFileSync(`${root}registry.json`, "utf8"))
const find = (name: string) => registry.items.find((entry) => entry.name === name)!
const source = (name: string) => readFileSync(`${root}${find(name).files[0].path}`, "utf8")

const TYPES = { "list-group-core": "registry:lib", "use-display-settings": "registry:hook", "grouped-list": "registry:block" }

describe("grouped list registry entries", () => {
  it.each(Object.entries(TYPES))("lists %s as %s with a source file that exists", (name, type) => {
    const item = find(name)
    expect(item?.type).toBe(type)
    for (const file of item.files) expect(existsSync(`${root}${file.path}`)).toBe(true)
  })

  it("makes the hook pull in the model", () => {
    expect(find("use-display-settings").registryDependencies).toEqual(["deanjstone/design-system/list-group-core"])
  })

  it.each(["grouped-list", "use-display-settings"])("declares every registry item %s imports", (name) => {
    const used = [...source(name).matchAll(/from "@\/(?:components\/ui|lib)\/([^"]+)"/g)].map((match) => match[1])
    expect(used.length).toBeGreaterThan(0)
    for (const dependency of used) {
      if (dependency === "utils") continue
      expect(find(name).registryDependencies).toContain(`deanjstone/design-system/${dependency}`)
    }
  })

  it("makes the block pull in the pieces it renders, and not issue-row, which it never imports", () => {
    const block = find("grouped-list")
    for (const name of ["button", "checkbox", "collapsible", "native-select", "popover", "list-group-core"]) {
      expect(block.registryDependencies).toContain(`deanjstone/design-system/${name}`)
    }
    expect(block.registryDependencies).not.toContain("deanjstone/design-system/issue-row")
  })

  it("declares every package the block imports", () => {
    const imported = [...source("grouped-list").matchAll(/from "([^"./@][^"]*|@[^"/]+\/[^"]+)"/g)].map((match) => match[1])
    const declared = (find("grouped-list").dependencies ?? []).map((dependency) => dependency.replace(/@[^@/]+$/, ""))
    for (const name of imported.filter((entry) => entry !== "react")) expect(declared).toContain(name)
  })

  it("brings in no dependency beyond the registry's own: no zustand, motion, react-dnd or extra icon set", () => {
    const declared = Object.keys(TYPES).flatMap((name) => find(name).dependencies ?? [])
    expect(declared.filter((dependency) => /zustand|motion|react-dnd|recharts|react-icons|@tabler/.test(dependency))).toEqual([])
  })

  it("credits circle in the source header of each item", () => {
    for (const name of Object.keys(TYPES)) {
      expect(source(name)).toContain("https://github.com/ln-dev7/circle")
      expect(source(name)).toContain("MIT License")
    }
  })
})
