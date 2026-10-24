// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

// Registry items moved from the clsx + tailwind-merge helper to the `cn`
// package, as upstream shadcn did in September 2026 (design-system#101).
// Consumer code that imports `@/lib/utils` must keep working, so the `utils`
// item stays and re-exports `cn`.

type RegistryItem = {
  name: string
  dependencies?: string[]
  registryDependencies?: string[]
  files?: { path: string }[]
}

const root = new URL("../", import.meta.url)
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), "utf8")
const registry: { items: RegistryItem[] } = JSON.parse(read("registry.json"))

const stripVersion = (dependency: string) => {
  const versionAt = dependency.indexOf("@", 1)
  return versionAt === -1 ? dependency : dependency.slice(0, versionAt)
}

const sourceFiles = registry.items
  .flatMap((item) => (item.files ?? []).map((file) => ({ item: item.name, path: file.path })))
  .filter((file) => /\.(ts|tsx)$/.test(file.path))

describe("cn package migration", () => {
  it("no registry item depends on clsx or tailwind-merge", () => {
    const offenders = registry.items.filter((item) =>
      (item.dependencies ?? []).some((dependency) =>
        ["clsx", "tailwind-merge"].includes(stripVersion(dependency)),
      ),
    )
    expect(offenders.map((item) => item.name)).toEqual([])
  })

  it("no shipped file imports clsx or tailwind-merge", () => {
    const offenders = sourceFiles.filter((file) =>
      /from\s+["'](clsx|tailwind-merge)["']/.test(read(file.path)),
    )
    expect(offenders.map((file) => file.path)).toEqual([])
  })

  it("items that import cn take it from the cn package and declare it", () => {
    const itemsUsingCn = new Set(
      sourceFiles
        .filter((file) => /\bcn\(/.test(read(file.path)))
        .map((file) => file.item),
    )
    expect(itemsUsingCn.size).toBeGreaterThan(0)

    for (const file of sourceFiles.filter((f) => itemsUsingCn.has(f.item))) {
      const source = read(file.path)
      if (!/\bcn\(/.test(source)) continue
      expect(source, file.path).toMatch(/import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*["']cn["']/)
    }

    for (const name of itemsUsingCn) {
      const item = registry.items.find((candidate) => candidate.name === name)!
      expect((item.dependencies ?? []).map(stripVersion), name).toContain("cn")
    }
  })

  it("the utils item re-exports cn and declares the cn package", () => {
    const utils = registry.items.find((item) => item.name === "utils")!
    expect(utils.dependencies?.map(stripVersion)).toEqual(["cn"])
    expect(read("registry/lib/utils.ts").trim()).toBe('export { cn } from "cn"')
  })

  it("no item pulls in utils just for cn", () => {
    const dependents = registry.items.filter((item) =>
      item.registryDependencies?.includes("deanjstone/design-system/utils"),
    )
    expect(dependents.map((item) => item.name)).toEqual([])
  })

  it("@/lib/utils still exposes a cn that joins and resolves conflicts", () => {
    expect(cn("px-2 py-1", false && "hidden", { "text-white": true }, "px-4")).toBe(
      "py-1 text-white px-4",
    )
  })
})
