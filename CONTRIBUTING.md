# Contributing

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) to drive automated versioning via [semantic-release](https://semantic-release.gitbook.io/). Every commit on `main` is scanned by the `Release` workflow (`.github/workflows/release.yml`) to decide the next version, changelog entry, and GitHub release.

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
