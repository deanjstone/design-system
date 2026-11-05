# design-system: the deploy branch

A new registry version is published only when the owner promotes a commit on `main` to the
`deploy` branch. A push to `main` runs Test and nothing else: no tag, no GitHub release, no
CHANGELOG entry. Model and decisions: argus-config#1048 (map), design-system#179, modelled on
atto1/58. Design-system is a trunk repo (small commits straight to `main`), so there is no PR
in this loop.

## What runs where

| Event | Workflow | Result |
|---|---|---|
| push to `main` | `test.yml`, `design.yml` | tests, the curve geometry gate (only when one of its inputs changed), lint, output drift. Nothing is published. |
| push to `deploy` | `test.yml` | the same checks, on exactly the promoted SHA; the curve geometry gate always runs |
| green `Test` run of a `deploy` push | `release.yml` | semantic-release cuts `vX.Y.Z` from the commits promoted since the last tag |
| pull request | `test.yml`, `design.yml` | checks only |

`release.yml` starts from the finished `Test` run on the `deploy` push (design-system#159), runs
only when that run is green, and releases only when the promoted SHA is still the newest real
commit on `deploy`. Releases are queued one at a time, never cancelled.

A `workflow_run` event sets `GITHUB_REF` to the default branch (`main`), and semantic-release
reads its branch from there. The Release step therefore sets `GITHUB_REF: refs/heads/deploy`
in `release.yml`, and `scripts/release/release-with-retry.sh` sets
`GITHUB_REF=refs/heads/$RELEASE_BRANCH` (and unsets `GITHUB_HEAD_REF`) as well, so the release
sees `deploy`. Without it the first promotion logged "only publish from deploy" and published
nothing (design-system#190). The workflow's value matters first: the script runs from the
`deploy` checkout, so its copy reaches a release only after the next promotion.

## What a release does

The release is built from the promoted SHA, never from a newer `main`. It never pushes
`deploy`, so `deploy` stays a fast-forward of `main`.

1. semantic-release reads the commits promoted since the last tag and picks the version.
2. `scripts/release/semantic-release-pin.mjs` commits the changelog and version files on top
   of the promoted SHA, stamps `#<tag>` into every in-repo `registryDependencies` entry,
   rebuilds `r/`, and commits that as the stamped commit S. The tag lands on S
   (design-system#65).
3. The plugin lands the version bump on `main`: a commit that restores the unversioned
   `registry.json` and `r/`. When `main` has moved past the promoted SHA, that is a merge of
   the bump into the fetched tip of `main` (a conflict fails the job with nothing pushed).
   Either way S is now in `main`'s history.

If the previous release landed on `main` above the SHA promoted next,
`scripts/release/catch-up-release-tags.sh` first merges that tag into the *local* release
checkout (never pushed) so semantic-release still finds the last version.

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
such a push; the release bot's own commits on `main` carry it, and the refusal names the
nearest commit below it to promote instead), and any run inside GitHub Actions (a push made
with `GITHUB_TOKEN` triggers no workflow).

Wait for the release to finish before promoting again. A second promotion made while one is
in flight is queued, but it releases from whatever `deploy` holds when its turn comes.

## Roll back

A rollback is a revert on `main`, then a promotion. `deploy` is never force-pushed.

1. `git revert <bad-sha>`, push to `main`.
2. `scripts/promote.sh <the revert's SHA on main>`.

The release the revert produces becomes the version consumers pin to. A published tag is not
deleted.

## Replay a release that did not run

`release.yml` has no dispatch: it follows a `Test` run. If the run failed after the tag was
made nothing is repeated; if the job failed earlier, re-run the failed `Release` run from the
Actions tab (it re-reads the tip of `deploy`). A re-run keeps the workflow file it started with,
so to replay a release after a fix to `release.yml`, re-run the `Test` run of the `deploy` push
instead (`gh run rerun <test-run-id>`): when it finishes green, a new `Release` run starts from
the current `release.yml`. That is how the run that published nothing because it ran as `main`
(design-system#190) is replayed, with no new promotion. If the promoted SHA's `Test` run was red, fix
`main`, then promote the fix.

## First-time setup (owner, once)

Nothing below exists until the owner runs it. Agents prepare it and never run it.

1. **Create `deploy`** at the first SHA to promote, from a terminal or approval-required
   thread: `scripts/promote.sh <sha>`. The first push runs `Test` then `Release` once. Pick a
   `main` SHA that is not a release-bot commit; the script refuses those. Everything since the
   last tag (`v3.17.0` at the time of writing) is released.
2. **Add `deanjstone/design-system` to the ops hub promotion list**
   (`OPS_HUB_PROMOTION_REPOS` in the hub's environment), so the hub card can approve a
   promotion. Until then promotion is `scripts/promote.sh` from an approval-required thread.
3. **Do not protect `deploy` against the owner's fast-forward push**, and do not require pull
   requests on it. The release job never pushes it, but semantic-release checks it could.

## Tests

`test/promote.test.ts` covers `promote.sh`, including the skip-CI marker refusals.
`test/semantic-release-pin.test.ts` covers the release plugin against real git repos, both on
a main that did not move and on one that did. `test/release-catch-up.test.ts` covers the
catch-up. `test/release-retry.test.ts` and `test/release-gate.test.ts` cover the retry script
(including that `env-ci` resolves the branch to `deploy` under a `workflow_run` event) and the Test gate. `test/deploy-branch.test.ts` pins the wiring: `deploy` is the only release
branch, no plugin pushes it, and no workflow but `release.yml` releases.

## Gotchas

- **Never squash-merge or merge `main` into `deploy`.** Promotion is a fast-forward push only.
- **A push whose head commit carries the skip-CI marker runs no workflow.** `promote.sh`
  refuses it.
- **A release commit lands on `main` after the promotion**, so `main` is always ahead of
  `deploy` by at least the release bot's commits. That is normal; promote the next real
  commit, not the bot's.
- **The promoted SHA is re-tested on `deploy`.** A flaky run holds the release; the fix is a
  new commit on `main` and a new promotion.
