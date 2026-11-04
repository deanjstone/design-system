// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// design-system#159: on 1 Nov 2026 Release published v3.6.3 from a head whose
// Test run was red, because release.yml and test.yml both started on the push.
// Release now starts only from a finished, green Test run on the same SHA, and
// publishes only when that SHA is still the newest real commit on the release
// branch. Since design-system#179 the release branch is deploy, not main.

const root = fileURLToPath(new URL("../", import.meta.url))
const read = (path: string) => readFileSync(join(root, path), "utf8")

describe("release.yml is gated on Test", () => {
  const workflow = read(".github/workflows/release.yml")
  const test = read(".github/workflows/test.yml")

  it("does not start on push: it starts when the Test workflow completes", () => {
    expect(workflow).not.toMatch(/^\s*push:/m)
    expect(workflow).toMatch(/workflow_run:\s*\n\s*workflows: \[Test\]\s*\n\s*types: \[completed\]/)
  })

  it("names the Test workflow exactly, so the trigger cannot silently stop matching", () => {
    expect(test).toMatch(/^name: Test$/m)
  })

  it("runs the release job only for a successful Test run of a push to deploy", () => {
    const job = workflow.slice(workflow.indexOf("\njobs:"))
    expect(job).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(job).toContain("github.event.workflow_run.event == 'push'")
    expect(job).toContain("github.event.workflow_run.head_branch == 'deploy'")
  })

  it("keeps the release job on one condition line joined with &&, never ||", () => {
    const ifLine = workflow.match(/^\s+if: (.*)$/m)?.[1] ?? ""
    expect(ifLine).not.toContain("||")
  })

  it("passes the tested SHA to the gate and releases only when the gate says so", () => {
    expect(workflow).toContain("bash scripts/release/tested-head.sh")
    expect(workflow).toContain("github.event.workflow_run.head_sha")
    expect(workflow).toMatch(/id: gate/)
    expect(workflow).toContain("steps.gate.outputs.release == 'true'")
  })

  it("puts the gate before install and before the release step", () => {
    const gate = workflow.indexOf("id: gate")
    expect(gate).toBeGreaterThan(workflow.indexOf("actions/checkout"))
    expect(gate).toBeLessThan(workflow.indexOf("pnpm install"))
    expect(gate).toBeLessThan(workflow.indexOf("release-with-retry.sh"))
  })

  it("releases from the tip of deploy through the retry script", () => {
    expect(workflow).toMatch(/ref: deploy/)
    expect(workflow).toContain("run: bash scripts/release/release-with-retry.sh")
  })

  it("covers every Test job: the gate is the workflow conclusion, so no job may be continue-on-error", () => {
    expect(test).not.toMatch(/continue-on-error/)
    expect(test).toMatch(/^\s+geometry:/m)
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
