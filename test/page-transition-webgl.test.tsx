import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PageTransitionProvider, usePageTransition } from "../registry/base-nova/ui/page-transition"

// page-transition against the real glimm 0.4.1 (design-system#198). jsdom has no WebGL, so
// getContext("webgl") is null, the exact case of a browser or a GPU blocklist with no WebGL.
// The item must then navigate with no transition, never leave the visitor on the old page.

const wrapper = ({ children }: { children: ReactNode }) => <PageTransitionProvider>{children}</PageTransitionProvider>

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  for (const [name, value] of Object.entries({ "--primary": "#0a6f75", "--chart-5": "#2672af", "--chart-4": "#5b4fd0" })) {
    document.documentElement.style.setProperty(name, value)
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.removeAttribute("style")
})

describe("page-transition without WebGL", () => {
  it("navigates once and settles, with no overlay left behind", async () => {
    const { result } = renderHook(() => usePageTransition(), { wrapper })
    const navigate = vi.fn()
    await act(() => result.current.transition(navigate))
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll("canvas")).toHaveLength(0)
  })

  it("waits for an async navigation before it settles", async () => {
    const { result } = renderHook(() => usePageTransition(), { wrapper })
    let finished = false
    const navigate = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      finished = true
    })
    await act(() => result.current.transition(navigate))
    expect(finished).toBe(true)
  })
})
