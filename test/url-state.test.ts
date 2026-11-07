// @vitest-environment node

import { describe, expect, it } from "vitest"

import { readParam, writeParam } from "../registry/lib/url-state"

// The pure half of the URL-state helper (design-system#193): read and write one search param without
// touching the others. The hook that wraps it is tested in use-filter-state.test.tsx.

describe("readParam", () => {
  it("reads one param from a search string, with or without the leading question mark", () => {
    expect(readParam("?filter=a%3Ab&page=2", "filter")).toBe("a:b")
    expect(readParam("filter=a", "filter")).toBe("a")
  })

  it("returns null for a missing param and for an empty one", () => {
    expect(readParam("?page=2", "filter")).toBeNull()
    expect(readParam("", "filter")).toBeNull()
    expect(readParam("?filter=", "filter")).toBeNull()
  })
})

describe("writeParam", () => {
  it("sets a param and keeps the others in order", () => {
    expect(writeParam("?page=2", "filter", "label:is:bug")).toBe("?page=2&filter=label%3Ais%3Abug")
  })

  it("replaces a param in place", () => {
    expect(writeParam("?filter=old&page=2", "filter", "new")).toBe("?filter=new&page=2")
  })

  it("removes the param for null or an empty value, and gives an empty string when none is left", () => {
    expect(writeParam("?filter=x&page=2", "filter", null)).toBe("?page=2")
    expect(writeParam("?filter=x", "filter", "")).toBe("")
    expect(writeParam("", "filter", null)).toBe("")
  })

  it("round-trips whatever it writes", () => {
    const value = "title:contains:x%20y&z=1;a+b"
    expect(readParam(writeParam("?page=2", "filter", value), "filter")).toBe(value)
  })
})
