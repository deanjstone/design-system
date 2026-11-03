"use client"

import * as React from "react"
import { cn } from "cn"

import {
  mapGraph,
  resolveAutoRotate,
  resolveHighlight,
  type Graph3DLink,
  type Graph3DNode,
  type MappedNode,
} from "@/lib/graph-3d-core"
import type { GraphEngine, GraphHover } from "@/lib/graph-3d-engine"

export type { Graph3DLink, Graph3DNode }

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function subscribeToReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {}
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

const readReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches

function useReducedMotion() {
  return React.useSyncExternalStore(subscribeToReducedMotion, readReducedMotion, () => false)
}

type Graph3DProps = Omit<React.ComponentProps<"div">, "children" | "onError"> & {
  /** Keep this array stable (memoise it): a new array rebuilds the layout. */
  nodes: readonly Graph3DNode[]
  /** Keep this array stable (memoise it): a new array rebuilds the layout. */
  links: readonly Graph3DLink[]
  onNodeClick?: (node: Graph3DNode) => void
  /** Ids to emphasise. The rest dim, and the links touching these light up. */
  highlight?: readonly string[]
  /** Slow rotation. Defaults to true and is always off under prefers-reduced-motion. */
  autoRotate?: boolean
  /** group -> CSS custom property, overriding the default chart-1..5 cycle. */
  groupTokens?: Readonly<Record<string, string>>
}

function Graph3D({
  nodes,
  links,
  onNodeClick,
  highlight,
  autoRotate,
  groupTokens,
  className,
  ...props
}: Graph3DProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const engineRef = React.useRef<GraphEngine | null>(null)
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading")
  const [hover, setHover] = React.useState<GraphHover | null>(null)

  const reducedMotion = useReducedMotion()
  const rotates = resolveAutoRotate(autoRotate, reducedMotion)
  const graph = React.useMemo(() => mapGraph(nodes, links, groupTokens), [nodes, links, groupTokens])

  // Effects below read the latest values without re-running the engine build.
  const latest = React.useRef({ graph, highlight, rotates, onNodeClick })
  latest.current = { graph, highlight, rotates, onNodeClick }

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    setStatus("loading")
    setHover(null)

    // three.js and d3-force-3d load here, so they stay out of the first bundle.
    import("@/lib/graph-3d-engine")
      .then(({ createGraphEngine }) => {
        if (cancelled) return
        const current = latest.current
        engineRef.current = createGraphEngine({
          container,
          graph,
          autoRotate: current.rotates,
          reducedMotion,
          highlight: resolveHighlight(current.highlight, graph),
          onNodeClick: (node: MappedNode) => {
            const source = nodes.find((candidate) => candidate.id === node.id)
            if (source) latest.current.onNodeClick?.(source)
          },
          onHover: setHover,
        })
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error("graph-3d: could not start the WebGL renderer", error)
        setStatus("error")
      })

    return () => {
      cancelled = true
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [graph, nodes, reducedMotion])

  const highlightKey = highlight?.join("\u0000") ?? ""
  React.useEffect(() => {
    engineRef.current?.setHighlight(resolveHighlight(latest.current.highlight, latest.current.graph))
  }, [highlightKey, status])

  React.useEffect(() => {
    engineRef.current?.setAutoRotate(rotates)
  }, [rotates, status])

  // The theme is read from CSS tokens once; re-read when the html element's
  // class or attributes change (light/dark and named themes switch there).
  React.useEffect(() => {
    if (typeof MutationObserver === "undefined") return
    const observer = new MutationObserver(() => engineRef.current?.refreshTheme())
    observer.observe(document.documentElement, { attributes: true })
    return () => observer.disconnect()
  }, [])

  return (
    <div
      data-slot="graph-3d"
      data-state={status}
      data-auto-rotate={rotates}
      data-reduced-motion={reducedMotion}
      role="img"
      aria-label={`Graph of ${graph.nodes.length} nodes and ${graph.links.length} links`}
      className={cn("relative size-full min-h-64 overflow-hidden rounded-lg", className)}
      {...props}
    >
      <div ref={containerRef} data-slot="graph-3d-canvas" className="absolute inset-0 touch-none" />
      {status === "error" ? (
        <p
          role="status"
          data-slot="graph-3d-fallback"
          className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground"
        >
          3D view unavailable: WebGL could not start in this browser.
        </p>
      ) : null}
      {hover ? (
        <div
          role="tooltip"
          data-slot="graph-3d-tooltip"
          style={{ left: hover.x, top: hover.y }}
          className="pointer-events-none absolute z-10 max-w-xs -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
        >
          {hover.node.label}
        </div>
      ) : null}
    </div>
  )
}

export { Graph3D }
export type { Graph3DProps }
