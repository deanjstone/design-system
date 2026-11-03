import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createLazyChart } from "../registry/base-nova/ui/chart-lazy"

afterEach(cleanup)

const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/chart-lazy.tsx"), "utf8")

type Props = { className?: string; title: string }

describe("createLazyChart", () => {
  it("never imports recharts or chart.tsx itself, so the first bundle carries neither", () => {
    expect(source).not.toMatch(/from\s+["']recharts["']/)
    expect(source).not.toMatch(/from\s+["']@\/components\/ui\/chart["']/)
    expect(source).not.toMatch(/^import[^\n]*["']\.\/chart["']/m)
  })

  it("does not call the loader until the chart renders", () => {
    const load = vi.fn(async () => ({ default: ({ title }: Props) => <p>{title}</p> }))
    const LazyChart = createLazyChart<Props>(load)
    expect(load).not.toHaveBeenCalled()

    render(<LazyChart title="Revenue" />)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("holds a 16:9 status skeleton while the chunk loads, then renders the chart with its props", async () => {
    const LazyChart = createLazyChart<Props>(async () => ({ default: ({ title }: Props) => <p>{title}</p> }))
    render(<LazyChart title="Revenue" className="h-64" />)

    const skeleton = screen.getByRole("status", { name: "Loading chart" })
    expect(skeleton.className).toContain("aspect-video")
    expect(skeleton.className).toContain("h-64")

    expect(await screen.findByText("Revenue")).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("shows an alert and logs the cause when the chunk fails to load", async () => {
    const failure = new Error("chunk 404")
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const LazyChart = createLazyChart<Props>(async () => {
      throw failure
    })
    render(<LazyChart title="Revenue" className="h-64" />)

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("The chart could not be loaded.")
    expect(alert.className).toContain("h-64")
    expect(logged.mock.calls.some((call) => call.includes(failure))).toBe(true)
    logged.mockRestore()
  })
})
