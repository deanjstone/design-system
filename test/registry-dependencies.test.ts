// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// Every import in a shipped file must be declared on its item, or a fresh
// consumer gets an unresolvable import: `utils` imported clsx and
// tailwind-merge for months without declaring them, masked only because
// `shadcn init` happened to install both (design-system#60).

type RegistryItem = {
  name: string
  dependencies?: string[]
  registryDependencies?: string[]
  files?: { path: string }[]
}

const root = new URL("../", import.meta.url)
const registry: { items: RegistryItem[] } = JSON.parse(
  readFileSync(fileURLToPath(new URL("registry.json", root)), "utf8"),
)

// The consumer's app already provides React; upstream shadcn items don't
// declare it either.
const providedByConsumer = new Set(["react", "react-dom"])

const importPattern = /(?:^|\s)(?:from|import)\s+["']([^"']+)["']/gm

function importsOf(path: string) {
  const source = readFileSync(fileURLToPath(new URL(path, root)), "utf8")
  return [...source.matchAll(importPattern)].map((match) => match[1])
}

// "@base-ui/react/select" -> "@base-ui/react", "lucide-react" -> "lucide-react"
function packageName(specifier: string) {
  const segments = specifier.split("/")
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]
}

// "@shadcn/react@^0.3.1" -> "@shadcn/react"
function stripVersion(dependency: string) {
  const versionAt = dependency.indexOf("@", 1)
  return versionAt === -1 ? dependency : dependency.slice(0, versionAt)
}

// "@/components/ui/button" -> "button", "@/lib/utils" -> "utils"
function registryItemName(specifier: string) {
  return specifier.split("/").at(-1)!
}

const itemsWithFiles = registry.items.filter((item) => item.files?.length)

describe("registry item dependencies", () => {
  it.each(itemsWithFiles.map((item) => [item.name, item] as const))(
    "%s declares every npm package it imports",
    (_name, item) => {
      const declared = new Set((item.dependencies ?? []).map(stripVersion))
      const imported = item.files!.flatMap((file) => importsOf(file.path))
      const packages = imported
        .filter((specifier) => !specifier.startsWith(".") && !specifier.startsWith("@/"))
        .map(packageName)
        .filter((name) => !providedByConsumer.has(name))

      const undeclared = [...new Set(packages)].filter((name) => !declared.has(name))
      expect(undeclared).toEqual([])
    },
  )

  it.each(itemsWithFiles.map((item) => [item.name, item] as const))(
    "%s declares every registry item it imports, by full address",
    (_name, item) => {
      const declared = new Set(item.registryDependencies ?? [])
      const imported = item.files!.flatMap((file) => importsOf(file.path))
      const addresses = imported
        .filter((specifier) => specifier.startsWith("@/"))
        .map((specifier) => `deanjstone/design-system/${registryItemName(specifier)}`)

      const undeclared = [...new Set(addresses)].filter((address) => !declared.has(address))
      expect(undeclared).toEqual([])
    },
  )
})
