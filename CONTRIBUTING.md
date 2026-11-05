# Contributing

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) to drive automated versioning via [semantic-release](https://semantic-release.gitbook.io/). The commits promoted to `deploy` are scanned by the `Release` workflow (`.github/workflows/release.yml`, a push to `deploy`; its `Test before release (...)` job must pass first) to decide the next version, changelog entry, and GitHub release.

Format:

```
type(scope): subject

body (optional)

footer (optional)
```

| Type | Effect | Example |
|---|---|---|
| `fix` | patch release (`x.y.Z`) | `fix: lighten surface-border-light to meet WCAG 3:1 UI contrast` |
| `feat` | minor release (`x.Y.z`) | `feat: add dark-elevation ramp and animation tokens` |
| `feat!` / `fix!` / footer `BREAKING CHANGE:` | major release (`X.y.z`) | `feat!: rename core theme token namespace` |
| `docs`, `chore`, `ci`, `refactor`, `test`, `style` | no release | `docs: fix stale README claims re theme tokens` |

`scope` is optional and free-form.

Squash-merged PRs should carry a Conventional Commits–style title, since that becomes the commit message on `main`. Past commits predate this convention and are left untouched.

The squash subject must keep the type prefix. A plain subject such as `Lower the app-shell tab bar (#126)` on `main` is read as no release: semantic-release only reads the subject line (and a `BREAKING CHANGE:` footer), not the `fix:` lines in the squash body, so #126 shipped to `main` with no version until a follow-up `fix:` PR released it. Pass `--subject "fix: <imperative subject> (#N)"` to `gh pr merge --squash`.

## When a release happens

`Release` never runs from a red head (design-system#159, design-system#191). It starts on a push to `deploy` (the owner's promotion, `docs/deploy-branch.md`) and runs two jobs in order: `Test before release (component tests, curve geometry gate, lint)` on the promoted SHA, then `Release`, which `needs:` it. It then publishes only if the promoted SHA is still the newest commit on `deploy` that is not a `chore(release):` commit. If a newer promotion has landed, this run does nothing and the newer promotion's own run follows. A real commit that skipped CI blocks the release the same way, until a later promotion goes green. The `Design` workflow is separate and does not gate a release.
