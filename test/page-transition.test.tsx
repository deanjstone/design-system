import { render, renderHook, act } from "@testing-library/react"
import { accentChain } from "glimm"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// page-transition (design-system#198), wrapper behaviour with glimm/react mocked so the calls glimm
// receives can be read. test/page-transition-webgl.test.tsx runs the same item against real glimm.

const sweep = vi.hoisted(() => vi.fn())
const providerProps = vi.hoisted(() => ({ current: undefined as undefined | Record<string, unknown> }))

vi.mock("glimm/react", () => ({
  GlimmProvider: (props: { children: ReactNode } & Record<string, unknown>) => {
    providerProps.current = props
    return props.children
  },
  useGlimm: () => ({ sweep, defaults: {} }),
}))

import { PageTransitionProvider, usePageTransition } from "../registry/base-nova/ui/page-transition"

const LIGHT = { "--primary": "#0a6f75", "--chart-5": "#2672af", "--chart-4": "#5b4fd0" }
const DARK = { "--primary": "#5bd0d6", "--chart-5": "#70b9ee", "--chart-4": "#a5a8f0" }

const setTokens = (tokens: Record<string, string>) => {
  for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(name, value)
}

const setReducedMotion = (reduce: boolean) => {
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- minimal matchMedia stub; jsdom lacks MediaQueryList
  window.matchMedia = vi.fn((query: string) => ({ matches: reduce && query === "(prefers-reduced-motion: reduce)" })) as unknown as typeof window.matchMedia
}

const wrapper = ({ children }: { children: ReactNode }) => <PageTransitionProvider>{children}</PageTransitionProvider>

const setup = () => renderHook(() => usePageTransition(), { wrapper }).result

beforeEach(() => {
  sweep.mockReset()
  sweep.mockImplementation(() => ({ midpoint: Promise.resolve(), done: Promise.resolve(), cancel: vi.fn() }))
  providerProps.current = undefined
  setReducedMotion(false)
  setTokens(LIGHT)
})

afterEach(() => {
  document.documentElement.removeAttribute("style")
  document.documentElement.classList.remove("dark")
})

describe("PageTransitionProvider", () => {
  it("makes reduced motion an instant cut, not a shorter sweep", () => {
    render(<PageTransitionProvider>x</PageTransitionProvider>)
    expect(providerProps.current?.reducedMotion).toBe("instant")
  })
})

describe("usePageTransition", () => {
  it("sweeps with a palette built from the theme tokens", async () => {
    const result = setup()
    const navigate = vi.fn()
    await act(() => result.current.transition(navigate))
    expect(sweep).toHaveBeenCalledTimes(1)
    const [passedNavigate, options] = sweep.mock.calls[0] ?? []
    expect(passedNavigate).toBe(navigate)
    expect(options.palette).toEqual(accentChain(["#0a6f75", "#2672af", "#5b4fd0"]))
    expect(options.brightness).toBe(1)
  })

  it("reads the tokens when the transition starts, so a theme change between navigations shows", async () => {
    const result = setup()
    document.documentElement.classList.add("dark")
    setTokens(DARK)
    await act(() => result.current.transition(vi.fn()))
    const options = sweep.mock.calls[0]?.[1]
    expect(options.palette).toEqual(accentChain(["#5bd0d6", "#70b9ee", "#a5a8f0"]))
    expect(options.brightness).toBeLessThan(1)
  })

  it("lets the caller override the look and timing per navigation", async () => {
    const result = setup()
    await act(() => result.current.transition(vi.fn(), { sweepMs: 600, direction: "rtl" }))
    expect(sweep.mock.calls[0]?.[1]).toMatchObject({ sweepMs: 600, direction: "rtl" })
  })

  it("cuts, without a sweep, when the visitor prefers reduced motion", async () => {
    setReducedMotion(true)
    const result = setup()
    const navigate = vi.fn()
    await act(() => result.current.transition(navigate))
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(sweep).not.toHaveBeenCalled()
  })

  it("cuts when the theme tokens are absent", async () => {
    document.documentElement.removeAttribute("style")
    const result = setup()
    const navigate = vi.fn()
    await act(() => result.current.transition(navigate))
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(sweep).not.toHaveBeenCalled()
  })

  it("cuts for good once the WebGL context is lost, which glimm's own sweep path does not handle", async () => {
    const result = setup()
    const canvas = document.createElement("canvas")
    const onController = providerProps.current?.onController as (controller: { canvas: HTMLCanvasElement }) => void
    onController({ canvas })

    await act(() => result.current.transition(vi.fn()))
    expect(sweep).toHaveBeenCalledTimes(1)

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
    const navigate = vi.fn()
    await act(() => result.current.transition(navigate))
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(sweep).toHaveBeenCalledTimes(1)

    canvas.dispatchEvent(new Event("webglcontextrestored"))
    await act(() => result.current.transition(navigate))
    expect(sweep).toHaveBeenCalledTimes(1)
  })

  it("surfaces an error thrown by navigate on the cut path instead of swallowing it", async () => {
    setReducedMotion(true)
    const result = setup()
    await expect(result.current.transition(() => Promise.reject(new Error("route failed")))).rejects.toThrow("route failed")
  })
})
