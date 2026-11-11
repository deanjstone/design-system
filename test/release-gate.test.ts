// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
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
// when the tested SHA is the tip of the release branch (deploy).
// design-system#203 (argus-config#1259): the release commits nothing. It tags the promoted
// SHA and pushes no commit to `main` or `deploy`; a promotion with nothing releasable runs
// no test and cuts no version (scripts/release/release-needed.sh).

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

  // design-system#197 (trunk-readiness point 3): the job that lands the version bump on
  // main must have run every step of scripts/check.sh first, not only tests and lint.
  // The impeccable detector and the r/ drift check are the two it used to leave out.
  it("runs the design detector and the r/ drift check too: all of scripts/check.sh before Release", () => {
    const design = read(".github/workflows/design.yml")
    const check = read("scripts/check.sh")
    const pin = (name: string) => check.match(new RegExp(`^${name}=(\\S+)$`, "m"))?.[1]
    expect(testJob).toContain(`npx --yes impeccable@${pin("IMPECCABLE_VERSION")} detect registry/ theme/`)
    expect(testJob).toContain(`npx --yes shadcn@${pin("SHADCN_VERSION")} build --output ./r`)
    expect(design).toContain(`npx --yes impeccable@${pin("IMPECCABLE_VERSION")} detect registry/ theme/`)
  })

  it("fails the test job on a stale or unadded r/, as check.sh does", () => {
    expect(testJob).toMatch(/git diff --quiet -- r\//)
    expect(testJob).toMatch(/git ls-files --others --exclude-standard -- r\//)
    expect(testJob).toMatch(/exit 1/)
  })

  it("lists the full check in the job name", () => {
    const name = testJob.match(/^\s+name: (.*)$/m)?.[1] ?? ""
    expect(name).toContain("design detector")
    expect(name).toContain("registry drift")
  })

  it("asks first whether anything would ship, before any install or gate (design-system#203)", () => {
    const precheck = testJob.indexOf("scripts/release/release-needed.sh")
    expect(precheck).toBeGreaterThan(testJob.indexOf("actions/checkout"))
    expect(precheck).toBeLessThan(testJob.indexOf("pnpm install"))
    expect(precheck).toBeLessThan(testJob.indexOf("pnpm test"))
    expect(testJob).toMatch(/id: precheck/)
    expect(testJob).toMatch(/fetch-depth: 0/)
    expect(testJob).toMatch(/releasable: \$\{\{ steps\.precheck\.outputs\.releasable \}\}/)
  })

  it("skips every install and gate step when nothing is releasable", () => {
    const afterPrecheck = testJob.slice(testJob.indexOf("id: precheck"))
    const steps = afterPrecheck.split(/\n      - /).slice(1)
    expect(steps.length).toBeGreaterThan(8)
    for (const step of steps) {
      expect(step, step.split("\n")[0]).toContain("steps.precheck.outputs.releasable == 'true'")
    }
  })

  it("lets Release run only when the pre-check found something to release", () => {
    expect(releaseJob).toMatch(/if: needs\.test\.outputs\.releasable == 'true'\s*$/m)
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
    expect(gate).toBeLessThan(releaseJob.indexOf("pnpm exec semantic-release"))
  })

  it("releases from the tip of deploy with plain semantic-release, no retry or catch-up wrapper", () => {
    expect(releaseJob).toMatch(/ref: deploy/)
    expect(releaseJob).toContain("run: pnpm exec semantic-release")
    expect(workflow).not.toContain("release-with-retry")
    expect(workflow).not.toContain("catch-up-release-tags")
    expect(workflow).not.toMatch(/CATCH_UP_FROM|RELEASE_BRANCH/)
  })

  // design-system#203: the stamp-and-restore release pushed a bot commit to main and tagged a
  // commit that deploy never held. Nothing in the release may push a branch now.
  it("pushes nothing: no git push in the workflow, and nothing in the repo's release scripts", () => {
    expect(workflow).not.toMatch(/git push/)
    expect(workflow).not.toMatch(/targetBranch/)
    const scripts = readdirSync(join(root, "scripts/release"))
    expect(scripts.sort()).toEqual(["release-needed.sh", "tested-head.sh"])
    for (const script of scripts) expect(read(`scripts/release/${script}`)).not.toMatch(/git push/)
  })

  it("keeps the shared release concurrency group, queued and never cancelled", () => {
    expect(workflow).toMatch(/^concurrency:\s*\n\s+group: release\s*\n\s+cancel-in-progress: false\s*$/m)
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

  // The tag lands on HEAD, so nothing may sit above the promoted SHA, a legacy release-bot commit included.
  it("does not release when anything, even a legacy release-bot commit, sits above the tested SHA", () => {
    const tested = commit("fix: thing")
    commit("chore(release): 1.2.3 [skip ci]")
    expect(gate(tested).stdout.trim()).toBe("release=false")
  })

  it("does not release a SHA that is not on the branch at all", () => {
    commit("fix: thing")
    expect(gate("0".repeat(40)).stdout.trim()).toBe("release=false")
  })

  it("fails loudly with no SHA argument instead of releasing", () => {
    commit("fix: thing")
    const result = gate()
    expect(result.status).not.toBe(0)
    expect(result.stdout).not.toContain("release=true")
  })
})

describe("scripts/release/release-needed.sh", () => {
  const script = join(root, "scripts/release/release-needed.sh")
  let dir: string

  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim()
  const commit = (message: string) => {
    writeFileSync(join(dir, "f.txt"), `${message}\n${Math.random()}\n`)
    git("add", "f.txt")
    git("commit", "-q", "-m", message)
  }
  const releasable = () => {
    const result = spawnSync("bash", [script], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: "" } })
    expect(result.status, result.stderr).toBe(0)
    return result.stdout.trim()
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "release-needed-"))
    git("init", "-q", "-b", "deploy")
    git("config", "user.email", "t@example.com")
    git("config", "user.name", "t")
    git("config", "commit.gpgsign", "false")
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("says true with no tag yet and a releasable commit", () => {
    commit("feat: first")
    expect(releasable()).toBe("releasable=true")
  })

  it.each(["feat: new block", "fix(scope): a bug", "perf: faster", "revert: a change", "feat!: renamed"])(
    "says true for %s since the last tag",
    (subject) => {
      commit("feat: old")
      git("tag", "v1.0.0")
      commit("chore: tidy")
      commit(subject)
      expect(releasable()).toBe("releasable=true")
    },
  )

  it("says true for a breaking-change footer on any type", () => {
    commit("feat: old")
    git("tag", "v1.0.0")
    commit("chore: drop a prop\n\nBREAKING CHANGE: the prop is gone")
    expect(releasable()).toBe("releasable=true")
  })

  it("says false when only chore, docs, ci, test, refactor and style commits follow the tag", () => {
    commit("feat: old")
    git("tag", "v1.0.0")
    for (const subject of ["chore: a", "docs: b", "ci: c", "test: d", "refactor: e", "style: f", "chore(release): 1.0.1 [skip ci]"]) commit(subject)
    expect(releasable()).toBe("releasable=false")
  })

  it("does not count a releasable commit at or below the tag", () => {
    commit("fix: already shipped")
    git("tag", "v1.0.0")
    commit("chore: after")
    expect(releasable()).toBe("releasable=false")
  })

  it("does not read a bare `!` on a chore as a release, as the analyzer here does not", () => {
    commit("feat: old")
    git("tag", "v1.0.0")
    commit("chore!: no footer")
    expect(releasable()).toBe("releasable=false")
  })

  it("does not read a lookalike inside a subject as a type", () => {
    commit("feat: old")
    git("tag", "v1.0.0")
    commit("docs: explain why feat: matters")
    expect(releasable()).toBe("releasable=false")
  })

  it("writes releasable=<value> to $GITHUB_OUTPUT when set", () => {
    commit("feat: first")
    const out = join(dir, "..", `out-${Math.random().toString(36).slice(2)}`)
    const result = spawnSync("bash", [script], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: out } })
    expect(result.status).toBe(0)
    expect(readFileSync(out, "utf8")).toBe("releasable=true\n")
    rmSync(out)
  })
})
