// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// The filter builder is four registry items (design-system#193): the model, the URL-state helper, the
// hook that joins them and the block. Listing them in registry.json is the flag that publishes them.

type Item = { name: string; type: string; registryDependencies?: string[]; dependencies?: string[]; files: { path: string }[] }

const root = fileURLToPath(new URL("..", import.meta.url))
const registry: { items: Item[] } = JSON.parse(readFileSync(`${root}registry.json`, "utf8"))
const find = (name: string) => registry.items.find((entry) => entry.name === name)!

const TYPES = { "filter-core": "registry:lib", "url-state": "registry:lib", "use-filter-state": "registry:hook", "filter-builder": "registry:block" }

describe("filter builder registry entries", () => {
  it.each(Object.entries(TYPES))("lists %s as %s with a source file that exists", (name, type) => {
    const item = find(name)
    expect(item?.type).toBe(type)
    for (const file of item.files) expect(existsSync(`${root}${file.path}`)).toBe(true)
  })

  it("makes the block pull in everything it renders and the hook and model it relies on", () => {
    const block = find("filter-builder")
    for (const name of ["badge", "button", "checkbox", "input", "native-select", "popover", "sheet", "use-mobile", "filter-core"]) {
      expect(block.registryDependencies).toContain(`deanjstone/design-system/${name}`)
    }
  })

  it("makes the hook pull in the model and the URL helper", () => {
    expect(find("use-filter-state").registryDependencies?.sort()).toEqual(["deanjstone/design-system/filter-core", "deanjstone/design-system/url-state"])
  })

  it("brings in no dependency beyond the registry's own: no nuqs, motion, react-dnd or extra icon set", () => {
    const declared = Object.keys(TYPES).flatMap((name) => find(name).dependencies ?? [])
    expect(declared.filter((dependency) => /nuqs|motion|react-dnd|recharts|react-icons|@tabler/.test(dependency))).toEqual([])
  })

  it("credits circle in the source header of the model, the helper and the block", () => {
    for (const name of ["filter-core", "url-state", "filter-builder"]) {
      const source = readFileSync(`${root}${find(name).files[0].path}`, "utf8")
      expect(source).toContain("https://github.com/ln-dev7/circle")
      expect(source).toContain("MIT License")
    }
  })
})
