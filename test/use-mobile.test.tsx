import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useIsMobile } from "../registry/base-nova/hooks/use-mobile"

// useIsMobile (design-system#145): width under 768 is mobile, and so is a coarse
// pointer on a short viewport, which is a phone turned sideways (874x402 on an
// iPhone 17). jsdom has no media engine, so matchMedia evaluates the two clauses
// of the query against a described device.

type Device = { width: number; height: number; coarse: boolean }

const install = (device: Device) => {
  const listeners = new Set<() => void>()
  const matches = (query: string) =>
    query.split(",").some((clause) =>
      clause
        .split(" and ")
        .map((part) => part.trim())
        .every((part) => {
          const max = /\(max-(width|height): (\d+)px\)/.exec(part)
          if (max) return (max[1] === "width" ? device.width : device.height) <= Number(max[2])
          if (part === "(pointer: coarse)") return device.coarse
          throw new Error(`unmodelled media feature ${part}`)
        }),
    )
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- minimal matchMedia stub; jsdom lacks MediaQueryList
  window.matchMedia = vi.fn((query: string) => ({
    get matches() {
      return matches(query)
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia
  return {
    resize: (next: Device) => {
      Object.assign(device, next)
      listeners.forEach((listener) => listener())
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe("useIsMobile", () => {
  it("is mobile below 768px wide", () => {
    install({ width: 402, height: 874, coarse: true })
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
  })

  it("is mobile on an iPhone in landscape, where the width clears 768", () => {
    install({ width: 874, height: 402, coarse: true })
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
  })

  it("is not mobile on a tablet in landscape", () => {
    install({ width: 1133, height: 744, coarse: true })
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
  })

  it("is not mobile in a short desktop window, which has a mouse", () => {
    install({ width: 1200, height: 400, coarse: false })
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
  })

  it("follows a rotation", () => {
    const device = install({ width: 402, height: 874, coarse: true })
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
    act(() => device.resize({ width: 1133, height: 744, coarse: true }))
    expect(result.current).toBe(false)
  })
})
