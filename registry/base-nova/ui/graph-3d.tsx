"use client"

import * as React from "react"
import { cn } from "cn"

import {
  mapGraph,
  resolveAutoRotate,
  resolveFocus,
  resolveHighlight,
  resolveTone,
  VOID_SURFACE_BACKGROUND,
  type Graph3DLink,
  type Graph3DNode,
  type Graph3DTone,
  type MappedNode,
} from "@/lib/graph-3d-core"
import type { GraphEngine, GraphHover } from "@/lib/graph-3d-engine"

export type { Graph3DLink, Graph3DNode, Graph3DTone }

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
  /**
   * Id of a node to glide the camera to, for a host that picked it elsewhere
   * (a search result). Changing it refocuses; an unknown id or undefined does
   * nothing. Under prefers-reduced-motion the camera jumps instead of gliding.
   */
  focusId?: string
  /** Slow rotation. Defaults to true and is always off under prefers-reduced-motion. */
  autoRotate?: boolean
  /** group -> CSS custom property, overriding the default chart-1..5 cycle. */
  groupTokens?: Readonly<Record<string, string>>
  /**
   * `default` draws on the surface you give it. `void` paints its own always-dark
   * gradient (from theme tokens, in light and dark pages alike) and draws nodes and
   * links as additive soft glow, so it needs no background class from you. It also labels
   * the hovered node, its top 8 neighbours and, zoomed in, the hottest nodes, in place of
   * the hover tooltip.
   */
  tone?: Graph3DTone
}

function Graph3D({
  nodes,
  links,
  onNodeClick,
  highlight,
  focusId,
  autoRotate,
  groupTokens,
  tone,
  className,
  style,
  ...props
}: Graph3DProps) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const engineRef = React.useRef<GraphEngine | null>(null)
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading")
  const [hover, setHover] = React.useState<GraphHover | null>(null)

  const resolvedTone = resolveTone(tone)
  const reducedMotion = useReducedMotion()
  const rotates = resolveAutoRotate(autoRotate, reducedMotion)
  const graph = React.useMemo(() => mapGraph(nodes, links, groupTokens), [nodes, links, groupTokens])

  // Effects below read the latest values without re-running the engine build.
  const latest = React.useRef({ graph, highlight, rotates, onNodeClick })
  latest.current = { graph, highlight, rotates, onNodeClick }

  // The void surface is always dark. Its own `dark` class makes the tokens below it
  // resolve to their dark values; a named theme lives on <html>, and its dark palette
  // is keyed to `[data-theme].dark` on one element, so the theme name is copied here.
  const mirrorPageTheme = React.useCallback(() => {
    const root = rootRef.current
    if (!root || resolvedTone !== "void") return
    const theme = document.documentElement.getAttribute("data-theme")
    if (theme === null) root.removeAttribute("data-theme")
    else root.setAttribute("data-theme", theme)
  }, [resolvedTone])

  React.useLayoutEffect(() => {
    mirrorPageTheme()
  }, [mirrorPageTheme])

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
          tone: resolvedTone,
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
  }, [graph, nodes, reducedMotion, resolvedTone])

  const highlightKey = highlight?.join("\u0000") ?? ""
  React.useEffect(() => {
    engineRef.current?.setHighlight(resolveHighlight(latest.current.highlight, latest.current.graph))
  }, [highlightKey, status])

  React.useEffect(() => {
    const index = resolveFocus(focusId, latest.current.graph)
    if (index !== -1) engineRef.current?.focusNode(index)
  }, [focusId, status])

  React.useEffect(() => {
    engineRef.current?.setAutoRotate(rotates)
  }, [rotates, status])

  // The theme is read from CSS tokens once; re-read when the html element's
  // class or attributes change (light/dark and named themes switch there).
  React.useEffect(() => {
    if (typeof MutationObserver === "undefined") return
    const observer = new MutationObserver(() => {
      mirrorPageTheme()
      engineRef.current?.refreshTheme()
    })
    observer.observe(document.documentElement, { attributes: true })
    return () => observer.disconnect()
  }, [mirrorPageTheme])

  return (
    <div
      ref={rootRef}
      data-slot="graph-3d"
      data-tone={resolvedTone}
      data-state={status}
      data-auto-rotate={rotates}
      data-reduced-motion={reducedMotion}
      role="img"
      aria-label={`Graph of ${graph.nodes.length} nodes and ${graph.links.length} links`}
      className={cn("relative size-full min-h-64 overflow-hidden rounded-lg", resolvedTone === "void" && "dark", className)}
      style={resolvedTone === "void" ? { background: VOID_SURFACE_BACKGROUND, ...style } : style}
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
      {hover && resolvedTone !== "void" ? (
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
