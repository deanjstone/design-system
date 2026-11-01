import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

// A consumer typechecks the block in its own tsc, with the shadcn aliases mapped to its own tree.
// Here the same aliases map to the registry, so a type error that only a strict consumer sees
// (#160: a RefObject<HTMLElement> put on a <div>) fails this suite instead of the consumer's build.
const root = resolve(__dirname, "..")
const tsc = join(root, "node_modules", ".bin", "tsc")

const typecheck = (entry: string) => {
  const dir = mkdtempSync(join(tmpdir(), "ds-consumer-types-"))
  try {
    const config = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        typeRoots: [join(root, "node_modules", "@types")],
        paths: {
          "@/lib/*": [join(root, "registry/lib/*")],
          "@/components/ui/*": [join(root, "registry/base-nova/ui/*")],
          "@/components/*": [join(root, "registry/base-nova/blocks/*")],
          "@/hooks/*": [join(root, "registry/base-nova/hooks/*")],
        },
      },
      files: [join(root, entry)],
    }
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(config))
    const run = spawnSync(tsc, ["-p", join(dir, "tsconfig.json"), "--pretty", "false"], { cwd: root, encoding: "utf8" })
    return { status: run.status, output: `${run.stdout}${run.stderr}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("AppShell as a consumer typechecks it", () => {
  it("has no type errors under strict mode", () => {
    const { status, output } = typecheck("registry/base-nova/blocks/app-shell.tsx")

    expect(output).toBe("")
    expect(status).toBe(0)
  })
})
