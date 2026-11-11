import { cleanup, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, describe, expect, it } from "vitest"

import { FileDiff } from "../registry/base-nova/blocks/file-diff"

// The wrapping diff block (design-system#205). jsdom has no layout, so these tests read the classes and
// the structure that make the diff wrap; the real-browser check at 390 px is in the issue's Resolution.

afterEach(cleanup)

const LONG_LINE = `const token = "${"abcdefghij".repeat(30)}"`
const LONG_PATH = `apps/ops-hub-web/src/views/${"very-long-directory-name/".repeat(6)}file.tsx`

const PATCH = ["@@ -10,3 +10,4 @@ export function renderAFunctionWithAVeryLongHunkHeaderLine() {", " keep", "-gone", `+${LONG_LINE}`, " tail"].join("\n")

const file = {
  filename: "src/a.ts",
  previousFilename: null,
  status: "modified",
  additions: 1,
  deletions: 1,
  patch: PATCH,
}

const cells = (container: HTMLElement, slot: string) => [...container.querySelectorAll<HTMLElement>(`[data-slot=${slot}]`)]
const rows = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-slot=file-diff-line]")]

describe("FileDiff", () => {
  it("shows the path, and the added and removed counts, in the header", () => {
    render(<FileDiff file={file} />)

    expect(screen.getByRole("button", { name: /src\/a\.ts/ })).toBeTruthy()
    expect(screen.getByText("+1")).toBeTruthy()
    expect(screen.getByText("−1")).toBeTruthy()
  })

  it("puts the old path before the new one on a rename", () => {
    render(<FileDiff file={{ ...file, filename: "src/b.ts", previousFilename: "src/a.ts" }} />)

    expect(screen.getByText("src/a.ts → src/b.ts")).toBeTruthy()
  })

  it("marks the root with the file name and a slot", () => {
    const { container } = render(<FileDiff file={file} />)

    const root = container.firstElementChild!
    expect(root.getAttribute("data-slot")).toBe("file-diff")
    expect(root.getAttribute("data-file")).toBe("src/a.ts")
  })

  it("passes a class on to the root", () => {
    const { container } = render(<FileDiff file={file} className="extra" />)

    expect(container.firstElementChild!.className).toContain("extra")
  })

  describe("wrapping", () => {
    it("wraps a long file path instead of cutting it", () => {
      render(<FileDiff file={{ ...file, filename: LONG_PATH }} />)

      const path = screen.getByText(LONG_PATH)
      expect(path.className).toContain("wrap-anywhere")
      expect(path.className).not.toMatch(/\btruncate\b/)
      expect(path.className).toContain("min-w-0")
      const header = screen.getByRole("button")
      expect(header.className).toContain("whitespace-normal")
      expect(header.className).toContain("h-auto")
    })

    it("wraps a code line, keeping its spaces, and breaks a token with no spaces", () => {
      const { container } = render(<FileDiff file={file} />)

      const code = cells(container, "file-diff-code").find((cell) => cell.textContent === LONG_LINE)!
      expect(code.className).toContain("whitespace-pre-wrap")
      expect(code.className).toContain("wrap-anywhere")
      expect(code.className).toContain("min-w-0")
    })

    it("wraps a hunk header", () => {
      const { container } = render(<FileDiff file={file} />)

      const hunk = rows(container)[0]
      expect(hunk.getAttribute("data-line")).toBe("hunk")
      const code = hunk.querySelector<HTMLElement>("[data-slot=file-diff-code]")!
      expect(code.className).toContain("whitespace-pre-wrap")
      expect(code.className).toContain("wrap-anywhere")
    })

    it("never scrolls sideways or clips a line", () => {
      const { container } = render(<FileDiff file={file} />)

      const everything = [container.firstElementChild!, ...container.querySelectorAll<HTMLElement>("*")]
      for (const element of everything) {
        expect(element.className.toString(), element.tagName).not.toMatch(/overflow-x-(auto|scroll)|\bwhitespace-pre(?![-\w])|\btruncate\b|line-clamp/)
      }
    })

    it("lets every row's text column shrink to the card", () => {
      const { container } = render(<FileDiff file={file} />)

      for (const row of rows(container)) {
        expect(row.className).toContain("grid")
        expect(row.className).toContain("minmax(0,1fr)")
      }
    })
  })

  describe("columns", () => {
    it("gives the + or − sign its own narrow column, apart from the code", () => {
      const { container } = render(<FileDiff file={file} />)

      const added = rows(container).find((row) => row.getAttribute("data-line") === "add")!
      const sign = added.querySelector<HTMLElement>("[data-slot=file-diff-sign]")!
      const code = added.querySelector<HTMLElement>("[data-slot=file-diff-code]")!
      expect(sign.textContent).toBe("+")
      expect(code.textContent).toBe(LONG_LINE)
      expect(sign.contains(code)).toBe(false)
      expect(sign.className).toContain("select-none")

      const deleted = rows(container).find((row) => row.getAttribute("data-line") === "del")!
      expect(deleted.querySelector("[data-slot=file-diff-sign]")!.textContent).toBe("−")
    })

    it("shows two line-number columns from md up, and one below it", () => {
      const { container } = render(<FileDiff file={file} />)

      const context = rows(container).find((row) => row.getAttribute("data-line") === "context")!
      const oldNumber = context.querySelector<HTMLElement>("[data-slot=file-diff-old-line]")!
      const newNumber = context.querySelector<HTMLElement>("[data-slot=file-diff-new-line]")!
      expect(oldNumber.textContent).toBe("10")
      expect(newNumber.textContent).toBe("10")
      expect(oldNumber.className).toContain("max-md:hidden")
      expect(newNumber.className).not.toContain("hidden")
    })

    it("shows the old number on a deleted line below md, where only one column is left", () => {
      const { container } = render(<FileDiff file={file} />)

      const deleted = rows(container).find((row) => row.getAttribute("data-line") === "del")!
      const newNumber = deleted.querySelector<HTMLElement>("[data-slot=file-diff-new-line]")!
      const phoneOnly = newNumber.querySelector<HTMLElement>(".md\\:hidden")!
      expect(phoneOnly.textContent).toBe("11")
    })

    it("drops the old-number track from the grid below md", () => {
      const { container } = render(<FileDiff file={file} />)

      const row = rows(container)[1]
      expect(row.className).toMatch(/max-md:grid-cols-\[[^\]]*\]/)
      expect(row.className).toMatch(/(^|\s)grid-cols-\[[^\]]*\]/)
    })
  })

  describe("edge to edge on phones", () => {
    it("keeps its border and corners by default", () => {
      const { container } = render(<FileDiff file={file} />)

      const root = container.firstElementChild!
      expect(root.className).toContain("rounded-md")
      expect(root.className).not.toContain("max-md:rounded-none")
    })

    it("drops its side borders and corners below md with `bleed`, and keeps clear of the safe areas", () => {
      const { container } = render(<FileDiff file={file} bleed />)

      const root = container.firstElementChild!
      expect(root.className).toContain("max-md:rounded-none")
      expect(root.className).toContain("max-md:border-x-0")
      const body = container.querySelector<HTMLElement>("[data-slot=file-diff-body]")!
      expect(body.className).toContain("max-md:pl-safe")
      expect(body.className).toContain("max-md:pr-safe")
    })
  })

  describe("collapsing", () => {
    it("opens a file with a short patch", () => {
      render(<FileDiff file={file} />)

      expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true")
    })

    it("collapses a file with more than 400 lines", () => {
      const long = ["@@ -1,500 +1,500 @@", ...Array.from({ length: 450 }, (_, index) => `+line ${index}`)].join("\n")
      render(<FileDiff file={{ ...file, patch: long }} />)

      expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false")
    })

    it("lets the caller close a short patch", () => {
      render(<FileDiff file={file} defaultOpen={false} />)

      expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false")
    })

    it("lets the caller open a long patch", () => {
      const long = ["@@ -1,500 +1,500 @@", ...Array.from({ length: 450 }, (_, index) => `+line ${index}`)].join("\n")
      render(<FileDiff file={{ ...file, patch: long }} defaultOpen />)

      expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true")
    })
  })

  describe("a file with no patch", () => {
    it("says a renamed file has no changes", () => {
      render(<FileDiff file={{ ...file, status: "renamed", patch: null }} defaultOpen />)

      expect(screen.getByText("Renamed with no changes.")).toBeTruthy()
    })

    it("starts a file with no patch collapsed", () => {
      render(<FileDiff file={{ ...file, patch: null }} />)

      expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false")
    })

    it("shows the reason for a binary file once it is opened", () => {
      render(<FileDiff file={{ ...file, patch: null }} defaultOpen />)

      expect(screen.getByText("Binary or too large to show; open it on GitHub.")).toBeTruthy()
    })
  })

  it("has no accessibility violations", async () => {
    const { container } = render(<FileDiff file={file} bleed />)

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
