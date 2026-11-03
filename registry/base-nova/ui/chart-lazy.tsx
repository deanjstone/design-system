"use client"

import * as React from "react"
import { cn } from "cn"

import { Skeleton } from "@/components/ui/skeleton"

// recharts is the heaviest dependency a page gets from this registry, so a chart
// loads on demand. Put the recharts composition (ChartContainer, the chart, its axes)
// in its own module that default-exports the component, and wrap it once at module
// scope:
//
//   const RevenueChart = createLazyChart(() => import("./revenue-chart"))
//   <RevenueChart data={rows} className="h-64" />
//
// This file never imports recharts or chart.tsx, so importing it adds nothing to the
// first bundle: the chunk is fetched when the chart first renders. While it loads the
// chart's box is held at the same aspect ratio, so the page does not jump.

type LoadChart<Props> = () => Promise<{ default: React.ComponentType<Props> }>

type LazyChartProps = { className?: string }

type BoundaryState = { failed: boolean }

class ChartLoadBoundary extends React.Component<
  { className?: string; children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error("chart-lazy: could not load the chart module", error)
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          role="alert"
          data-slot="chart-error"
          className={cn(
            "flex aspect-video items-center justify-center rounded-lg border border-border text-sm text-muted-foreground",
            this.props.className
          )}
        >
          The chart could not be loaded.
        </div>
      )
    }
    return this.props.children
  }
}

function ChartFallback({ className }: { className?: string }) {
  return (
    <Skeleton
      role="status"
      aria-label="Loading chart"
      data-slot="chart-fallback"
      className={cn("aspect-video w-full rounded-lg", className)}
    />
  )
}

function createLazyChart<Props extends LazyChartProps>(load: LoadChart<Props>) {
  const Chart = React.lazy(load)

  return function LazyChart(props: Props) {
    return (
      <ChartLoadBoundary className={props.className}>
        <React.Suspense fallback={<ChartFallback className={props.className} />}>
          <Chart {...props} />
        </React.Suspense>
      </ChartLoadBoundary>
    )
  }
}

export { createLazyChart, ChartFallback }
export type { LoadChart }
