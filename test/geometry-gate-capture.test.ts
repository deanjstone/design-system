// @vitest-environment node

import { describe, expect, it, vi } from "vitest"
import { captureScreenshot, isProtocolError } from "../scripts/geometry-gate/capture.mjs"

// design-system#202: a headless Chromium sometimes answers Page.captureScreenshot with a
// protocol error, which failed a Release once. The gate retries that one error once.

const PROTOCOL = "page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot"

const fakePage = (screenshot: () => Promise<unknown>) => ({
  evaluate: vi.fn(async () => undefined),
  screenshot: vi.fn(screenshot),
})

describe("isProtocolError", () => {
  it("matches a Playwright protocol error and nothing else", () => {
    expect(isProtocolError(new Error(PROTOCOL))).toBe(true)
    expect(isProtocolError(new Error("Timeout 30000ms exceeded"))).toBe(false)
    expect(isProtocolError("Protocol error")).toBe(false)
  })
})

describe("captureScreenshot", () => {
  it("returns the first capture without retrying or logging", async () => {
    const page = fakePage(async () => "png")
    const log = vi.fn()
    expect(await captureScreenshot(page, { path: "a.png" }, log)).toBe("png")
    expect(page.screenshot).toHaveBeenCalledTimes(1)
    expect(page.screenshot).toHaveBeenCalledWith({ path: "a.png" })
    expect(log).not.toHaveBeenCalled()
  })

  it("waits for layout and fonts before the capture", async () => {
    const order: string[] = []
    const page = {
      evaluate: vi.fn(async () => void order.push("evaluate")),
      screenshot: vi.fn(async () => void order.push("screenshot")),
    }
    await captureScreenshot(page, {}, vi.fn())
    expect(order).toEqual(["evaluate", "screenshot"])
  })

  it("retries once on a protocol error and logs the retry", async () => {
    const calls = [new Error(PROTOCOL), "png"]
    const page = fakePage(async () => {
      const next = calls.shift()
      if (next instanceof Error) throw next
      return next
    })
    const log = vi.fn()
    expect(await captureScreenshot(page, {}, log)).toBe("png")
    expect(page.screenshot).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain("retrying")
  })

  it("throws when the retry also fails", async () => {
    const page = fakePage(async () => {
      throw new Error(PROTOCOL)
    })
    await expect(captureScreenshot(page, {}, vi.fn())).rejects.toThrow("Protocol error")
    expect(page.screenshot).toHaveBeenCalledTimes(2)
  })

  it("does not retry a different error", async () => {
    const page = fakePage(async () => {
      throw new Error("Timeout 30000ms exceeded")
    })
    const log = vi.fn()
    await expect(captureScreenshot(page, {}, log)).rejects.toThrow("Timeout")
    expect(page.screenshot).toHaveBeenCalledTimes(1)
    expect(log).not.toHaveBeenCalled()
  })
})
