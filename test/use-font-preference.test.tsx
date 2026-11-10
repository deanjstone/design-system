import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useFontPreference } from "../registry/base-nova/hooks/use-font-preference"

beforeEach(() => {
  localStorage.clear()
  document.cookie = "ds-font=; Max-Age=0; Path=/"
  document.documentElement.removeAttribute("data-font")
})

afterEach(cleanup)

describe("useFontPreference", () => {
  it("starts on the default font and leaves the page alone when nothing is stored", () => {
    const { result } = renderHook(() => useFontPreference())

    expect(result.current.font).toBe("default")
    expect(document.documentElement.hasAttribute("data-font")).toBe(false)
  })

  it("reads the stored choice after mount", () => {
    document.cookie = "ds-font=aspekta; Path=/"
    const { result } = renderHook(() => useFontPreference())

    expect(result.current.font).toBe("aspekta")
  })

  it("applies, stores and reports a picked font", () => {
    const { result } = renderHook(() => useFontPreference())

    act(() => result.current.setFont("aspekta"))

    expect(result.current.font).toBe("aspekta")
    expect(document.documentElement.getAttribute("data-font")).toBe("aspekta")
    expect(localStorage.getItem("ds-font")).toBe("aspekta")
    expect(document.cookie).toContain("ds-font=aspekta")
  })

  it("goes back to the default by removing the attribute", () => {
    const { result } = renderHook(() => useFontPreference())

    act(() => result.current.setFont("aspekta"))
    act(() => result.current.setFont("default"))

    expect(result.current.font).toBe("default")
    expect(document.documentElement.hasAttribute("data-font")).toBe(false)
  })

  it("shares the cookie with a parent domain when asked", () => {
    const { result } = renderHook(() => useFontPreference({ cookieDomain: "localhost" }))

    act(() => result.current.setFont("aspekta"))

    expect(result.current.font).toBe("aspekta")
  })
})
