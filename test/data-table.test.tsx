import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable, DataTableColumnHeader } from "../registry/base-nova/ui/data-table"

// The table item measures its scroller with a ResizeObserver, which jsdom lacks.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(cleanup)

type Invoice = { id: string; customer: string; amount: number }

const invoices: Invoice[] = [
  { id: "a", customer: "Zed", amount: 30 },
  { id: "b", customer: "Amy", amount: 10 },
  { id: "c", customer: "Bob", amount: 20 },
]

const columns: ColumnDef<Invoice>[] = [
  { accessorKey: "customer", header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" /> },
  { accessorKey: "amount", header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" /> },
  { id: "actions", header: "Actions", enableSorting: false, cell: () => "Open" },
]

const bodyCustomers = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent)

describe("DataTable", () => {
  it("renders a row per record under a named table", () => {
    render(<DataTable columns={columns} data={invoices} caption="Invoices" />)
    expect(screen.getByRole("table", { name: "Invoices" })).toBeTruthy()
    expect(bodyCustomers()).toEqual(["Zed", "Amy", "Bob"])
  })

  it("sorts ascending, then descending, from the column header, and marks aria-sort", () => {
    render(<DataTable columns={columns} data={invoices} caption="Invoices" />)
    const header = screen.getByRole("columnheader", { name: /Customer/ })
    expect(header.getAttribute("aria-sort")).toBe("none")

    fireEvent.click(screen.getByRole("button", { name: "Customer" }))
    expect(bodyCustomers()).toEqual(["Amy", "Bob", "Zed"])
    expect(header.getAttribute("aria-sort")).toBe("ascending")

    fireEvent.click(screen.getByRole("button", { name: "Customer" }))
    expect(bodyCustomers()).toEqual(["Zed", "Bob", "Amy"])
    expect(header.getAttribute("aria-sort")).toBe("descending")
  })

  it("gives a column with sorting off a plain title and no aria-sort", () => {
    render(<DataTable columns={columns} data={invoices} caption="Invoices" />)
    expect(screen.queryByRole("button", { name: "Actions" })).toBeNull()
    expect(screen.getByRole("columnheader", { name: "Actions" }).hasAttribute("aria-sort")).toBe(false)
  })

  it("filters the chosen column from the search box and shows the empty message when nothing matches", () => {
    render(<DataTable columns={columns} data={invoices} caption="Invoices" filterColumn="customer" filterPlaceholder="Filter customers" />)
    const box = screen.getByRole("textbox", { name: "Filter customers" })

    fireEvent.change(box, { target: { value: "bo" } })
    expect(bodyCustomers()).toEqual(["Bob"])

    fireEvent.change(box, { target: { value: "zzz" } })
    expect(screen.getByText("No results.")).toBeTruthy()
  })

  it("has no search box unless a filter column is named", () => {
    render(<DataTable columns={columns} data={invoices} caption="Invoices" />)
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("pages the rows and announces the page, with Previous disabled on the first page", () => {
    render(<DataTable columns={columns} data={invoices} caption="Invoices" pageSize={2} />)
    expect(bodyCustomers()).toEqual(["Zed", "Amy"])
    expect(screen.getByText("Page 1 of 2")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(bodyCustomers()).toEqual(["Bob"])
    expect(screen.getByText("Page 2 of 2")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("shows no pager when everything fits on one page", () => {
    render(<DataTable columns={columns} data={invoices} caption="Invoices" />)
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull()
  })
})
