import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useThemePreference } from "../registry/base-nova/hooks/use-theme-preference"

type Listener = (event: { matches: boolean }) => void

function stubMatchMedia(initiallyDark: boolean) {
  const listeners = new Set<Listener>()
  const state = { matches: initiallyDark }
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return state.matches
    },
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  }))
  return {
    setDark(matches: boolean) {
      state.matches = matches
      listeners.forEach((listener) => listener({ matches }))
    },
    listenerCount: () => listeners.size,
  }
}

const clearCookie = () => {
  document.cookie = "ds-theme=; Max-Age=0; Path=/"
}

beforeEach(() => {
  localStorage.clear()
  clearCookie()
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.classList.remove("dark")
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("useThemePreference", () => {
  it("starts on Ocean following the system when nothing is stored", () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useThemePreference())

    expect(result.current.preference).toEqual({ theme: "ocean", mode: "system" })
    expect(result.current.resolvedMode).toBe("light")
  })

  it("reads the stored choice after mount", () => {
    stubMatchMedia(false)
    document.cookie = "ds-theme=grove.dark; Path=/"
    const { result } = renderHook(() => useThemePreference())

    expect(result.current.preference).toEqual({ theme: "grove", mode: "dark" })
    expect(result.current.resolvedMode).toBe("dark")
  })

  it("setTheme stores the choice, applies it to <html> and keeps the mode", () => {
    stubMatchMedia(false)
    document.cookie = "ds-theme=ocean.dark; Path=/"
    const { result } = renderHook(() => useThemePreference())

    act(() => result.current.setTheme("ember"))

    expect(result.current.preference).toEqual({ theme: "ember", mode: "dark" })
    expect(document.documentElement.getAttribute("data-theme")).toBe("ember")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.cookie).toContain("ds-theme=ember.dark")
    expect(localStorage.getItem("ds-theme")).toBe("ember.dark")
  })

  it("setMode resolves System against the system preference", () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useThemePreference())

    act(() => result.current.setMode("light"))
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(result.current.resolvedMode).toBe("light")

    act(() => result.current.setMode("system"))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(result.current.resolvedMode).toBe("dark")
  })

  it("writes the cookie on the configured parent domain", () => {
    stubMatchMedia(false)
    const cookies = vi.spyOn(document, "cookie", "set")
    const { result } = renderHook(() => useThemePreference({ cookieDomain: ".myargus.cc" }))

    act(() => result.current.setMode("dark"))

    expect(cookies.mock.calls.at(-1)?.[0]).toContain("Domain=.myargus.cc")
    cookies.mockRestore()
  })

  it("follows the system while the mode is System, and stops once it is not", () => {
    const system = stubMatchMedia(false)
    const { result } = renderHook(() => useThemePreference())

    act(() => system.setDark(true))
    expect(result.current.resolvedMode).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    act(() => result.current.setMode("light"))
    act(() => system.setDark(false))
    act(() => system.setDark(true))
    expect(result.current.resolvedMode).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("stops watching the system on unmount", () => {
    const system = stubMatchMedia(false)
    const { unmount } = renderHook(() => useThemePreference())
    expect(system.listenerCount()).toBe(1)

    unmount()

    expect(system.listenerCount()).toBe(0)
  })
})
