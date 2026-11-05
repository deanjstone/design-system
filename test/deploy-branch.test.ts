// @vitest-environment node

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// The wiring of design-system#179 (map argus-config#1048): a release is cut only
// when the owner promotes a main SHA to `deploy`. The behaviour is tested in
// promote.test.ts, semantic-release-pin.test.ts, release-catch-up.test.ts and
// release-retry.test.ts; these cases pin the configuration that would otherwise
// fail silently, a release back on a push to main or a plugin that pushes deploy.

const root = fileURLToPath(new URL("../", import.meta.url))
const read = (path: string) => readFileSync(join(root, path), "utf8")
const releaseConfig = JSON.parse(read(".releaserc.json")) as {
  branches: string[]
  plugins: (string | [string, Record<string, unknown>])[]
}
const pluginName = (plugin: string | [string, unknown]) => (Array.isArray(plugin) ? plugin[0] : plugin)

describe("semantic-release config", () => {
  it("releases from deploy only", () => {
    expect(releaseConfig.branches).toEqual(["deploy"])
  })

  it("has no plugin that pushes the release branch: deploy must stay a fast-forward of main", () => {
    expect(releaseConfig.plugins.map(pluginName)).not.toContain("@semantic-release/git")
  })

  it("commits the release files itself and lands them on main", () => {
    const pin = releaseConfig.plugins.find((plugin) => pluginName(plugin).endsWith("semantic-release-pin.mjs"))
    expect(Array.isArray(pin) ? pin[1] : undefined).toMatchObject({
      releaseFiles: ["CHANGELOG.md", "package.json"],
      targetBranch: "main",
    })
  })

  it("runs the pin plugin after the plugins that write the release files", () => {
    const names = releaseConfig.plugins.map(pluginName)
    const pin = names.findIndex((name) => name.endsWith("semantic-release-pin.mjs"))
    expect(pin).toBe(names.length - 1)
    expect(names.indexOf("@semantic-release/changelog")).toBeLessThan(pin)
    expect(names.indexOf("@semantic-release/npm")).toBeLessThan(pin)
  })
})

describe("workflows", () => {
  const workflows = readdirSync(join(root, ".github/workflows"))
    .filter((file) => file.endsWith(".yml"))
    .map((file) => ({ file, text: read(`.github/workflows/${file}`) }))

  it("only release.yml runs semantic-release", () => {
    const others = workflows.filter(({ file }) => file !== "release.yml" && /semantic-release|release-with-retry/.test(read(`.github/workflows/${file}`)))
    expect(others.map(({ file }) => file)).toEqual([])
  })

  it("release.yml starts on a push to deploy and never on main or through workflow_run", () => {
    const release = read(".github/workflows/release.yml")
    expect(release).toMatch(/push:\s*\n\s*branches: \[deploy\]/)
    expect(release).not.toMatch(/branches:\s*\[?[^\]\n]*main/)
    expect(release).not.toMatch(/^\s*workflow_run:/m)
  })

  it("Test runs on main (CI only); the promoted SHA is tested inside Release", () => {
    expect(read(".github/workflows/test.yml")).toMatch(/push:\s*\n\s*branches: \[main\]\s*$/m)
  })
})

describe("promotion", () => {
  it("ships an executable promote.sh and the doc that explains it", () => {
    expect(statSync(join(root, "scripts/promote.sh")).mode & 0o111).not.toBe(0)
    expect(statSync(join(root, "scripts/release/catch-up-release-tags.sh")).mode & 0o111).not.toBe(0)
    expect(read("docs/deploy-branch.md")).toContain("scripts/promote.sh")
  })
})
