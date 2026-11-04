// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// design-system#158: the curve-geometry gate runs on every push to main. The
// browser is downloaded once and reused (owner requirement), so the workflow
// has to keep Chromium on a persistent path, and has to keep the install step
// free of root (`--with-deps`, sudo): installing OS packages is a live change.

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8")

const workflow = read(".github/workflows/test.yml")
const pkg = JSON.parse(read("package.json")) as { devDependencies: Record<string, string> }

describe("geometry gate job in test.yml", () => {
  it("runs the gate, with no --url, on pushes to main and to deploy", () => {
    expect(workflow).toMatch(/push:\s*\n\s*branches: \[main, deploy\]/)
    expect(workflow).toMatch(/^\s+geometry:/m)
    expect(workflow).toMatch(/run: pnpm gate:geometry\s*$/m)
    expect(workflow).not.toMatch(/gate:geometry.*--url/)
  })

  it("uses the same runner selection as the other jobs", () => {
    const runsOn = workflow.match(/runs-on: .*/g) ?? []
    expect(runsOn.length).toBeGreaterThanOrEqual(2)
    expect(new Set(runsOn).size).toBe(1)
  })

  it("keeps Chromium on a persistent path outside the workspace", () => {
    expect(workflow).toContain("PLAYWRIGHT_BROWSERS_PATH")
    expect(workflow).toMatch(/PLAYWRIGHT_BROWSERS_PATH=\$HOME\/\.cache\/ms-playwright/)
  })

  it("restores the browser from actions/cache on GitHub-hosted runners, keyed on playwright-core", () => {
    expect(workflow).toMatch(/uses: actions\/cache@v\d/)
    expect(workflow).toMatch(/runner\.environment == 'github-hosted'/)
    expect(workflow).toMatch(/key: playwright-chromium-.*playwright-core/)
  })

  it("installs only chromium, pinned to the playwright-core in package.json, without root", () => {
    expect(pkg.devDependencies["playwright-core"]).toMatch(/^\d+\.\d+\.\d+$/)
    expect(workflow).toMatch(/pnpm exec playwright-core install chromium\s*$/m)
    expect(workflow).not.toMatch(/--with-deps/)
    expect(workflow).not.toMatch(/\bsudo\b/)
  })

  it("uploads the curve screenshots when the gate fails", () => {
    expect(workflow).toMatch(/if: failure\(\)/)
    expect(workflow).toMatch(/uses: actions\/upload-artifact@v\d/)
    expect(workflow).toContain("geometry-gate-out/curves/")
  })
})
