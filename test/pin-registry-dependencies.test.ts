// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  findUnpinned,
  pinRegistry,
  pinRegistryDependencies,
} from "../scripts/release/pin-registry-dependencies.mjs"

// Tagged builds write every in-repo registryDependencies entry with the
// release ref, because shadcn does not inherit a ref across dependencies
// (design-system#65). `main` keeps the unversioned form so it floats.

describe("pinRegistryDependencies", () => {
  it("appends the ref to every in-repo address", () => {
    expect(
      pinRegistryDependencies(
        ["deanjstone/design-system/button", "deanjstone/design-system/use-mobile"],
        "v3.1.0",
      ),
    ).toEqual([
      "deanjstone/design-system/button#v3.1.0",
      "deanjstone/design-system/use-mobile#v3.1.0",
    ])
  })

  it("leaves entries from other registries untouched", () => {
    const others = ["button", "@shadcn/card", "https://example.com/r/card.json", "acme/ui/card"]
    expect(pinRegistryDependencies(others, "v3.1.0")).toEqual(others)
  })

  it("replaces a ref that is already there instead of stacking a second one", () => {
    expect(
      pinRegistryDependencies(["deanjstone/design-system/button#v3.0.0"], "v3.1.0"),
    ).toEqual(["deanjstone/design-system/button#v3.1.0"])
  })

  it("is idempotent", () => {
    const once = pinRegistryDependencies(["deanjstone/design-system/button"], "v3.1.0")
    expect(pinRegistryDependencies(once, "v3.1.0")).toEqual(once)
  })

  it("does not mutate its input", () => {
    const input = ["deanjstone/design-system/button"]
    pinRegistryDependencies(input, "v3.1.0")
    expect(input).toEqual(["deanjstone/design-system/button"])
  })
})

describe("pinRegistry", () => {
  const registry = {
    name: "design-system",
    items: [
      { name: "theme", type: "registry:theme" },
      {
        name: "sidebar",
        registryDependencies: ["deanjstone/design-system/button", "tooltip"],
        dependencies: ["clsx"],
      },
    ],
  }

  it("pins each item that has dependencies and leaves everything else as it was", () => {
    expect(pinRegistry(registry, "v3.1.0")).toEqual({
      name: "design-system",
      items: [
        { name: "theme", type: "registry:theme" },
        {
          name: "sidebar",
          registryDependencies: ["deanjstone/design-system/button#v3.1.0", "tooltip"],
          dependencies: ["clsx"],
        },
      ],
    })
  })

  it("also pins a single built item (the shape of r/<item>.json)", () => {
    expect(
      pinRegistry({ name: "sidebar", registryDependencies: ["deanjstone/design-system/button"] }, "v3.1.0"),
    ).toEqual({ name: "sidebar", registryDependencies: ["deanjstone/design-system/button#v3.1.0"] })
  })

  it("does not mutate its input", () => {
    const snapshot = structuredClone(registry)
    pinRegistry(registry, "v3.1.0")
    expect(registry).toEqual(snapshot)
  })

  it("rejects an empty ref", () => {
    expect(() => pinRegistry(registry, "")).toThrow(/ref/)
  })
})

describe("findUnpinned", () => {
  it("reports in-repo dependencies that lack exactly the release ref", () => {
    const registry = {
      items: [
        {
          name: "sidebar",
          registryDependencies: [
            "deanjstone/design-system/button#v3.1.0",
            "deanjstone/design-system/input",
            "deanjstone/design-system/sheet#v3.0.0",
            "tooltip",
          ],
        },
      ],
    }
    expect(findUnpinned(registry, "v3.1.0")).toEqual([
      { item: "sidebar", entry: "deanjstone/design-system/input" },
      { item: "sidebar", entry: "deanjstone/design-system/sheet#v3.0.0" },
    ])
  })

  it("does not accept a ref that merely ends with the release ref", () => {
    expect(
      findUnpinned(
        { name: "sidebar", registryDependencies: ["deanjstone/design-system/button#old#v3.1.0"] },
        "v3.1.0",
      ),
    ).toEqual([{ item: "sidebar", entry: "deanjstone/design-system/button#old#v3.1.0" }])
  })

  it("finds nothing in a fully pinned registry, single items included", () => {
    expect(
      findUnpinned(
        { name: "sidebar", registryDependencies: ["deanjstone/design-system/button#v3.1.0"] },
        "v3.1.0",
      ),
    ).toEqual([])
  })
})

describe("the real registry.json", () => {
  const registry = JSON.parse(
    readFileSync(fileURLToPath(new URL("../registry.json", import.meta.url)), "utf8"),
  )

  it("is written unpinned on main, so unpinned installs keep floating", () => {
    const entries = registry.items.flatMap(
      (item: { registryDependencies?: string[] }) => item.registryDependencies ?? [],
    )
    const inRepo = entries.filter((entry: string) => entry.startsWith("deanjstone/design-system/"))
    expect(inRepo.length).toBeGreaterThan(0)
    expect(inRepo.filter((entry: string) => entry.includes("#"))).toEqual([])
  })

  it("is fully pinned after stamping", () => {
    expect(findUnpinned(pinRegistry(registry, "v9.9.9"), "v9.9.9")).toEqual([])
  })
})
