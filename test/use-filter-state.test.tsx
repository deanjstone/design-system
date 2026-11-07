import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { FilterField } from "../registry/lib/filter-core"
import { useFilterState } from "../registry/base-nova/hooks/use-filter-state"

// The filter list as state in the page's own URL (design-system#193): one search param, no nuqs.

const fields: FilterField[] = [
  {
    id: "label",
    label: "Label",
    type: "option",
    options: [
      { value: "bug", label: "Bug" },
      { value: "design", label: "Design" },
    ],
  },
  { id: "title", label: "Title", type: "text" },
]

const go = (url: string) => window.history.replaceState(null, "", url)

beforeEach(() => go("/issues?page=2"))
afterEach(() => {
  cleanup()
  go("/")
})

describe("useFilterState", () => {
  it("starts empty when the URL has no filter param", () => {
    const { result } = renderHook(() => useFilterState(fields))
    expect(result.current[0]).toEqual([])
  })

  it("reads the filters a shared link carries", () => {
    go("/issues?filter=label%3Ais-not%3Abug&page=2")
    const { result } = renderHook(() => useFilterState(fields))
    expect(result.current[0]).toEqual([{ field: "label", operator: "is-not", values: ["bug"] }])
  })

  it("writes the filters to the param and leaves the other params and the hash alone", () => {
    go("/issues?page=2#top")
    const { result } = renderHook(() => useFilterState(fields))

    act(() => {
      result.current[1]([{ field: "label", operator: "is", values: ["design"] }])
    })

    expect(window.location.search).toBe("?page=2&filter=label%3Ais%3Adesign")
    expect(window.location.hash).toBe("#top")
    expect(result.current[0]).toEqual([{ field: "label", operator: "is", values: ["design"] }])
  })

  it("removes the param when the list is emptied", () => {
    go("/issues?filter=label%3Ais%3Abug&page=2")
    const { result } = renderHook(() => useFilterState(fields))

    act(() => {
      result.current[1]([])
    })

    expect(window.location.search).toBe("?page=2")
    expect(result.current[0]).toEqual([])
  })

  it("replaces the history entry by default, so typing does not fill the back button", () => {
    const before = window.history.length
    const { result } = renderHook(() => useFilterState(fields))

    act(() => {
      result.current[1]([{ field: "title", operator: "contains", values: ["a"] }])
    })
    act(() => {
      result.current[1]([{ field: "title", operator: "contains", values: ["ab"] }])
    })

    expect(window.history.length).toBe(before)
  })

  it("adds one history entry per change with history: push", () => {
    const before = window.history.length
    const { result } = renderHook(() => useFilterState(fields, { history: "push" }))

    act(() => {
      result.current[1]([{ field: "title", operator: "contains", values: ["a"] }])
    })
    act(() => {
      result.current[1]([{ field: "title", operator: "contains", values: ["ab"] }])
    })

    expect(window.history.length).toBe(before + 2)
  })

  it("follows the back button (popstate)", () => {
    const { result } = renderHook(() => useFilterState(fields))
    go("/issues?filter=label%3Ais%3Abug")
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    expect(result.current[0]).toEqual([{ field: "label", operator: "is", values: ["bug"] }])
  })

  it("uses another param name when asked, and ignores the default one", () => {
    go("/issues?filter=label%3Ais%3Abug&q=title%3Acontains%3Ax")
    const { result } = renderHook(() => useFilterState(fields, { param: "q" }))
    expect(result.current[0]).toEqual([{ field: "title", operator: "contains", values: ["x"] }])
  })

  it("keeps the same list while the URL is unchanged, so an effect on it does not loop", () => {
    go("/issues?filter=label%3Ais%3Abug")
    const { result, rerender } = renderHook(() => useFilterState(fields))
    const first = result.current[0]
    rerender()
    expect(result.current[0]).toBe(first)
  })

  it("lets two components on the same param see each other's changes", () => {
    const a = renderHook(() => useFilterState(fields))
    const b = renderHook(() => useFilterState(fields))

    act(() => {
      a.result.current[1]([{ field: "label", operator: "is", values: ["bug"] }])
    })

    expect(b.result.current[0]).toEqual([{ field: "label", operator: "is", values: ["bug"] }])
  })
})
