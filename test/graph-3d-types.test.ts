import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

// graph-3d is vendored into consumers whose tsconfig sets noUncheckedIndexedAccess
// (design-system#178: apps/ops-hub-web carried a ts-nocheck header on two files).
// This repo has no tsconfig of its own, so the flag is pinned here: the shipped
// graph-3d sources are typechecked with it on, aliases mapped to the registry.
const root = resolve(__dirname, "..")
const tsc = join(root, "node_modules", ".bin", "tsc")

describe("graph-3d as a strict consumer typechecks it", () => {
  it("has no type errors under strict + noUncheckedIndexedAccess", () => {
    const dir = mkdtempSync(join(tmpdir(), "ds-graph3d-types-"))
    try {
      const config = {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          strict: true,
          noUncheckedIndexedAccess: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
          typeRoots: [join(root, "node_modules", "@types")],
          paths: {
            "@/lib/*": [join(root, "registry/lib/*")],
            "@/components/ui/*": [join(root, "registry/base-nova/ui/*")],
          },
        },
        files: [
          join(root, "registry/base-nova/ui/graph-3d.tsx"),
          join(root, "registry/lib/graph-3d-core.ts"),
          join(root, "registry/lib/graph-3d-engine.ts"),
          join(root, "registry/lib/d3-force-3d.d.ts"),
        ],
      }
      writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(config))
      const run = spawnSync(tsc, ["-p", join(dir, "tsconfig.json"), "--pretty", "false"], { cwd: root, encoding: "utf8" })
      expect(`${run.stdout}${run.stderr}`).toBe("")
      expect(run.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
