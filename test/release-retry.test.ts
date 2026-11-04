// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// scripts/release/release-with-retry.sh runs semantic-release up to three times,
// fast-forwarding to the remote tip before each (argus-config#1016, modelled on
// argus's release.yml). The remote is a real bare repo in a temp dir, so the
// non-fast-forward cases are git's own rejections, not a simulation of them.

// Each case builds real git repos and runs the script through up to three attempts, which
// takes 5-8 s on a loaded shared host: over vitest's 5 s default, so the "rejected on all 3
// attempts" case timed out while its assertions held.
vi.setConfig({ testTimeout: 30_000 })

const root = fileURLToPath(new URL("../", import.meta.url))
const script = join(root, "scripts/release/release-with-retry.sh")

let dir: string
let remote: string
let work: string
let racer: string

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim()

const commit = (cwd: string, file: string, message: string) => {
  writeFileSync(join(cwd, file), `${message}\n`)
  git(cwd, "add", file)
  git(cwd, "commit", "-q", "-m", message)
}

// The stand-in for `pnpm exec semantic-release`: a bash script that counts its
// runs in $dir/attempts and runs the body the test gives it for that attempt.
const releaseCommand = (body: string) => {
  const path = join(dir, "fake-release.sh")
  writeFileSync(
    path,
    `#!/usr/bin/env bash
set -u
n=$(( $(cat "${dir}/attempts" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "${dir}/attempts"
${body}
`,
  )
  chmodSync(path, 0o755)
  return path
}

const run = (command: string) =>
  spawnSync("bash", [script], {
    cwd: work,
    encoding: "utf8",
    env: { ...process.env, RELEASE_COMMAND: command, RUNNER_TEMP: dir },
  })

const attempts = () => Number(existsSync(join(dir, "attempts")) ? readFileSync(join(dir, "attempts"), "utf8") : 0)
const remoteLog = () => git(remote, "log", "--format=%s", "main").split("\n")

// Pushes from the second clone, as an agent landing a commit mid-release.
const racerPushes = (message: string) => {
  git(racer, "pull", "-q", "--ff-only", "origin", "main")
  commit(racer, `${message.replace(/\W+/g, "-")}.txt`, message)
  git(racer, "push", "-q", "origin", "main")
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "release-retry-"))
  remote = join(dir, "remote.git")
  work = join(dir, "work")
  racer = join(dir, "racer")
  git(dir, "init", "-q", "--bare", "-b", "main", remote)
  git(dir, "clone", "-q", remote, work)
  git(work, "config", "user.email", "bot@example.com")
  git(work, "config", "user.name", "Bot")
  git(work, "checkout", "-q", "-B", "main")
  commit(work, "a.txt", "feat: first")
  git(work, "push", "-q", "-u", "origin", "main")
  git(dir, "clone", "-q", remote, racer)
  git(racer, "config", "user.email", "agent@example.com")
  git(racer, "config", "user.name", "Agent")
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("scripts/release/release-with-retry.sh", () => {
  it("runs once and passes through when nothing races", () => {
    const result = run(releaseCommand("echo released"))
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("released")
    expect(attempts()).toBe(1)
    expect(result.stdout + result.stderr).not.toContain("::warning::")
  })

  it("fast-forwards to the remote tip before the first attempt", () => {
    racerPushes("feat: landed while the run queued")
    const result = run(releaseCommand(`git log --format=%s -1 > "${dir}/head-subject"`))
    expect(result.status).toBe(0)
    expect(readFileSync(join(dir, "head-subject"), "utf8").trim()).toBe("feat: landed while the run queued")
  })

  it("retries when semantic-release exits 0 but says the local branch is behind", () => {
    const result = run(
      releaseCommand(`if [ "$n" -eq 1 ]; then
  echo "The local branch main is behind the remote one, therefore a new version won't be published."
else
  echo released
fi`),
    )
    expect(result.status).toBe(0)
    expect(attempts()).toBe(2)
    expect(result.stdout).toContain("::warning::")
    expect(result.stdout).toContain("attempt 1 of 3")
  })

  it("fails with an ::error:: line when still behind after 3 attempts", () => {
    const result = run(releaseCommand(`echo "The local branch main is behind the remote one, therefore a new version won't be published."`))
    expect(result.status).toBe(1)
    expect(attempts()).toBe(3)
    expect(result.stdout).toContain("::error::")
    expect(result.stdout).toContain("still behind the remote after 3 attempts")
  })

  it("rebases onto the remote and pushes again after a real non-fast-forward rejection", () => {
    // Attempt 1: the release commit is made, an agent pushes first, so the
    // release push is rejected by git. Attempt 2 starts from the new tip.
    const result = run(
      releaseCommand(`commit_and_push() { echo "release $n" > release.txt; git add release.txt; git commit -q -m "chore(release): $n"; git push origin HEAD:main; }
if [ "$n" -eq 1 ]; then
  git -C "${racer}" pull -q --ff-only origin main
  echo race > "${racer}/race.txt"
  git -C "${racer}" add race.txt
  git -C "${racer}" commit -q -m "feat: agent push mid-release"
  git -C "${racer}" push -q origin main
fi
commit_and_push`),
    )
    expect(result.status).toBe(0)
    expect(attempts()).toBe(2)
    expect(result.stdout + result.stderr).toContain("::warning::")
    // The agent's commit survived; one release commit sits on top of it; the
    // rejected attempt-1 release commit is gone from the remote.
    expect(remoteLog()).toEqual(["chore(release): 2", "feat: agent push mid-release", "feat: first"])
    expect(git(work, "rev-parse", "HEAD")).toBe(git(remote, "rev-parse", "main"))
  })

  it("fails with an ::error:: line when the push is rejected on all 3 attempts", () => {
    const result = run(
      releaseCommand(`git -C "${racer}" pull -q --ff-only origin main
echo "$n" > "${racer}/race-$n.txt"
git -C "${racer}" add .
git -C "${racer}" commit -q -m "feat: race $n"
git -C "${racer}" push -q origin main
echo "x" > release.txt; git add release.txt; git commit -q -m "chore(release): never lands"
git push origin HEAD:main`),
    )
    expect(result.status).toBe(1)
    expect(attempts()).toBe(3)
    expect(result.stdout).toContain("::error::")
    expect(result.stdout).toContain("push was rejected 3 times")
    expect(remoteLog()).not.toContain("chore(release): never lands")
  })

  it("does not retry a failure that is not a rejected push, and keeps its exit status", () => {
    const result = run(releaseCommand(`echo "ENOTOKEN No GitHub token specified."; exit 1`))
    expect(result.status).toBe(1)
    expect(attempts()).toBe(1)
    expect(result.stdout).not.toContain("::warning::")
  })

  it("does not treat a protected-branch refusal as a race to retry", () => {
    const result = run(
      releaseCommand(`echo " ! [remote rejected] HEAD -> main (protected branch hook declined)"; exit 1`),
    )
    expect(result.status).toBe(1)
    expect(attempts()).toBe(1)
  })
})

describe("RELEASE_BRANCH=deploy (releases from a promotion, design-system#179)", () => {
  beforeEach(() => {
    git(work, "push", "-q", "origin", "HEAD:deploy")
    // main moves on after the promotion; the release must not see it.
    racerPushes("feat: landed on main after the promotion")
  })

  const runOnDeploy = (command: string) =>
    spawnSync("bash", [script], {
      cwd: work,
      encoding: "utf8",
      env: { ...process.env, RELEASE_COMMAND: command, RUNNER_TEMP: dir, RELEASE_BRANCH: "deploy" },
    })

  it("releases from the promoted commit on a local branch named deploy, not from main", () => {
    const result = runOnDeploy(
      releaseCommand(`git rev-parse --abbrev-ref HEAD > "${dir}/branch"; git log --format=%s -1 > "${dir}/head-subject"`),
    )
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(readFileSync(join(dir, "branch"), "utf8").trim()).toBe("deploy")
    expect(readFileSync(join(dir, "head-subject"), "utf8").trim()).toBe("feat: first")
  })

  it("names deploy in the final error when pushes keep being rejected", () => {
    const result = runOnDeploy(releaseCommand(`echo "! [rejected] HEAD -> main (non-fast-forward)"; exit 1`))
    expect(result.status).toBe(1)
    expect(result.stdout).toContain("push was rejected 3 times because deploy kept moving")
  })
})

describe("the Release workflow", () => {
  const workflow = readFileSync(join(root, ".github/workflows/release.yml"), "utf8")

  it("runs semantic-release through the retry script, from the tip of main", () => {
    expect(workflow).toContain("run: bash scripts/release/release-with-retry.sh")
    expect(workflow).not.toMatch(/run: pnpm exec semantic-release/)
    expect(workflow).toMatch(/ref: main/)
  })

  it("queues releases one at a time instead of cancelling them", () => {
    expect(workflow).toMatch(/concurrency:\s*\n\s*group: release\s*\n\s*cancel-in-progress: false/)
  })
})
