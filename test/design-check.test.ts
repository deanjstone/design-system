// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// The design-check item ships Impeccable's detector as a non-blocking CI check
// (design-system#102, from myargus#348/#349). npx is stubbed: no network, no
// real scan. The stub records its arguments and the telemetry switches, then
// prints the JSON the test hands it and exits with the status the test picks.

const root = fileURLToPath(new URL("../", import.meta.url))
const scriptPath = join(root, "registry/design-check/design-detect.sh")
const workflowPath = join(root, "registry/design-check/design-detect.yml")

type RegistryItem = {
  name: string
  type: string
  files?: { path: string; type: string; target?: string }[]
}
const registry: { items: RegistryItem[] } = JSON.parse(
  readFileSync(join(root, "registry.json"), "utf8"),
)
const item = registry.items.find((candidate) => candidate.name === "design-check")

describe("design-check registry item", () => {
  it("is a registry:file item", () => {
    expect(item?.type).toBe("registry:file")
  })

  it("lands the script and the workflow at the consumer's project root", () => {
    const targets = Object.fromEntries(item!.files!.map((file) => [file.path, file.target]))
    expect(targets).toEqual({
      "registry/design-check/design-detect.sh": "~/scripts/design-detect.sh",
      "registry/design-check/design-detect.yml": "~/.github/workflows/design-detect.yml",
    })
  })

  it("ships every file it declares", () => {
    for (const file of item!.files!) {
      expect(existsSync(join(root, file.path)), file.path).toBe(true)
    }
  })

  // `shadcn add` overwrites what is there when given -o, and a consumer's own
  // DESIGN.md and detector config are tailored (the theme is tinted per app).
  it("never ships a file that would replace the consumer's DESIGN.md or detector config", () => {
    const targets = item!.files!.map((file) => file.target)
    expect(targets).not.toContain("~/DESIGN.md")
    expect(targets).not.toContain("~/.impeccable/config.json")
  })
})

describe("design-detect.yml", () => {
  const workflow = () => readFileSync(workflowPath, "utf8")

  it("never blocks a merge: the detector step is continue-on-error", () => {
    expect(workflow()).toMatch(/continue-on-error: true\n(?:.*\n)*?\s+run: bash scripts\/design-detect\.sh/)
  })

  // shadcn writes files without the executable bit.
  it("runs the script through bash", () => {
    expect(workflow()).not.toMatch(/run: scripts\/design-detect\.sh/)
  })

  it("is read-only and scoped to UI files, DESIGN.md and detector config", () => {
    const text = workflow()
    expect(text).toContain("contents: read")
    for (const glob of ["**/*.tsx", "**/*.css", "DESIGN.md", ".impeccable/**"]) {
      expect(text).toContain(`'${glob}'`)
    }
    expect(text).not.toMatch(/apps\/\*\*|packages\/\*\*/)
  })
})

describe("design-detect.sh", () => {
  let work: string
  let repo: string
  let base: string

  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()

  const write = (path: string, content: string) => {
    mkdirSync(join(repo, path, ".."), { recursive: true })
    writeFileSync(join(repo, path), content)
  }

  const commitAll = () => {
    git("add", "-A")
    git("commit", "-q", "-m", "change")
  }

  const detectorSays = (findings: unknown, status = 0) => {
    writeFileSync(join(work, "detector.json"), JSON.stringify(findings))
    writeFileSync(join(work, "detector.status"), String(status))
  }

  const run = (args: string[] = [base], env: Record<string, string> = {}) =>
    spawnSync("bash", [scriptPath, ...args], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, PATH: `${join(work, "bin")}:${process.env.PATH}`, STUB_DIR: work, ...env },
    })

  const calls = () => {
    const path = join(work, "calls")
    return existsSync(path) ? readFileSync(path, "utf8") : ""
  }

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), "design-check-"))
    repo = join(work, "repo")
    mkdirSync(join(work, "bin"))
    const stub = join(work, "bin/npx")
    writeFileSync(
      stub,
      [
        "#!/bin/sh",
        '{ echo "ARGS $*"; echo "DO_NOT_TRACK=$DO_NOT_TRACK IMPECCABLE_NO_TELEMETRY=$IMPECCABLE_NO_TELEMETRY"; } >> "$STUB_DIR/calls"',
        'cat "$STUB_DIR/detector.json"',
        'exit "$(cat "$STUB_DIR/detector.status")"',
        "",
      ].join("\n"),
    )
    chmodSync(stub, 0o755)
    detectorSays([])

    mkdirSync(repo)
    git("init", "-q", "-b", "main")
    git("config", "user.name", "t")
    git("config", "user.email", "t@t")
    write("src/old.tsx", "export const a = 1\n")
    write("docs/note.md", "doc\n")
    commitAll()
    base = git("rev-parse", "HEAD")
  })

  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })

  it("skips the detector when no UI file changed", () => {
    write("docs/note.md", "more\n")
    commitAll()
    const result = run()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("No UI files changed")
    expect(calls()).toBe("")
  })

  it("scans only changed UI files, at any depth, with the pinned version and telemetry off", () => {
    write("src/new.tsx", "export const b = 2\n")
    write("apps/shell/src/new.css", ".x { color: red }\n")
    write("docs/note.md", "more\n")
    commitAll()
    const result = run()
    expect(result.status).toBe(0)
    expect(calls()).toMatch(/^ARGS --yes impeccable@\d+\.\d+\.\d+ detect --json /m)
    expect(calls()).toContain("src/new.tsx")
    expect(calls()).toContain("apps/shell/src/new.css")
    expect(calls()).not.toContain("docs/note.md")
    expect(calls()).not.toContain("src/old.tsx")
    expect(calls()).toContain("DO_NOT_TRACK=1 IMPECCABLE_NO_TELEMETRY=1")
  })

  it("does not pass a deleted UI file to the detector", () => {
    git("rm", "-q", "src/old.tsx")
    commitAll()
    const result = run()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("No UI files changed")
    expect(calls()).toBe("")
  })

  it("reports zero findings on a clean scan", () => {
    write("src/new.tsx", "export const b = 2\n")
    commitAll()
    const result = run()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("0 findings")
  })

  it("counts findings by rule and severity and passes on the detector's exit 2", () => {
    write("src/new.tsx", "export const b = 2\n")
    commitAll()
    const file = join(repo, "src/new.tsx")
    detectorSays(
      [
        { antipattern: "side-tab", severity: "warning", file, line: 7, snippet: "border-left: 3px" },
        { antipattern: "design-system-font-size", severity: "advisory", file, line: 9, snippet: "10px" },
        { antipattern: "design-system-font-size", severity: "advisory", file, line: 12, snippet: "11px" },
      ],
      2,
    )
    const result = run()
    expect(result.status).toBe(2)
    expect(result.stdout).toContain("3 findings")
    expect(result.stdout).toContain("| side-tab | warning | 1 |")
    expect(result.stdout).toContain("| design-system-font-size | advisory | 2 |")
    expect(result.stdout).toContain("src/new.tsx:7")
    expect(result.stdout).not.toContain(work)
  })

  it("exits 1 and says so when the detector could not scan a target", () => {
    write("src/new.tsx", "export const b = 2\n")
    commitAll()
    detectorSays([], 1)
    const result = run()
    expect(result.status).toBe(1)
    expect(result.stdout).toContain("could not be scanned")
  })

  it("writes the summary to GITHUB_STEP_SUMMARY when it is set", () => {
    write("src/new.tsx", "export const b = 2\n")
    commitAll()
    const summary = join(work, "summary.md")
    const result = run([base], { GITHUB_STEP_SUMMARY: summary })
    expect(result.status).toBe(0)
    expect(readFileSync(summary, "utf8")).toContain("0 findings")
  })

  it("is a usage error without a base ref", () => {
    const result = run([])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain("usage")
  })

  describe("registry-owned ui directory", () => {
    const changeUi = (...paths: string[]) => {
      for (const path of paths) write(path, "export const b = 2\n")
      commitAll()
    }

    it("skips the directory components.json names as the ui alias", () => {
      write("components.json", JSON.stringify({ aliases: { ui: "@/components/ui" } }))
      commitAll()
      base = git("rev-parse", "HEAD")
      changeUi("src/components/ui/button.tsx", "src/components/app-card.tsx")
      expect(run().status).toBe(0)
      expect(calls()).toContain("src/components/app-card.tsx")
      expect(calls()).not.toContain("components/ui/button.tsx")
    })

    it("reads a custom ui alias, with a ~/ prefix or none", () => {
      write("components.json", JSON.stringify({ aliases: { ui: "~/primitives" } }))
      write("apps/web/components.json", JSON.stringify({ aliases: { ui: "lib/kit" } }))
      commitAll()
      base = git("rev-parse", "HEAD")
      changeUi(
        "src/primitives/button.tsx",
        "apps/web/src/lib/kit/card.tsx",
        "src/components/ui/mine.tsx",
      )
      run()
      expect(calls()).not.toContain("primitives/button.tsx")
      expect(calls()).not.toContain("lib/kit/card.tsx")
      expect(calls()).toContain("src/components/ui/mine.tsx")
    })

    it("falls back to <components alias>/ui when no ui alias is set", () => {
      write("components.json", JSON.stringify({ aliases: { components: "@/components" } }))
      commitAll()
      base = git("rev-parse", "HEAD")
      changeUi("src/components/ui/button.tsx", "src/pages/home.tsx")
      run()
      expect(calls()).not.toContain("components/ui/button.tsx")
      expect(calls()).toContain("src/pages/home.tsx")
    })

    it("scans everything when there is no components.json", () => {
      changeUi("src/components/ui/button.tsx")
      run()
      expect(calls()).toContain("src/components/ui/button.tsx")
    })

    it("says nothing was scanned when every changed file is registry-owned", () => {
      write("components.json", JSON.stringify({ aliases: { ui: "@/components/ui" } }))
      commitAll()
      base = git("rev-parse", "HEAD")
      changeUi("src/components/ui/button.tsx")
      const result = run()
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("No UI files changed")
      expect(calls()).toBe("")
    })

    it("does not skip a workspace-package alias it cannot map to a directory", () => {
      write("components.json", JSON.stringify({ aliases: { ui: "@workspace/ui/components" } }))
      commitAll()
      base = git("rev-parse", "HEAD")
      changeUi("packages/ui/src/components/button.tsx")
      const result = run()
      expect(calls()).toContain("packages/ui/src/components/button.tsx")
      expect(result.stdout).toContain("@workspace/ui/components")
    })
  })
})
