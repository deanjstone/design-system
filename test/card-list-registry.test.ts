// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// card-list is listed in registry.json (design-system#188): the flag that publishes it. The source
// file it points at must exist, and what it imports must be declared, or a consumer's install breaks.

const root = fileURLToPath(new URL("..", import.meta.url))
const registry = JSON.parse(readFileSync(`${root}registry.json`, "utf8"))
const item = registry.items.find((entry: { name: string }) => entry.name === "card-list")

describe("card-list registry entry", () => {
  it("is listed as a block", () => {
    expect(item?.type).toBe("registry:block")
  })

  it("points at a source file that exists", () => {
    for (const file of item.files) expect(existsSync(`${root}${file.path}`)).toBe(true)
  })

  it("declares every package its source imports", () => {
    const source = readFileSync(`${root}${item.files[0].path}`, "utf8")
    const imported = [...source.matchAll(/from "([^"./@][^"]*|@[^"/]+\/[^"]+)"/g)].map((match) => match[1])
    const declared = (item.dependencies as string[]).map((dependency) => dependency.replace(/@[^@/]+$/, "").replace(/^(@[^/]+\/[^/@]+).*$/, "$1"))
    for (const name of imported.filter((entry) => entry !== "react")) {
      expect(declared.some((dependency) => name === dependency || name.startsWith(`${dependency}/`))).toBe(true)
    }
  })
})
