// Pure logic behind `graph-3d`: prop mapping, theme-colour parsing, the
// reduced-motion decision and node picking. No three.js and no DOM, so it runs
// (and is tested) anywhere; the renderer in graph-3d-engine.ts consumes it.

export type Graph3DNode = {
  id: string
  label: string
  group: string
  /** Relative size. Defaults to 1; the drawn radius grows with its square root. */
  size?: number
}

export type Graph3DLink = {
  source: string
  target: string
  /** Pull strength relative to the heaviest link. Defaults to 1. */
  weight?: number
  /** Passed through untouched; the layout does not read it. */
  kind?: string
}

export type MappedNode = {
  id: string
  label: string
  group: string
  /** Index into `MappedGraph.nodes`, and into every per-node buffer. */
  index: number
  /** World-space radius. */
  radius: number
  /** CSS custom property this node's group draws from. */
  token: string
}

export type MappedLink = {
  source: number
  target: number
  /** In (0, 1]: weight divided by the heaviest weight. */
  strength: number
  kind?: string
}

export type MappedGraph = {
  nodes: MappedNode[]
  links: MappedLink[]
  groups: { group: string; token: string }[]
  /** Links skipped because an end is missing, or both ends are the same node. */
  droppedLinks: number
  /** Nodes skipped because an earlier node already used their id. */
  droppedNodes: number
}

/** Groups take these in sorted order, wrapping after the fifth. */
export const GROUP_TOKENS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"] as const

const BASE_RADIUS = 1.1
const MIN_SIZE = 0.25
const MAX_SIZE = 16

const finitePositive = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback

export function mapGraph(
  nodes: readonly Graph3DNode[],
  links: readonly Graph3DLink[],
  groupTokens: Readonly<Record<string, string>> = {},
): MappedGraph {
  const indexById = new Map<string, number>()
  const kept: Graph3DNode[] = []
  let droppedNodes = 0
  for (const node of nodes) {
    if (indexById.has(node.id)) {
      droppedNodes++
      continue
    }
    indexById.set(node.id, kept.length)
    kept.push(node)
  }

  const sortedGroups = [...new Set(kept.map((node) => node.group))].sort()
  const tokenByGroup = new Map(
    sortedGroups.map((group, position) => [
      group,
      groupTokens[group] ?? GROUP_TOKENS[position % GROUP_TOKENS.length],
    ]),
  )

  const mappedNodes: MappedNode[] = kept.map((node, index) => ({
    id: node.id,
    label: node.label,
    group: node.group,
    index,
    radius: BASE_RADIUS * Math.sqrt(Math.min(MAX_SIZE, Math.max(MIN_SIZE, finitePositive(node.size, 1)))),
    token: tokenByGroup.get(node.group)!,
  }))

  const resolved: { source: number; target: number; weight: number; kind?: string }[] = []
  let droppedLinks = 0
  for (const link of links) {
    const source = indexById.get(link.source)
    const target = indexById.get(link.target)
    if (source === undefined || target === undefined || source === target) {
      droppedLinks++
      continue
    }
    resolved.push({ source, target, weight: finitePositive(link.weight, 1), kind: link.kind })
  }
  const heaviest = resolved.reduce((max, link) => Math.max(max, link.weight), 0)

  return {
    nodes: mappedNodes,
    links: resolved.map(({ source, target, weight, kind }) => {
      const link: MappedLink = { source, target, strength: weight / heaviest }
      if (kind !== undefined) link.kind = kind
      return link
    }),
    groups: sortedGroups.map((group) => ({ group, token: tokenByGroup.get(group)! })),
    droppedLinks,
    droppedNodes,
  }
}

/** Indices of the highlighted ids that exist in the graph; unknown ids are ignored. */
export function resolveHighlight(ids: readonly string[] | undefined, graph: MappedGraph): Set<number> {
  const wanted = new Set(ids ?? [])
  return new Set(graph.nodes.filter((node) => wanted.has(node.id)).map((node) => node.index))
}

/** Auto-rotate is on unless the prop says no, and never under reduced motion. */
export function resolveAutoRotate(autoRotate: boolean | undefined, reducedMotion: boolean): boolean {
  return (autoRotate ?? true) && !reducedMotion
}

export type Rgb = readonly [red: number, green: number, blue: number]

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const gamma = (linear: number) =>
  linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055

function oklchToSrgb(lightness: number, chroma: number, hueDegrees: number): Rgb {
  const hue = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    clamp01(gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ]
}

const numberOrNone = (token: string, percentScale: number) => {
  if (token === "none") return 0
  const value = Number.parseFloat(token)
  if (Number.isNaN(value)) return Number.NaN
  return token.endsWith("%") ? (value / 100) * percentScale : value
}

/**
 * sRGB (0 to 1) for the colour syntaxes the theme tokens are written in: hex,
 * rgb() and oklch(). Anything else returns null and the engine asks the browser.
 */
export function parseCssColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase()

  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1]
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? hex.split("").map((digit) => digit + digit).join("") : hex
    const channel = (offset: number) => Number.parseInt(full.slice(offset, offset + 2), 16) / 255
    return [channel(0), channel(2), channel(4)]
  }

  const functional = /^(rgba?|oklch)\(([^)]*)\)$/.exec(text)
  if (!functional) return null
  const channels = functional[2].split("/")[0].trim().split(/[\s,]+/)
  if (channels.length < 3) return null

  if (functional[1] === "oklch") {
    const lightness = numberOrNone(channels[0], 1)
    const chroma = numberOrNone(channels[1], 0.4)
    const hue = channels[2].endsWith("deg") ? Number.parseFloat(channels[2]) : numberOrNone(channels[2], 360)
    return [lightness, chroma, hue].some(Number.isNaN) ? null : oklchToSrgb(lightness, chroma, hue)
  }

  const rgb: Rgb = [0, 1, 2].map((position) => numberOrNone(channels[position], 255) / 255) as [number, number, number]
  return rgb.some(Number.isNaN) ? null : [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])]
}

/**
 * Index of the node nearest the pointer, or -1. `screen` holds x, y and depth
 * (smaller is nearer) per node; each node is hit within its own pixel radius
 * plus `slack`, and the nearer node wins when two discs overlap the pointer.
 */
export function pickNearest(
  screen: Float32Array,
  radiiPx: Float32Array,
  pointerX: number,
  pointerY: number,
  slack: number,
): number {
  let best = -1
  let bestDepth = Number.POSITIVE_INFINITY
  for (let index = 0; index < radiiPx.length; index++) {
    const depth = screen[index * 3 + 2]
    if (!Number.isFinite(depth)) continue
    const reach = radiiPx[index] + slack
    const dx = screen[index * 3] - pointerX
    const dy = screen[index * 3 + 1] - pointerY
    if (dx * dx + dy * dy <= reach * reach && depth < bestDepth) {
      best = index
      bestDepth = depth
    }
  }
  return best
}

export const easeInOutCubic = (progress: number) =>
  progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
