// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// design-system#159: on 1 Nov 2026 Release published v3.6.3 from a head whose
// Test run was red, because release.yml and test.yml both started on the push.
// design-system#191 (argus-config#1167, the owner's release pattern of 6 Nov 2026):
// one `Release` workflow on `push: [deploy]` whose `Test before release (...)` job
// runs the gates on the promoted SHA, and whose `Release` job `needs:` it. There is no
// `workflow_run` trigger: GitHub reports that event's branch as the default branch, and
// semantic-release silently dry-ran (design-system#190). Release still publishes only
// when the tested SHA is the newest real commit on the release branch (deploy).

const root = fileURLToPath(new URL("../", import.meta.url))
const read = (path: string) => readFileSync(join(root, path), "utf8")

// The text of one job in a workflow: from its `  <id>:` line to the next top-level job.
const jobBlock = (workflow: string, id: string) => {
  const start = workflow.search(new RegExp(`^  ${id}:`, "m"))
  expect(start, `job ${id} exists`).toBeGreaterThanOrEqual(0)
  const rest = workflow.slice(start + 1)
  const next = rest.search(/^  [\w-]+:/m)
  return next === -1 ? rest : rest.slice(0, next)
}

describe("release.yml follows the shared release pattern", () => {
  const workflow = read(".github/workflows/release.yml")
  const test = read(".github/workflows/test.yml")
  const testJob = jobBlock(workflow, "test")
  const releaseJob = jobBlock(workflow, "release")

  it("is named Release", () => {
    expect(workflow).toMatch(/^name: Release$/m)
  })

  it("starts on a push to deploy, and by hand", () => {
    expect(workflow).toMatch(/^on:\s*\n\s+push:\s*\n\s+branches: \[deploy\]/m)
    expect(workflow).toMatch(/^\s+workflow_dispatch:/m)
  })

  it("has no workflow_run trigger, and no GITHUB_REF override that trigger needed (design-system#190)", () => {
    expect(workflow).not.toMatch(/^\s*workflow_run:/m)
    expect(workflow).not.toContain("github.event.workflow_run")
    expect(workflow).not.toMatch(/^\s*GITHUB_REF:/m)
  })

  it("refuses a manual run from any ref but deploy, loudly, before anything else runs", () => {
    const step = testJob.slice(testJob.indexOf("- name: Refuse a run from any ref but deploy"))
    expect(step).toMatch(/if: github\.ref != 'refs\/heads\/deploy'/)
    expect(step.slice(0, step.indexOf("\n      - "))).toContain("exit 1")
    const refuse = testJob.indexOf("Refuse a run from any ref but deploy")
    expect(refuse).toBeGreaterThanOrEqual(0)
    expect(refuse).toBeLessThan(testJob.indexOf("actions/checkout"))
  })

  it("names the test job after what it runs, starting `Test before release (`", () => {
    const name = testJob.match(/^\s+name: (.*)$/m)?.[1] ?? ""
    expect(name).toMatch(/^Test before release \(.+\)$/)
    expect(name).toContain("component tests")
    expect(name).toContain("curve geometry gate")
    expect(name).toContain("lint")
  })

  it("tests the promoted commit: it checks out github.sha, or the default ref of a push to deploy", () => {
    const checkout = testJob.slice(testJob.indexOf("actions/checkout"), testJob.indexOf("pnpm/action-setup"))
    expect(checkout).not.toMatch(/ref: deploy/)
    expect(checkout).toMatch(/ref: \$\{\{ github\.sha \}\}/)
  })

  it("runs the same gates as test.yml, each on every promotion", () => {
    for (const command of ["pnpm test", "pnpm gate:geometry", "pnpm lint"]) {
      expect(test, `test.yml runs ${command}`).toMatch(new RegExp(`run: ${command}\\s*$`, "m"))
      expect(testJob, `the test job runs ${command}`).toMatch(new RegExp(`run: ${command}\\s*$`, "m"))
    }
    expect(testJob).not.toMatch(/geometry-inputs-changed|needs\.changes/)
    expect(testJob).not.toMatch(/continue-on-error/)
  })

  it("makes Release need the test job: a red test means no version", () => {
    expect(releaseJob).toMatch(/needs: test\s*$/m)
    expect(releaseJob).toMatch(/^\s+name: Release$/m)
    expect(releaseJob).not.toMatch(/\bif: .*(always|failure|cancelled)\(\)/)
  })

  it("passes the promoted SHA to the gate and releases only when the gate says so", () => {
    expect(releaseJob).toContain('bash scripts/release/tested-head.sh "${TESTED_SHA}"')
    expect(releaseJob).toMatch(/TESTED_SHA: \$\{\{ github\.sha \}\}/)
    expect(releaseJob).toMatch(/id: gate/)
    expect(releaseJob).toContain("steps.gate.outputs.release == 'true'")
  })

  it("puts the gate after the checkout and before install and the release step", () => {
    const gate = releaseJob.indexOf("id: gate")
    expect(gate).toBeGreaterThan(releaseJob.indexOf("actions/checkout"))
    expect(gate).toBeLessThan(releaseJob.indexOf("pnpm install"))
    expect(gate).toBeLessThan(releaseJob.indexOf("release-with-retry.sh"))
  })

  it("releases from the tip of deploy through the retry script", () => {
    expect(releaseJob).toMatch(/ref: deploy/)
    expect(releaseJob).toContain("run: bash scripts/release/release-with-retry.sh")
  })

  it("lets the release job write to the repo, and the test job only read it", () => {
    expect(workflow).toMatch(/^permissions:\s*\n\s+contents: write/m)
    expect(testJob).toMatch(/permissions:\s*\n\s+contents: read/)
  })

  it("is the only place Test's push to deploy used to be: test.yml no longer runs on deploy", () => {
    expect(test).toMatch(/^name: Test$/m)
    expect(test).not.toMatch(/branches: \[[^\]]*deploy/)
  })

  it("keeps every Test job unconditional-failure-visible: none is continue-on-error", () => {
    expect(test).not.toMatch(/continue-on-error/)
  })
})

describe("scripts/release/tested-head.sh", () => {
  const script = join(root, "scripts/release/tested-head.sh")
  let dir: string

  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim()
  const commit = (message: string) => {
    writeFileSync(join(dir, "f.txt"), `${message}\n${Math.random()}\n`)
    git("add", "f.txt")
    git("commit", "-q", "-m", message)
    return git("rev-parse", "HEAD")
  }
  const gate = (testedSha?: string) =>
    spawnSync("bash", testedSha === undefined ? [script] : [script, testedSha], { cwd: dir, encoding: "utf8" })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "release-gate-"))
    git("init", "-q", "-b", "main")
    git("config", "user.email", "t@example.com")
    git("config", "user.name", "t")
    git("config", "commit.gpgsign", "false")
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("releases when the tested SHA is the tip of the release branch", () => {
    commit("feat: base")
    const tested = commit("fix: thing")
    const result = gate(tested)
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe("release=true")
  })

  it("releases when only release-bot commits sit on top of the tested SHA", () => {
    const tested = commit("fix: thing")
    commit("chore(release): 1.2.3 [skip ci]")
    commit("chore(release): restore floating registryDependencies on main [skip ci]")
    expect(gate(tested).stdout.trim()).toBe("release=true")
  })

  it("does not release when a newer, untested commit has landed on the branch", () => {
    const tested = commit("fix: thing")
    commit("feat: pushed while Test was running")
    const result = gate(tested)
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe("release=false")
  })

  it("does not release when a newer non-release commit skipped CI", () => {
    const tested = commit("fix: thing")
    commit("docs: tweak [skip ci]")
    expect(gate(tested).stdout.trim()).toBe("release=false")
  })

  it("does not release a SHA that is not on the branch at all", () => {
    commit("fix: thing")
    expect(gate("0".repeat(40)).stdout.trim()).toBe("release=false")
  })

  it("does not treat a lookalike subject as a release-bot commit", () => {
    const tested = commit("fix: thing")
    commit("feat: chore(release): not a bot")
    expect(gate(tested).stdout.trim()).toBe("release=false")
  })

  it("fails loudly with no SHA argument instead of releasing", () => {
    commit("fix: thing")
    const result = gate()
    expect(result.status).not.toBe(0)
    expect(result.stdout).not.toContain("release=true")
  })
})
