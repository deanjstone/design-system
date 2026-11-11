# design-system: the deploy branch

A new registry version is published only when the owner promotes a commit on `main` to the
`deploy` branch. A push to `main` runs Test and nothing else: no tag, no GitHub release. Model and decisions: argus-config#1048 (map), design-system#179, modelled on
atto1/58. Design-system is a trunk repo (small commits straight to `main`), so there is no PR
in this loop.

## What runs where

| Event | Workflow | Result |
|---|---|---|
| push to `main` | `test.yml`, `design.yml` | tests, the curve geometry gate (only when one of its inputs changed), lint, output drift. Nothing is published. |
| push to `deploy` | `release.yml` ("Release") | job 1, `Test before release (component tests, design detector, registry drift, curve geometry gate, lint)`, first asks `scripts/release/release-needed.sh` whether anything would ship; with no `feat`, `fix`, `perf`, `revert` or breaking commit since the last tag it ends green with no test and no version. Otherwise it runs those gates on exactly the promoted SHA, the geometry gate every time. Job 2, `Release`, needs it and runs only when something is releasable: semantic-release cuts `vX.Y.Z` from the commits promoted since the last tag. |
| `workflow_dispatch` of `release.yml` | `release.yml` | the same two jobs, from `deploy` only: the first step fails a run on any other ref |
| pull request | `test.yml`, `design.yml` | checks only |

This is the shared release pattern (argus-config#1167, design-system#191): one `Release`
workflow on `push: [deploy]`, a test job named for what it runs, and a Release job that
`needs:` it, so a red test means no version (design-system#159). `test.yml` does not run on
`deploy`; the promotion is tested inside `release.yml`. The Release job still releases only
when the promoted SHA is still the tip of `deploy` (`scripts/release/tested-head.sh`).
Releases are queued one at a time, never cancelled (`concurrency: { group: release,
cancel-in-progress: false }`).

There is no `workflow_run` trigger. That event sets `GITHUB_REF` to the default branch
(`main`), semantic-release reads its branch from there, and the first promotion logged "only
publish from deploy" and published nothing (design-system#190). On a push to `deploy`
`GITHUB_REF` is `refs/heads/deploy`, so nothing overrides it. The workflow file used is the one
at the pushed SHA, so a change to `release.yml` acts at the next promotion that contains it.

## What a release does

The release is built from the promoted SHA, never from a newer `main`, and it commits and
pushes nothing (design-system#203, argus-config#1259). `deploy` stays a fast-forward of
`main`, and `main` gains no bot commit.

1. The test job's pre-check decides whether anything is releasable. If not, the run ends
   there: no test, no version.
2. The Release job checks out the tip of `deploy` and `tested-head.sh` confirms it is the
   tested SHA.
3. semantic-release reads the commits promoted since the last tag, picks the version,
   creates the `vX.Y.Z` tag **on the promoted SHA** and publishes the GitHub release. The
   tag is in `deploy`'s history: `git merge-base --is-ancestor <tag> origin/deploy` holds.
   It also writes semantic-release's own `refs/notes/semantic-release-*` ref, which is not
   a branch.

`.releaserc.json` has three plugins (commit analyzer, release notes, GitHub), so nothing
writes `CHANGELOG.md` or `package.json`: the changelog is frozen at 3.24.0 and the GitHub
release notes carry the history. The earlier release stamped `#<tag>` into
`registryDependencies`, tagged that stamped commit and pushed a restore commit to `main`
(design-system#65); that is retired. A tag now pins the named item, and its in-repo
dependencies float to `main`: README, "Pinning to a release".

An unpinned `shadcn add deanjstone/design-system/<item>` still reads `main`, not `deploy`.
Pin to a tag (README, "Pinning to a release") for a version that has been promoted.

## See what is merged but not released

```bash
git fetch origin && git log --oneline origin/deploy..origin/main
```

## Promote

Run it from a T3 **approval-required** thread or a terminal. The deploy gate asks for live
approval there and denies it in every other permission mode.

```bash
scripts/promote.sh --dry-run <sha>   # what would ship, and the exact push
scripts/promote.sh <sha>             # git push origin <sha>:refs/heads/deploy
gh run list --branch deploy --limit 5
```

`<sha>` is any commit on `origin/main`; `scripts/promote.sh main` promotes the tip. The push is
fast-forward only. The script refuses a SHA that is not on `main`, one that would move
`deploy` backwards, one whose message carries the skip-CI marker (GitHub runs no workflow for
such a push; the release bot's old commits on `main` carry it, and the refusal names the
nearest commit below it to promote instead), and any run inside GitHub Actions (a push made
with `GITHUB_TOKEN` triggers no workflow).

Wait for the release to finish before promoting again. A second promotion made while one is
in flight is queued, but it releases from whatever `deploy` holds when its turn comes.

## Roll back

A rollback is a revert on `main`, then a promotion. `deploy` is never force-pushed.

1. `git revert <bad-sha>`, push to `main`.
2. `scripts/promote.sh <the revert's SHA on main>`.

The release the revert produces (the revert is a `revert:` or `fix:` commit, so it is
releasable) becomes the version consumers pin to. A published tag is not
deleted.

## Replay a release that did not run

Re-run the failed `Release` run from the Actions tab: it re-runs the same workflow file and
re-reads the tip of `deploy`. If the run failed after the tag was made, the next run sees nothing new since that tag and
tags nothing. To
run the current `release.yml` against the tip of `deploy` without a new promotion, dispatch it
(it refuses any ref but `deploy`):

```bash
gh workflow run release.yml --ref deploy
```

If the promoted SHA's `Test before release` job was red, fix `main`, then promote the fix.

## First-time setup (owner, once)

Nothing below exists until the owner runs it. Agents prepare it and never run it.

1. **Create `deploy`** at the first SHA to promote, from a terminal or approval-required
   thread: `scripts/promote.sh <sha>`. The first push runs `Release` once (its tests first). Pick a
   `main` SHA that is not a release-bot commit; the script refuses those. Everything since the
   last tag (`v3.17.0` at the time of writing) is released.
2. **Add `deanjstone/design-system` to the ops hub promotion list**
   (`OPS_HUB_PROMOTION_REPOS` in the hub's environment), so the hub card can approve a
   promotion. Until then promotion is `scripts/promote.sh` from an approval-required thread.
3. **Do not protect `deploy` against the owner's fast-forward push**, and do not require pull
   requests on it. The release job never pushes it, but semantic-release checks it could.

## Tests

`test/promote.test.ts` covers `promote.sh`, including the skip-CI marker refusals.
`test/release-tag.test.ts` runs the real semantic-release (the repo's `.releaserc.json` minus the
GitHub plugin) against a bare local remote: a feat promotion gets a version whose tag is the
promoted SHA and in `deploy`, no branch gains a commit, a second promotion versions from the
first tag, a chore-only promotion yields none. `test/release-gate.test.ts` covers
`release-needed.sh` and `tested-head.sh` and pins `release.yml`'s shape: a push to `deploy`, no
`workflow_run`, a pre-check ahead of every install and gate step, a `Test before release (...)`
job that Release `needs:`, plain `semantic-release`, and no `git push`. `test/deploy-branch.test.ts`
pins the wiring: `deploy` is the only release branch, no plugin commits or pushes, and no
workflow but `release.yml` releases.

## Gotchas

- **Never squash-merge or merge `main` into `deploy`.** Promotion is a fast-forward push only.
- **A push whose head commit carries the skip-CI marker runs no workflow.** `promote.sh`
  refuses it.
- **A release adds no commit to `main`.** Releases up to 3.24.0 did (`chore(release)`
  commits, which stay in history); promote the next real commit, not one of those.
- **The promoted SHA is re-tested inside Release.** A flaky run holds the release; the fix is a
  new commit on `main` and a new promotion.
