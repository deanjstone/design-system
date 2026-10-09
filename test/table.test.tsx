import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../registry/base-nova/ui/table"

afterEach(cleanup)

function renderUsers({ selectedRow }: { selectedRow?: Record<string, string> } = {}) {
  render(
    <Table className="table-fixed">
      <TableCaption>Users with access to the shell.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">User</TableHead>
          <TableHead scope="col">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow {...selectedRow}>
          <TableCell>Ada</TableCell>
          <TableCell>Active</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Grace</TableCell>
          <TableCell>Invited</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>2 users</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
  return screen.getByRole("table", { name: "Users with access to the shell." })
}

describe("Table", () => {
  it("renders native table semantics, named by its caption", () => {
    const table = renderUsers()

    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "User",
      "Status",
    ])
    expect(within(table).getAllByRole("row")).toHaveLength(4)
    expect(within(table).getAllByRole("cell")[0].textContent).toBe("Ada")
  })

  // The wrapper scrolls a wide table instead of the page; className goes to
  // the <table>, so layout utilities like table-fixed still reach it.
  it("wraps the table in a horizontally scrolling container and forwards className to the table", () => {
    const table = renderUsers()
    const container = table.parentElement!

    expect(container.dataset.slot).toBe("table-container")
    expect(container.className.split(/\s+/)).toContain("overflow-x-auto")
    expect(table.className.split(/\s+/)).toContain("table-fixed")
  })

  it("marks every part with a data-slot", () => {
    const table = renderUsers()

    const slots = [...table.querySelectorAll("[data-slot]")].map((node) => node.getAttribute("data-slot"))
    expect(new Set(slots)).toEqual(
      new Set([
        "table-caption",
        "table-header",
        "table-row",
        "table-head",
        "table-body",
        "table-cell",
        "table-footer",
      ])
    )
  })

  it("styles with semantic tokens only, no raw palette colours", () => {
    const table = renderUsers()
    const classes = [table.parentElement!, table, ...table.querySelectorAll<HTMLElement>("[data-slot]")]
      .flatMap((node) => node.className.split(/\s+/))

    expect(classes.filter((token) => /(?:^|:)(?:bg|text|border)-(?:gray|zinc|slate|neutral|stone|white|black)\b/.test(token))).toEqual([])
    expect(classes.some((token) => token.endsWith("text-muted-foreground"))).toBe(true)
  })

  // Base UI marks state with bare data attributes (data-selected), where
  // Radix and TanStack examples use data-state="selected"; a row honours both.
  it.each([
    ["data-selected", { "data-selected": "" }],
    ['data-state="selected"', { "data-state": "selected" }],
  ])("highlights a row marked %s", (_label, selectedRow) => {
    const table = renderUsers({ selectedRow })
    const row = within(table).getAllByRole("row")[1]
    const selector = (variant: string) =>
      variant.startsWith("data-[") ? `[data-${variant.slice("data-[".length, -1)}]` : `[${variant}]`

    const highlights = row.className
      .split(/\s+/)
      .filter((token) => token.endsWith(":bg-muted") && token.startsWith("data-"))
      .map((token) => selector(token.slice(0, -":bg-muted".length)))

    expect(highlights.length).toBeGreaterThan(0)
    expect(highlights.some((cssSelector) => row.matches(cssSelector))).toBe(true)
  })
})
