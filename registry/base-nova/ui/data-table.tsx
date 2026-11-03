"use client"

import * as React from "react"
import { cn } from "cn"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// The shadcn data-table recipe as a component: the table item driven by
// @tanstack/react-table v8, with sorting, one column filter and pagination.
// Sorting is opt-out per column (`enableSorting: false`) and starts from a
// DataTableColumnHeader in the column's `header`. For row selection, column
// visibility or server-side paging, use useReactTable with the table item directly.

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** Names the table for assistive tech; visually hidden. */
  caption: string
  /** The id of the column the search box filters. No box when omitted. */
  filterColumn?: string
  filterPlaceholder?: string
  pageSize?: number
  emptyMessage?: string
  className?: string
}

function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>
  title: string
  className?: string
}) {
  if (!column.getCanSort()) return <span className={className}>{title}</span>

  const direction = column.getIsSorted()
  const Icon = direction === "asc" ? ArrowUpIcon : direction === "desc" ? ArrowDownIcon : ChevronsUpDownIcon

  return (
    <Button
      variant="ghost"
      size="sm"
      data-slot="data-table-sort"
      className={cn("-ml-2.5", className)}
      onClick={() => column.toggleSorting(direction === "asc")}
    >
      {title}
      <Icon aria-hidden="true" />
    </Button>
  )
}

const ariaSort = (direction: false | "asc" | "desc") =>
  direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"

function DataTable<TData, TValue>({
  columns,
  data,
  caption,
  filterColumn,
  filterPlaceholder = "Filter",
  pageSize = 10,
  emptyMessage = "No results.",
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    initialState: { pagination: { pageSize } },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const filterValue = filterColumn ? table.getColumn(filterColumn)?.getFilterValue() : undefined
  const pageCount = table.getPageCount()
  const { pageIndex } = table.getState().pagination

  return (
    <div data-slot="data-table" className={cn("flex flex-col gap-3", className)}>
      {filterColumn ? (
        <Input
          aria-label={filterPlaceholder}
          placeholder={filterPlaceholder}
          value={typeof filterValue === "string" ? filterValue : ""}
          onChange={(event) => table.getColumn(filterColumn)?.setFilterValue(event.target.value)}
          className="max-w-sm"
        />
      ) : null}
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  aria-sort={header.column.getCanSort() ? ariaSort(header.column.getIsSorted()) : undefined}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {pageCount > 1 ? (
        <div data-slot="data-table-pagination" className="flex items-center justify-end gap-2">
          <span aria-live="polite" className="mr-2 text-sm text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export { DataTable, DataTableColumnHeader }
export type { DataTableProps }
