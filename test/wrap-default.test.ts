// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// Text wraps by default (design-system#205). `truncate` and `line-clamp` stay only on one-line navigation
// and chrome: a label in a bar, a tab, a menu, a select or a button that has one fixed-height line. This
// test is the list of every place that kept one, with the reason. A new `truncate` anywhere else in the
// registry fails here, so it is a decision, not a habit. Customisation is untouched: a consumer can still
// pass `truncate` or `line-clamp-N` in a `className` to cut one component's text.

const root = fileURLToPath(new URL("../registry/base-nova/", import.meta.url))

const CUT = /(?<![-\w])(?:[^\s"'`]*:)?(?:truncate|line-clamp-\d)(?![-\w])/g

const files = ["ui", "blocks", "hooks"].flatMap((folder) =>
  readdirSync(`${root}${folder}`)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => `${folder}/${name}`),
)

const cuts = (file: string) => readFileSync(`${root}${file}`, "utf8").match(CUT)?.length ?? 0

// file -> how many cuts it keeps, and why each is navigation or chrome.
const KEPT: Record<string, { count: number; why: string }> = {
  "blocks/app-shell.tsx": { count: 2, why: "tab bar labels and the More tab: one-line navigation, icon-only past 200%" },
  "blocks/app-switcher.tsx": { count: 4, why: "the app name in the header, the trigger and each app's name and description in the switcher menu" },
  "blocks/filter-builder.tsx": { count: 2, why: "the value button's summary (a select trigger) and the active-filter chip's label (a fixed-height button)" },
  "ui/code-block.tsx": { count: 1, why: "the header's title: the one-line chrome bar above the code, beside its action buttons" },
  "ui/select.tsx": { count: 1, why: "the select trigger's value: a select trigger" },
  "ui/sidebar.tsx": { count: 2, why: "sidebar menu button labels: navigation" },
  "ui/trace.tsx": { count: 1, why: "the trace line's title: the one-line collapsible trigger, chrome" },
}

describe("wrap by default", () => {
  it("keeps truncate and line-clamp only in the listed navigation and chrome", () => {
    const found = Object.fromEntries(files.map((file) => [file, cuts(file)]).filter(([, count]) => count > 0))

    expect(found).toEqual(Object.fromEntries(Object.entries(KEPT).map(([file, { count }]) => [file, count])))
  })

  it("gives every kept cut a reason", () => {
    for (const [file, { why }] of Object.entries(KEPT)) expect(why.length, file).toBeGreaterThan(10)
  })

  it("lets the card text components wrap a token with no spaces", () => {
    for (const file of ["ui/item.tsx", "ui/card.tsx", "blocks/card-list.tsx", "blocks/issue-row.tsx", "blocks/file-diff.tsx"]) {
      expect(readFileSync(`${root}${file}`, "utf8"), file).toContain("wrap-anywhere")
    }
  })
})
