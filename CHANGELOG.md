# [2.1.0](https://github.com/deanjstone/design-system/compare/v2.0.0...v2.1.0) (2026-09-03)


### Features

* the registry owns the font token (IBM Plex Sans) ([#40](https://github.com/deanjstone/design-system/issues/40)) ([15b2a2f](https://github.com/deanjstone/design-system/commit/15b2a2f4ab9d380331b08914a1a899acc9d2228e))

# [2.0.0](https://github.com/deanjstone/design-system/compare/v1.0.4...v2.0.0) (2026-09-03)


* feat!: switch the component library from Radix to Base UI ([#38](https://github.com/deanjstone/design-system/issues/38)) ([a9e23b5](https://github.com/deanjstone/design-system/commit/a9e23b5e2f528435c405afe5db354ae06b2cb8f6)), closes [#10](https://github.com/deanjstone/design-system/issues/10) [31-#34](https://github.com/31-/issues/34) [#31](https://github.com/deanjstone/design-system/issues/31) [#5](https://github.com/deanjstone/design-system/issues/5) [#10](https://github.com/deanjstone/design-system/issues/10)


### BREAKING CHANGES

* components are Base UI, not Radix. `asChild` no longer
exists; use Base UI's `render` prop. Consumers must reinstall with
`shadcn init -b base` (the CLI default) rather than `-b radix`.

## [1.0.4](https://github.com/deanjstone/design-system/compare/v1.0.3...v1.0.4) (2026-09-03)


### Bug Fixes

* reduced-motion pulse override targeted a variable that does not exist ([#34](https://github.com/deanjstone/design-system/issues/34)) ([f86fbaf](https://github.com/deanjstone/design-system/commit/f86fbaff483319fa178700d3f6e8c3d20df837c6)), closes [#31](https://github.com/deanjstone/design-system/issues/31)

## [1.0.3](https://github.com/deanjstone/design-system/compare/v1.0.2...v1.0.3) (2026-09-02)


### Bug Fixes

* pair destructive with a foreground token and finish focus drift ([#33](https://github.com/deanjstone/design-system/issues/33)) ([c38820e](https://github.com/deanjstone/design-system/commit/c38820ebe5b0fda7ef21e77987bb9a666ae16757)), closes [#fff](https://github.com/deanjstone/design-system/issues/fff)

## [1.0.2](https://github.com/deanjstone/design-system/compare/v1.0.1...v1.0.2) (2026-09-02)


### Bug Fixes

* adapt tabs overflow and touch targets to input capability ([#32](https://github.com/deanjstone/design-system/issues/32)) ([5edfe24](https://github.com/deanjstone/design-system/commit/5edfe24b233ad980b17db1dcd38982b37295084d))

## [1.0.1](https://github.com/deanjstone/design-system/compare/v1.0.0...v1.0.1) (2026-09-02)


### Bug Fixes

* harden contrast, cross-mode recipes, motion and overflow ([#31](https://github.com/deanjstone/design-system/issues/31)) ([1d93eaa](https://github.com/deanjstone/design-system/commit/1d93eaa9ede5891155223d7a9549c0a0ecb701fc))

# 1.0.0 (2026-08-03)


### Bug Fixes

* lighten surface-border-light to meet WCAG 3:1 UI contrast ([#23](https://github.com/deanjstone/design-system/issues/23)) ([2e0ddbf](https://github.com/deanjstone/design-system/commit/2e0ddbfd1d01d05e23727b609b86a5deffb6363d)), closes [#363650](https://github.com/deanjstone/design-system/issues/363650) [#72729c](https://github.com/deanjstone/design-system/issues/72729c) [#22](https://github.com/deanjstone/design-system/issues/22)


### Features

* add semantic-release for automated versioning ([#27](https://github.com/deanjstone/design-system/issues/27)) ([04d8558](https://github.com/deanjstone/design-system/commit/04d8558e1d23f58135a8291a1c72a7f300c08fef))
