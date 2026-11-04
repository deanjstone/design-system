// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// design-system#179 (map argus-config#1048, modelled on atto1/58): production
// changes only when the owner promotes a commit on main to the `deploy` branch.
// scripts/promote.sh is the one way to move it. Every case builds a throwaway
// repo with a local bare origin; nothing touches the real remote.

vi.setConfig({ testTimeout: 30_000 })

const root = fileURLToPath(new URL("../", import.meta.url))
const promote = join(root, "scripts/promote.sh")

const identity = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: { ...process.env, ...identity } }).trim()

const run = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const inherited = { ...process.env }
  delete inherited.GITHUB_ACTIONS
  const result = spawnSync("bash", [promote, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...inherited, ...identity, ...env },
  })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

let work: string
let repo: string
let one: string
let two: string
const originDir = () => join(work, "origin.git")
const remoteHasDeploy = () =>
  spawnSync("git", ["-C", originDir(), "rev-parse", "--verify", "--quiet", "refs/heads/deploy"]).status === 0
const remoteDeploy = () => git(originDir(), "rev-parse", "refs/heads/deploy")

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "promote-"))
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", originDir()])
  execFileSync("git", ["clone", "-q", originDir(), join(work, "repo")], { stdio: "ignore" })
  repo = join(work, "repo")
  git(repo, "commit", "-q", "--allow-empty", "-m", "one")
  git(repo, "commit", "-q", "--allow-empty", "-m", "two")
  git(repo, "push", "-q", "origin", "HEAD:main")
  one = git(repo, "rev-parse", "HEAD~1")
  two = git(repo, "rev-parse", "HEAD")
})

afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

describe("scripts/promote.sh", () => {
  it("creates deploy at a main SHA on the first promotion", () => {
    const result = run([one], repo)
    expect(result.status, result.output).toBe(0)
    expect(remoteDeploy()).toBe(one)
    expect(result.output).toContain("creating deploy")
  })

  it("fast-forwards deploy and lists what ships", () => {
    run([one], repo)
    const result = run(["main"], repo)
    expect(result.status, result.output).toBe(0)
    expect(remoteDeploy()).toBe(two)
    expect(result.output).toContain("two")
  })

  it("changes nothing on a dry run, and prints the exact push", () => {
    const result = run(["--dry-run", one], repo)
    expect(result.status, result.output).toBe(0)
    expect(result.output).toContain(`git push origin ${one}:refs/heads/deploy`)
    expect(remoteHasDeploy()).toBe(false)
  })

  it("is a no-op when deploy is already there", () => {
    run([two], repo)
    const result = run([two], repo)
    expect(result.status).toBe(0)
    expect(result.output).toContain("Nothing to do")
  })

  it("refuses a SHA that is not on main", () => {
    git(repo, "checkout", "-q", "-b", "side")
    git(repo, "commit", "-q", "--allow-empty", "-m", "side")
    git(repo, "push", "-q", "origin", "side")
    const result = run([git(repo, "rev-parse", "HEAD")], repo)
    expect(result.status).toBe(1)
    expect(result.output).toContain("not on origin/main")
    expect(remoteHasDeploy()).toBe(false)
  })

  it("refuses to move deploy backwards: a rollback is a revert on main", () => {
    run([two], repo)
    const result = run([one], repo)
    expect(result.status).toBe(1)
    expect(result.output).toContain("not a fast-forward")
    expect(result.output).toContain("git revert")
    expect(remoteDeploy()).toBe(two)
  })

  it("refuses an unknown ref", () => {
    const result = run(["no-such-ref"], repo)
    expect(result.status).toBe(1)
    expect(result.output).toContain("unknown commit")
  })

  it("refuses without exactly one target", () => {
    expect(run([], repo).status).toBe(2)
    expect(run([one, two], repo).status).toBe(2)
  })

  it("refuses to run in GitHub Actions, where a GITHUB_TOKEN push deploys nothing", () => {
    const result = run([one], repo, { GITHUB_ACTIONS: "true" })
    expect(result.status).toBe(1)
    expect(result.output).toContain("refusing to run in GitHub Actions")
    expect(remoteHasDeploy()).toBe(false)
  })

  // GitHub runs no push workflow when the head commit of a push carries the
  // skip-CI marker, and the release bot's commits on main carry one
  // (argus-config#1060). The markers are built from parts so this file never
  // carries the literal token.
  describe("the skip-CI marker guard", () => {
    const marker = (phrase: string) => `[${phrase}]`
    const commitOnMain = (message: string) => {
      git(repo, "commit", "-q", "--allow-empty", "-m", message)
      git(repo, "push", "-q", "origin", "HEAD:main")
      return git(repo, "rev-parse", "HEAD")
    }
    const release = (version: string, phrase = "skip ci") =>
      commitOnMain(`chore(release): ${version} ${marker(phrase)}`)

    it.each(["skip ci", "ci skip", "no ci", "skip actions", "actions skip", "SKIP CI"])(
      "refuses a marker commit spelled %s",
      (phrase) => {
        const result = run([release("1.0.0", phrase)], repo)
        expect(result.status, result.output).toBe(1)
        expect(result.output).toContain("carries the skip-CI marker")
        expect(remoteHasDeploy()).toBe(false)
      },
    )

    it("refuses a skip-checks trailer", () => {
      const result = run([commitOnMain("chore: release\n\nskip-checks: true")], repo)
      expect(result.status, result.output).toBe(1)
      expect(result.output).toContain("carries the skip-CI marker")
    })

    it("names the nearest unmarked commit below it as the SHA to promote instead", () => {
      run([one], repo)
      const result = run([release("1.0.0")], repo)
      expect(result.status).toBe(1)
      expect(result.output).toContain(`scripts/promote.sh ${two}`)
      expect(remoteDeploy()).toBe(one)
    })

    it("walks past two stacked marker commits", () => {
      run([one], repo)
      release("1.0.0")
      const result = run([release("1.0.1", "ci skip")], repo)
      expect(result.status).toBe(1)
      expect(result.output).toContain(`scripts/promote.sh ${two}`)
    })

    it("reports nothing deployable for marker commits directly above the deploy tip", () => {
      run([two], repo)
      release("1.0.0")
      const result = run([release("1.0.1")], repo)
      expect(result.status).toBe(1)
      expect(result.output).toContain("no deployable commit ahead of deploy")
      expect(result.output).not.toContain("Run instead")
      expect(remoteDeploy()).toBe(two)
    })

    it("still promotes an ordinary commit, and a commit above an older marker commit", () => {
      run([one], repo)
      release("1.0.0")
      const sha = commitOnMain("feat: after the release")
      const result = run([sha], repo)
      expect(result.status, result.output).toBe(0)
      expect(remoteDeploy()).toBe(sha)
    })
  })
})
