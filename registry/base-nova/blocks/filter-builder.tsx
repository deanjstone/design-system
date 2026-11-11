"use client"

// Pattern from circle's `components/data-table-filter/` (https://github.com/ln-dev7/circle), MIT License,
// Copyright (c) 2025 lndev-ui | Circle Template (itself from bazza/ui's data-table-filter).
// Re-implemented here on @base-ui/react and this registry's tokens: no motion, no react-dnd, no store,
// no nuqs, no table. What is circle's: the subject, operator and value row, the operators per field type
// including exclusion, and filters ANDed together. What is new: native selects (the phone's own picker)
// for the field, operator and a single value, a checklist for several values, a bottom sheet for the
// rows on a phone with the active filters as chips outside it, and a controlled `value` that
// `useFilterState` keeps in one URL search param.

import * as React from "react"
import { ChevronDownIcon, ListFilterIcon, PlusIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  changeField,
  changeOperator,
  createFilter,
  describeFilter,
  isComplete,
  isMultiValue,
  operatorLabel,
  operatorsFor,
  type Filter,
  type FilterField,
  type FilterOperator,
} from "@/lib/filter-core"

type FilterBuilderLabels = {
  /** The sheet's trigger and title. */
  filters: string
  addFilter: string
  clearAll: string
  /** The sheet's close button. */
  done: string
  /** Prefixes a row's remove button: "Remove filter: Label is Bug". */
  remove: string
  field: string
  operator: string
  value: string
  /** The empty choice, and the checklist button while nothing is picked. */
  select: string
  /** Follows a count on the checklist button: "3 selected". */
  selected: string
  /** The chip list's name. */
  active: string
  sheetDescription: string
}

const DEFAULT_LABELS: FilterBuilderLabels = {
  filters: "Filters",
  addFilter: "Add filter",
  clearAll: "Clear all",
  done: "Done",
  remove: "Remove filter",
  field: "Field",
  operator: "Operator",
  value: "Value",
  select: "Select…",
  selected: "selected",
  active: "Active filters",
  sheetDescription: "Add, change or remove filters.",
}

type Variant = "inline" | "sheet"

// A native select keeps the platform's picker on a phone. Coarse pointers get a 44px control, and 16px
// text so iOS Safari does not zoom the page into it on focus.
const selectClass = (variant: Variant) =>
  cn("max-w-full [&_select]:pointer-coarse:h-11 [&_select]:pointer-coarse:text-base", variant === "sheet" ? "w-full" : "w-fit")

type ChecklistProps = {
  field: FilterField
  filter: Filter
  legend: string
  onChange: (next: Filter) => void
}

// Several values at once. Each row is a label around the checkbox, so the whole row is the tap target.
function Checklist({ field, filter, legend, onChange }: ChecklistProps) {
  const toggle = (value: string, checked: boolean) =>
    onChange({ ...filter, values: checked ? [...filter.values, value] : filter.values.filter((existing) => existing !== value) })

  return (
    <fieldset data-slot="filter-builder-checklist" className="m-0 flex min-w-0 flex-col border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      {(field.options ?? []).map((option) => (
        <label
          key={option.value}
          className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted pointer-coarse:min-h-11 pointer-coarse:text-base"
        >
          <Checkbox checked={filter.values.includes(option.value)} onCheckedChange={(checked) => toggle(option.value, checked)} />
          <span className="min-w-0 wrap-anywhere">{option.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

type ValueControlProps = {
  field: FilterField
  filter: Filter
  labels: FilterBuilderLabels
  variant: Variant
  onChange: (next: Filter) => void
}

function ValueControl({ field, filter, labels, variant, onChange }: ValueControlProps) {
  if (field.type === "text" || field.type === "number") {
    return (
      <Input
        aria-label={labels.value}
        type={field.type === "number" ? "number" : "text"}
        inputMode={field.type === "number" ? "decimal" : undefined}
        value={filter.values[0] ?? ""}
        onChange={(event) => onChange({ ...filter, values: event.target.value === "" ? [] : [event.target.value] })}
        className={variant === "sheet" ? "w-full" : "w-48 max-w-full"}
      />
    )
  }

  const options = field.options ?? []

  if (!isMultiValue(filter.operator)) {
    return (
      <NativeSelect
        aria-label={labels.value}
        value={filter.values[0] ?? ""}
        onChange={(event) => onChange({ ...filter, values: event.target.value === "" ? [] : [event.target.value] })}
        className={selectClass(variant)}
      >
        <NativeSelectOption value="">{labels.select}</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    )
  }

  // The sheet has the room, so its checklist is just there; inline it sits behind a button.
  if (variant === "sheet") return <Checklist field={field} filter={filter} legend={labels.value} onChange={onChange} />

  const names = filter.values.map((value) => options.find((option) => option.value === value)?.label ?? value)
  const summary = names.length === 0 ? labels.select : names.length <= 2 ? names.join(", ") : `${names.length} ${labels.selected}`

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" aria-label={`${labels.value}: ${summary}`} className="max-w-56 justify-between" />}>
        <span className="min-w-0 truncate">{summary}</span>
        <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 max-w-[calc(100vw-1rem)] gap-0 p-1">
        <Checklist field={field} filter={filter} legend={labels.value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}

type FilterRowProps = {
  filter: Filter
  field: FilterField
  fields: readonly FilterField[]
  labels: FilterBuilderLabels
  variant: Variant
  onChange: (next: Filter) => void
  onRemove: () => void
}

function FilterRow({ filter, field, fields, labels, variant, onChange, onRemove }: FilterRowProps) {
  const description = describeFilter(filter, fields)
  const sheet = variant === "sheet"

  const fieldSelect = (
    <NativeSelect
      aria-label={labels.field}
      value={filter.field}
      onChange={(event) => {
        const next = fields.find((candidate) => candidate.id === event.target.value)
        if (next) onChange(changeField(filter, next))
      }}
      className={cn(selectClass(variant), sheet && "flex-1")}
    >
      {fields.map((candidate) => (
        <NativeSelectOption key={candidate.id} value={candidate.id}>
          {candidate.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )

  const removeButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${labels.remove}: ${description}`}
      onClick={onRemove}
      className="shrink-0 pointer-coarse:size-11"
    >
      <XIcon aria-hidden="true" />
    </Button>
  )

  const operatorSelect = (
    <NativeSelect
      aria-label={labels.operator}
      value={filter.operator}
      onChange={(event) => onChange(changeOperator(filter, event.target.value as FilterOperator))}
      className={selectClass(variant)}
    >
      {operatorsFor(field.type).map((operator) => (
        <NativeSelectOption key={operator} value={operator}>
          {operatorLabel(operator)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )

  const valueControl = <ValueControl field={field} filter={filter} labels={labels} variant={variant} onChange={onChange} />

  if (sheet) {
    return (
      <li data-slot="filter-builder-row" className="list-none">
        <div role="group" aria-label={description} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            {fieldSelect}
            {removeButton}
          </div>
          {operatorSelect}
          {valueControl}
        </div>
      </li>
    )
  }

  return (
    <li data-slot="filter-builder-row" className="list-none">
      <div role="group" aria-label={description} className="flex flex-wrap items-center gap-2">
        {fieldSelect}
        {operatorSelect}
        {valueControl}
        {removeButton}
      </div>
    </li>
  )
}

type FilterBuilderProps = Omit<React.ComponentProps<"div">, "children" | "onChange"> & {
  fields: readonly FilterField[]
  /** The filters, in order. Keep them in `useFilterState` for the URL, or in your own state or router. */
  value: readonly Filter[]
  onValueChange: (next: Filter[]) => void
  /** `inline` lays the rows out in the page, `sheet` puts them in a bottom sheet behind a Filters button, `auto` (default) picks the sheet on a phone. */
  layout?: "auto" | "inline" | "sheet"
  /** Every visible and spoken string, for an app not in English. */
  labels?: Partial<FilterBuilderLabels>
}

/**
 * Subject, operator and value rows. A row's field and operator are native selects, a single value is
 * a native select or an input, several values are a checklist. Filters are ANDed. On a phone the rows
 * sit in a bottom sheet and the complete filters show as chips under the button.
 */
function FilterBuilder({ fields, value, onValueChange, layout = "auto", labels: labelOverrides, className, ...props }: FilterBuilderProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const isMobile = useIsMobile()
  const variant: Variant = layout === "auto" ? (isMobile ? "sheet" : "inline") : layout
  const [open, setOpen] = React.useState(false)

  const known = value.flatMap((filter, index) => {
    const field = fields.find((candidate) => candidate.id === filter.field)
    return field ? [{ filter, field, index }] : []
  })
  const complete = known.filter(({ filter }) => isComplete(filter))
  const nextField = fields.find((candidate) => !value.some((filter) => filter.field === candidate.id))

  const replace = (index: number, next: Filter) => onValueChange(value.map((filter, at) => (at === index ? next : filter)))
  const remove = (index: number) => onValueChange(value.filter((_, at) => at !== index))
  const add = () => {
    if (nextField) onValueChange([...value, createFilter(nextField)])
  }

  const rows = known.map(({ filter, field, index }) => (
    <FilterRow
      key={index}
      filter={filter}
      field={field}
      fields={fields}
      labels={labels}
      variant={variant}
      onChange={(next) => replace(index, next)}
      onRemove={() => remove(index)}
    />
  ))

  const addButton = (
    <Button variant="outline" onClick={add} disabled={!nextField}>
      <PlusIcon aria-hidden="true" data-icon="inline-start" />
      {labels.addFilter}
    </Button>
  )
  const clearButton =
    value.length > 0 ? (
      <Button variant="ghost" onClick={() => onValueChange([])}>
        {labels.clearAll}
      </Button>
    ) : null

  if (variant === "inline") {
    return (
      <div data-slot="filter-builder" data-layout="inline" className={cn("flex min-w-0 flex-col gap-3", className)} {...props}>
        {rows.length > 0 ? <ul className="m-0 flex list-none flex-col gap-2 p-0">{rows}</ul> : null}
        <div className="flex flex-wrap items-center gap-2">
          {addButton}
          {clearButton}
        </div>
      </div>
    )
  }

  // Closing the sheet drops the rows still empty: they filter nothing and are not worth a place in the URL.
  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next && value.some((filter) => !isComplete(filter))) onValueChange(value.filter(isComplete))
  }

  return (
    <div data-slot="filter-builder" data-layout="sheet" className={cn("flex min-w-0 flex-col gap-2", className)} {...props}>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger render={<Button variant="outline" className="w-fit" />}>
          <ListFilterIcon aria-hidden="true" data-icon="inline-start" />
          {labels.filters}
          {complete.length > 0 ? <Badge variant="secondary">{complete.length}</Badge> : null}
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh]">
          <SheetHeader>
            <SheetTitle>{labels.filters}</SheetTitle>
            <SheetDescription>{labels.sheetDescription}</SheetDescription>
          </SheetHeader>
          {rows.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">{rows}</ul>
            </div>
          ) : null}
          <div className="flex px-4">{addButton}</div>
          <SheetFooter className="pt-0">
            <Button onClick={() => onOpenChange(false)}>{labels.done}</Button>
            {clearButton}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {complete.length > 0 ? (
        <ul aria-label={labels.active} className="m-0 flex list-none flex-wrap gap-2 p-0">
          {complete.map(({ filter, index }) => {
            const description = describeFilter(filter, fields)
            return (
              <li key={index} className="min-w-0 max-w-full">
                <Button variant="outline" size="sm" aria-label={`${labels.remove}: ${description}`} onClick={() => remove(index)} className="max-w-full">
                  <span className="min-w-0 truncate">{description}</span>
                  <XIcon aria-hidden="true" data-icon="inline-end" />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export { FilterBuilder }
export type { FilterBuilderLabels, FilterBuilderProps }
