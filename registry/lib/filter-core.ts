// The filter model behind the filter builder: a filter is a subject (a field), an operator and values,
// and the whole list serialises to one string that fits in one URL search param. Pure TypeScript, no
// React and no router, so a server, a test or any framework can use it.
//
// Pattern from circle's `components/data-table-filter/` and `store/filter-store.ts`
// (https://github.com/ln-dev7/circle), MIT License, Copyright (c) 2025 lndev-ui | Circle Template.
// What is circle's: the field types, the operators per type including exclusion, and filters ANDed
// together. What is new: a plain `field:operator:values` string (circle keeps JSON in a nuqs param),
// parsing that drops what it cannot trust instead of throwing, and no dependencies.

export type FilterFieldType = "option" | "multiOption" | "text" | "number"

export type FilterOperator =
  | "is"
  | "is-not"
  | "is-any-of"
  | "is-none-of"
  | "has-any-of"
  | "has-all-of"
  | "has-none-of"
  | "contains"
  | "does-not-contain"
  | "eq"
  | "neq"
  | "gt"
  | "lt"

export type FilterOption = { value: string; label: string }

export type FilterField<Item = unknown> = {
  /** The subject's key. It is written into the URL, so keep it short and stable. */
  id: string
  /** What the person reads. */
  label: string
  type: FilterFieldType
  /** The choices, for `option` and `multiOption`. */
  options?: FilterOption[]
  /**
   * What an item has for this field: a string for `option`, a string list for `multiOption`, text for
   * `text`, a number for `number`. `applyFilters` needs it. Leave it out to filter on the server
   * yourself and use the builder only to edit the list.
   */
  accessor?: (item: Item) => string | number | readonly string[] | null | undefined
}

export type Filter = { field: string; operator: FilterOperator; values: string[] }

const OPERATORS: Record<FilterFieldType, readonly FilterOperator[]> = {
  option: ["is", "is-not", "is-any-of", "is-none-of"],
  multiOption: ["has-any-of", "has-all-of", "has-none-of"],
  text: ["contains", "does-not-contain"],
  number: ["eq", "neq", "gt", "lt"],
}

const LABELS: Record<FilterOperator, string> = {
  is: "is",
  "is-not": "is not",
  "is-any-of": "is any of",
  "is-none-of": "is none of",
  "has-any-of": "has any of",
  "has-all-of": "has all of",
  "has-none-of": "has none of",
  contains: "contains",
  "does-not-contain": "does not contain",
  eq: "equals",
  neq: "does not equal",
  gt: "is greater than",
  lt: "is less than",
}

const EXCLUDING: ReadonlySet<FilterOperator> = new Set(["is-not", "is-none-of", "has-none-of", "does-not-contain", "neq"])
const MULTI_VALUE: ReadonlySet<FilterOperator> = new Set(["is-any-of", "is-none-of", "has-any-of", "has-all-of", "has-none-of"])

// A shared link is untrusted input, so parsing stops after this many segments.
const MAX_SEGMENTS = 50

export function operatorsFor(type: FilterFieldType): readonly FilterOperator[] {
  return OPERATORS[type]
}

export function operatorLabel(operator: FilterOperator): string {
  return LABELS[operator]
}

/** True for the operators that leave matching items out: is not, is none of, does not contain... */
export function isExclusion(operator: FilterOperator): boolean {
  return EXCLUDING.has(operator)
}

/** True for the operators that take a list of values rather than one. */
export function isMultiValue(operator: FilterOperator): boolean {
  return MULTI_VALUE.has(operator)
}

/** A filter that has a value. One without is a row still being filled in, and matches everything. */
export function isComplete(filter: Filter): boolean {
  return filter.values.length > 0
}

export function createFilter(field: FilterField): Filter {
  return { field: field.id, operator: OPERATORS[field.type][0], values: [] }
}

export function changeOperator(filter: Filter, operator: FilterOperator): Filter {
  const values = isMultiValue(operator) ? filter.values : filter.values.slice(0, 1)
  return { ...filter, operator, values }
}

/** Moves a filter to another field. Its values belong to the old field's options, so they go; the operator stays when the new field's type has it. */
export function changeField(filter: Filter, field: FilterField): Filter {
  const operator = OPERATORS[field.type].includes(filter.operator) ? filter.operator : OPERATORS[field.type][0]
  return { field: field.id, operator, values: [] }
}

const SEGMENT = ";"
const PART = ":"
const LIST = ","

const encode = (text: string) => encodeURIComponent(text)

/** `field:operator:value,value;field:operator:value`. Each piece is percent-encoded, so the three separators never appear inside one. */
export function serializeFilters(filters: readonly Filter[]): string {
  return filters
    .map((filter) => [encode(filter.field), filter.operator, filter.values.map(encode).join(LIST)].join(PART))
    .join(SEGMENT)
}

const decode = (text: string): string | null => {
  try {
    return decodeURIComponent(text)
  } catch {
    return null
  }
}

/**
 * The inverse of `serializeFilters`, checked against `fields`. A segment is dropped when its field is
 * unknown, its operator is not one the field's type has, or it is malformed; a single-value operator
 * keeps its first value and a number field keeps only numbers. It never throws.
 */
export function parseFilters(raw: string | null | undefined, fields: readonly FilterField[]): Filter[] {
  if (!raw) return []
  const filters: Filter[] = []
  for (const segment of raw.split(SEGMENT, MAX_SEGMENTS)) {
    const parts = segment.split(PART)
    if (parts.length !== 3) continue
    const id = decode(parts[0])
    const field = fields.find((candidate) => candidate.id === id)
    const operator = parts[1] as FilterOperator
    if (!field || !OPERATORS[field.type].includes(operator)) continue
    let values: string[] = []
    if (parts[2] !== "") {
      const decoded = parts[2].split(LIST).map(decode)
      if (decoded.includes(null)) continue
      values = decoded as string[]
    }
    if (field.type === "number") values = values.filter((value) => value.trim() !== "" && Number.isFinite(Number(value)))
    if (!isMultiValue(operator)) values = values.slice(0, 1)
    filters.push({ field: field.id, operator, values })
  }
  return filters
}

const asList = (value: ReturnType<NonNullable<FilterField["accessor"]>>): string[] =>
  value == null ? [] : Array.isArray(value) ? value.map(String) : [String(value)]

/** Whether one item passes one filter. A filter with no value, or whose field has no accessor, passes everything. */
export function matchesFilter<Item>(item: Item, filter: Filter, field: FilterField<Item> | undefined): boolean {
  if (!field?.accessor || !isComplete(filter)) return true
  const actual = field.accessor(item)
  const [first] = filter.values

  switch (filter.operator) {
    case "is":
      return asList(actual)[0] === first
    case "is-not":
      return asList(actual)[0] !== first
    case "is-any-of":
      return filter.values.includes(asList(actual)[0])
    case "is-none-of":
      return !filter.values.includes(asList(actual)[0])
    case "has-any-of":
      return filter.values.some((value) => asList(actual).includes(value))
    case "has-all-of":
      return filter.values.every((value) => asList(actual).includes(value))
    case "has-none-of":
      return !filter.values.some((value) => asList(actual).includes(value))
    case "contains":
      return asList(actual).join(" ").toLowerCase().includes(first.toLowerCase())
    case "does-not-contain":
      return !asList(actual).join(" ").toLowerCase().includes(first.toLowerCase())
    case "eq":
      return actual != null && Number(actual) === Number(first)
    case "neq":
      return actual == null || Number(actual) !== Number(first)
    case "gt":
      return actual != null && Number(actual) > Number(first)
    case "lt":
      return actual != null && Number(actual) < Number(first)
  }
}

/** The items that pass every filter (they are ANDed). A new array; the input is not touched. */
export function applyFilters<Item>(items: readonly Item[], filters: readonly Filter[], fields: readonly FilterField<Item>[]): Item[] {
  return items.filter((item) =>
    filters.every((filter) =>
      matchesFilter(
        item,
        filter,
        fields.find((field) => field.id === filter.field),
      ),
    ),
  )
}

/** A filter as a sentence, for a chip or a screen reader: "Wave is any of Wave 1, Later". */
export function describeFilter(filter: Filter, fields: readonly FilterField[]): string {
  const field = fields.find((candidate) => candidate.id === filter.field)
  const values = filter.values.map((value) => field?.options?.find((option) => option.value === value)?.label ?? value)
  return `${field?.label ?? filter.field} ${operatorLabel(filter.operator)} ${values.length > 0 ? values.join(", ") : "…"}`
}
