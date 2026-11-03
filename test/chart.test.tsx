import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { Bar, BarChart } from "recharts"

import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltipContent,
  type ChartConfig,
} from "../registry/base-nova/ui/chart"

// jsdom has no ResizeObserver and lays everything out at 0x0. recharts' ResponsiveContainer
// renders its child only once it is told a size, so the stub reports 400x225 on observe.
class SizedResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const contentRect = new DOMRect(0, 0, 400, 225)
    this.callback([{ target, contentRect } as ResizeObserverEntry], this)
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  globalThis.ResizeObserver = SizedResizeObserver
})

afterEach(cleanup)

const config = {
  desktop: { label: "Desktop", color: "var(--chart-1)" },
  mobile: { label: "Mobile", theme: { light: "var(--chart-2)", dark: "var(--chart-3)" } },
} satisfies ChartConfig

describe("ChartContainer", () => {
  it("renders the chart slot with a bar chart inside", () => {
    const { container } = render(
      <ChartContainer config={config} id="sales">
        <BarChart data={[{ month: "Jan", desktop: 12 }]}>
          <Bar dataKey="desktop" fill="var(--color-desktop)" />
        </BarChart>
      </ChartContainer>,
    )

    const slot = container.querySelector('[data-slot="chart"]')
    expect(slot?.getAttribute("data-chart")).toBe("chart-sales")
    expect(container.querySelector(".recharts-responsive-container")).not.toBeNull()
  })

  it("exposes every series colour as --color-<key>, from tokens, for light and dark", () => {
    const { container } = render(
      <ChartContainer config={config} id="sales">
        <BarChart data={[]} />
      </ChartContainer>,
    )

    const css = container.querySelector("style")?.textContent ?? ""
    const light = css.slice(0, css.indexOf(".dark"))
    const dark = css.slice(css.indexOf(".dark"))
    expect(light).toContain("[data-chart=chart-sales]")
    expect(light).toContain("--color-desktop: var(--chart-1);")
    expect(light).toContain("--color-mobile: var(--chart-2);")
    expect(dark).toContain("--color-desktop: var(--chart-1);")
    expect(dark).toContain("--color-mobile: var(--chart-3);")
  })

  it("writes no style when no series has a colour", () => {
    const { container } = render(
      <ChartContainer config={{ plain: { label: "Plain" } }}>
        <BarChart data={[]} />
      </ChartContainer>,
    )
    expect(container.querySelector("style")).toBeNull()
  })

  it("holds the chart to the 16:9 box that the loading skeleton also reserves", () => {
    const { container } = render(
      <ChartContainer config={config}>
        <BarChart data={[]} />
      </ChartContainer>,
    )
    expect(container.querySelector('[data-slot="chart"]')?.className).toContain("aspect-video")
  })
})

// ResponsiveContainer hands its child a width and height; the probe drops them.
const Probe = ({ children }: { children: React.ReactNode; width?: number; height?: number }) => <>{children}</>

describe("ChartTooltipContent and ChartLegendContent", () => {
  it("labels a tooltip row from the config and shows its value", () => {
    render(
      <ChartContainer config={config}>
        <Probe>
          <ChartTooltipContent
            active
            label="Jan"
            payload={[{ type: undefined, name: "desktop", dataKey: "desktop", value: 1200, color: "var(--color-desktop)", payload: {} }]}
          />
        </Probe>
      </ChartContainer>,
    )

    expect(screen.getByText("Desktop")).toBeTruthy()
    expect(screen.getByText("1,200")).toBeTruthy()
  })

  it("styles the tooltip as an overlay from theme tokens only", () => {
    const { container } = render(
      <ChartContainer config={config}>
        <Probe>
          <ChartTooltipContent
            active
            payload={[{ name: "desktop", dataKey: "desktop", value: 3, payload: {} }]}
          />
        </Probe>
      </ChartContainer>,
    )
    const tooltip = container.querySelector(".bg-popover")
    expect(tooltip?.className).toContain("text-popover-foreground")
    expect(tooltip?.className).not.toMatch(/border-border\/|#[0-9a-f]{3,6}|\b(white|black)\b/)
  })

  it("renders a legend entry per series, named from the config", () => {
    render(
      <ChartContainer config={config}>
        <Probe>
          <ChartLegendContent
            payload={[
              { dataKey: "desktop", value: "desktop", color: "var(--color-desktop)", type: "square" },
              { dataKey: "mobile", value: "mobile", color: "var(--color-mobile)", type: "square" },
            ]}
          />
        </Probe>
      </ChartContainer>,
    )
    expect(screen.getByText("Desktop")).toBeTruthy()
    expect(screen.getByText("Mobile")).toBeTruthy()
  })
})
