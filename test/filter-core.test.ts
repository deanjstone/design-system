// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  applyFilters,
  changeField,
  changeOperator,
  createFilter,
  describeFilter,
  isComplete,
  isExclusion,
  isMultiValue,
  operatorLabel,
  operatorsFor,
  parseFilters,
  serializeFilters,
  type Filter,
  type FilterField,
} from "../registry/lib/filter-core"

// The filter model behind the filter builder (design-system#193): subject, operator and value rows,
// including exclusion, serialised to one URL search param. Everything here is pure: no DOM, no router.

type Issue = { title: string; label: string; waves: string; modes: string[]; points: number }

const fields: FilterField<Issue>[] = [
  {
    id: "label",
    label: "Label",
    type: "option",
    options: [
      { value: "bug", label: "Bug" },
      { value: "design", label: "Design" },
      { value: "ops", label: "Ops" },
    ],
    accessor: (issue) => issue.label,
  },
  {
    id: "wave",
    label: "Wave",
    type: "option",
    options: [
      { value: "w1", label: "Wave 1" },
      { value: "w2", label: "Wave 2" },
      { value: "later", label: "Later" },
    ],
    accessor: (issue) => issue.waves,
  },
  {
    id: "mode",
    label: "Mode",
    type: "multiOption",
    options: [
      { value: "afk", label: "AFK" },
      { value: "hitl", label: "HITL" },
    ],
    accessor: (issue) => issue.modes,
  },
  { id: "title", label: "Title", type: "text", accessor: (issue) => issue.title },
  { id: "points", label: "Points", type: "number", accessor: (issue) => issue.points },
]

const issues: Issue[] = [
  { title: "Fix the promotion card", label: "bug", waves: "w1", modes: ["afk"], points: 3 },
  { title: "Dense issue row", label: "design", waves: "w1", modes: ["afk", "hitl"], points: 5 },
  { title: "Rotate the tailscale key", label: "ops", waves: "later", modes: ["hitl"], points: 1 },
  { title: "No wave yet", label: "bug", waves: "", modes: [], points: 8 },
]

const titlesFor = (filters: Filter[]) => applyFilters(issues, filters, fields).map((issue) => issue.title)

describe("operators", () => {
  it("offers is, is not, is any of and is none of for an option, so exclusion is always there", () => {
    expect(operatorsFor("option")).toEqual(["is", "is-not", "is-any-of", "is-none-of"])
  })

  it("offers any, all and none for a multi-option", () => {
    expect(operatorsFor("multiOption")).toEqual(["has-any-of", "has-all-of", "has-none-of"])
  })

  it("offers contains and does-not-contain for text, and four comparisons for a number", () => {
    expect(operatorsFor("text")).toEqual(["contains", "does-not-contain"])
    expect(operatorsFor("number")).toEqual(["eq", "neq", "gt", "lt"])
  })

  it("reads each operator as words, never a symbol alone", () => {
    expect(operatorLabel("is-any-of")).toBe("is any of")
    expect(operatorLabel("is-not")).toBe("is not")
    expect(operatorLabel("gt")).toBe("is greater than")
  })

  it("knows which operators exclude and which take several values", () => {
    expect(["is-not", "is-none-of", "has-none-of", "does-not-contain", "neq"].every(isExclusion)).toBe(true)
    expect(["is", "is-any-of", "has-any-of", "contains", "eq", "gt"].some(isExclusion)).toBe(false)
    expect(["is-any-of", "is-none-of", "has-any-of", "has-all-of", "has-none-of"].every(isMultiValue)).toBe(true)
    expect(["is", "is-not", "contains", "eq"].some(isMultiValue)).toBe(false)
  })
})

describe("building a filter", () => {
  it("starts a filter on a field with its first operator and no values", () => {
    expect(createFilter(fields[0])).toEqual({ field: "label", operator: "is", values: [] })
    expect(createFilter(fields[2])).toEqual({ field: "mode", operator: "has-any-of", values: [] })
  })

  it("keeps only the first value when the operator drops from several values to one", () => {
    const filter: Filter = { field: "wave", operator: "is-any-of", values: ["w1", "w2"] }
    expect(changeOperator(filter, "is")).toEqual({ field: "wave", operator: "is", values: ["w1"] })
    expect(changeOperator(filter, "is-none-of")).toEqual({ field: "wave", operator: "is-none-of", values: ["w1", "w2"] })
  })

  it("resets the operator and the values when the field changes to another type", () => {
    const filter: Filter = { field: "wave", operator: "is-none-of", values: ["w1", "w2"] }
    expect(changeField(filter, fields[3])).toEqual({ field: "title", operator: "contains", values: [] })
  })

  it("keeps the operator when the field changes to one of the same type, and drops the values", () => {
    const filter: Filter = { field: "wave", operator: "is-not", values: ["w1"] }
    expect(changeField(filter, fields[0])).toEqual({ field: "label", operator: "is-not", values: [] })
  })

  it("calls a filter complete once it has a value", () => {
    expect(isComplete({ field: "label", operator: "is", values: [] })).toBe(false)
    expect(isComplete({ field: "label", operator: "is", values: ["bug"] })).toBe(true)
  })
})

describe("serializeFilters / parseFilters", () => {
  it("writes nothing for no filters", () => {
    expect(serializeFilters([])).toBe("")
  })

  it("writes one segment per filter as field:operator:values, joined by semicolons", () => {
    const filters: Filter[] = [
      { field: "label", operator: "is-not", values: ["bug"] },
      { field: "wave", operator: "is-any-of", values: ["w1", "w2"] },
    ]
    expect(serializeFilters(filters)).toBe("label:is-not:bug;wave:is-any-of:w1,w2")
  })

  it("round-trips every field type", () => {
    const filters: Filter[] = [
      { field: "label", operator: "is", values: ["design"] },
      { field: "wave", operator: "is-none-of", values: ["later", "w2"] },
      { field: "mode", operator: "has-all-of", values: ["afk", "hitl"] },
      { field: "title", operator: "contains", values: ["promotion card"] },
      { field: "points", operator: "gt", values: ["3"] },
    ]
    expect(parseFilters(serializeFilters(filters), fields)).toEqual(filters)
  })

  it("round-trips values that hold the separators, spaces, percent signs and non-ASCII text", () => {
    const filters: Filter[] = [{ field: "title", operator: "contains", values: ["a:b,c;d %20 é 日本"] }]
    const written = serializeFilters(filters)
    expect(written).not.toMatch(/[ ]/)
    expect(written.split(";")).toHaveLength(1)
    expect(parseFilters(written, fields)).toEqual(filters)
  })

  it("round-trips a filter that has no value yet", () => {
    const filters: Filter[] = [{ field: "label", operator: "is", values: [] }]
    expect(serializeFilters(filters)).toBe("label:is:")
    expect(parseFilters("label:is:", fields)).toEqual(filters)
  })

  it("survives a trip through URLSearchParams, the one param a shared link carries", () => {
    const filters: Filter[] = [{ field: "title", operator: "contains", values: ["x y&z=1"] }]
    const search = new URLSearchParams({ filter: serializeFilters(filters) }).toString()
    expect(parseFilters(new URLSearchParams(search).get("filter"), fields)).toEqual(filters)
  })

  it.each([null, undefined, ""])("reads %j as no filters", (raw) => {
    expect(parseFilters(raw, fields)).toEqual([])
  })

  it("drops a segment with an unknown field, an operator the field's type lacks, or the wrong shape", () => {
    const raw = ["nope:is:x", "label:contains:x", "label:is", "label:is:a:b", "", "wave:is:w1"].join(";")
    expect(parseFilters(raw, fields)).toEqual([{ field: "wave", operator: "is", values: ["w1"] }])
  })

  it("drops a segment with a broken percent escape instead of throwing", () => {
    expect(() => parseFilters("title:contains:%E0%A4%A;label:is:bug", fields)).not.toThrow()
    expect(parseFilters("title:contains:%E0%A4%A;label:is:bug", fields)).toEqual([{ field: "label", operator: "is", values: ["bug"] }])
  })

  it("keeps one value for a single-value operator and drops non-numbers for a number field", () => {
    expect(parseFilters("label:is:bug,design", fields)).toEqual([{ field: "label", operator: "is", values: ["bug"] }])
    expect(parseFilters("points:gt:abc", fields)).toEqual([{ field: "points", operator: "gt", values: [] }])
    expect(parseFilters("points:eq:2.5", fields)).toEqual([{ field: "points", operator: "eq", values: ["2.5"] }])
  })

  it("does not choke on a very long hostile param", () => {
    const raw = "label:is-any-of:" + "a,".repeat(50_000) + ";".repeat(10_000)
    expect(() => parseFilters(raw, fields)).not.toThrow()
  })
})

describe("applyFilters", () => {
  it("returns every item when there are no filters", () => {
    expect(titlesFor([])).toHaveLength(4)
  })

  it("is: keeps the items whose value is the one chosen", () => {
    expect(titlesFor([{ field: "label", operator: "is", values: ["bug"] }])).toEqual(["Fix the promotion card", "No wave yet"])
  })

  it("is not: excludes them, and keeps an item that has no value", () => {
    expect(titlesFor([{ field: "wave", operator: "is-not", values: ["w1"] }])).toEqual(["Rotate the tailscale key", "No wave yet"])
  })

  it("is any of / is none of", () => {
    expect(titlesFor([{ field: "label", operator: "is-any-of", values: ["bug", "ops"] }])).toHaveLength(3)
    expect(titlesFor([{ field: "label", operator: "is-none-of", values: ["bug", "ops"] }])).toEqual(["Dense issue row"])
  })

  it("has any of / all of / none of on a multi-option", () => {
    expect(titlesFor([{ field: "mode", operator: "has-any-of", values: ["hitl"] }])).toEqual(["Dense issue row", "Rotate the tailscale key"])
    expect(titlesFor([{ field: "mode", operator: "has-all-of", values: ["afk", "hitl"] }])).toEqual(["Dense issue row"])
    expect(titlesFor([{ field: "mode", operator: "has-none-of", values: ["afk"] }])).toEqual(["Rotate the tailscale key", "No wave yet"])
  })

  it("contains ignores case; does not contain is its exclusion", () => {
    expect(titlesFor([{ field: "title", operator: "contains", values: ["ROW"] }])).toEqual(["Dense issue row"])
    expect(titlesFor([{ field: "title", operator: "does-not-contain", values: ["row"] }])).toHaveLength(3)
  })

  it("compares numbers", () => {
    expect(titlesFor([{ field: "points", operator: "gt", values: ["3"] }])).toEqual(["Dense issue row", "No wave yet"])
    expect(titlesFor([{ field: "points", operator: "lt", values: ["3"] }])).toEqual(["Rotate the tailscale key"])
    expect(titlesFor([{ field: "points", operator: "eq", values: ["3"] }])).toEqual(["Fix the promotion card"])
    expect(titlesFor([{ field: "points", operator: "neq", values: ["3"] }])).toHaveLength(3)
  })

  it("ANDs the filters", () => {
    expect(
      titlesFor([
        { field: "label", operator: "is", values: ["bug"] },
        { field: "wave", operator: "is", values: ["w1"] },
      ]),
    ).toEqual(["Fix the promotion card"])
  })

  it("ignores a filter that has no value yet, so a row in progress hides nothing", () => {
    expect(titlesFor([{ field: "label", operator: "is", values: [] }])).toHaveLength(4)
  })

  it("ignores a filter for a field it does not know, or one with no accessor (the app filters it itself)", () => {
    expect(titlesFor([{ field: "ghost", operator: "is", values: ["x"] }])).toHaveLength(4)
    const bare: FilterField[] = [{ id: "label", label: "Label", type: "option" }]
    expect(applyFilters(issues, [{ field: "label", operator: "is", values: ["bug"] }], bare)).toHaveLength(4)
  })

  it("does not mutate its input", () => {
    const copy = [...issues]
    applyFilters(issues, [{ field: "label", operator: "is", values: ["bug"] }], fields)
    expect(issues).toEqual(copy)
  })
})

describe("describeFilter", () => {
  it("reads a filter as a sentence, with the option labels", () => {
    expect(describeFilter({ field: "wave", operator: "is-any-of", values: ["w1", "later"] }, fields)).toBe("Wave is any of Wave 1, Later")
    expect(describeFilter({ field: "label", operator: "is-not", values: ["bug"] }, fields)).toBe("Label is not Bug")
    expect(describeFilter({ field: "title", operator: "contains", values: ["card"] }, fields)).toBe("Title contains card")
  })

  it("falls back to the raw value when it is not a listed option, and says so when there is none", () => {
    expect(describeFilter({ field: "label", operator: "is", values: ["old"] }, fields)).toBe("Label is old")
    expect(describeFilter({ field: "label", operator: "is", values: [] }, fields)).toBe("Label is …")
  })
})
