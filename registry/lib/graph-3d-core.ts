// Pure logic behind `graph-3d`: prop mapping, theme-colour parsing, the
// reduced-motion decision and node picking. No three.js and no DOM, so it runs
// (and is tested) anywhere; the renderer in graph-3d-engine.ts consumes it.

export type Graph3DNode = {
  id: string
  label: string
  group: string
  /** Relative size. Defaults to 1; the drawn radius grows with its square root. */
  size?: number
  /**
   * How hot the node is, 0 to 1. Hot nodes are brighter, larger and more saturated;
   * cold ones dim toward a floor and tint toward grey. Leave it off and the node
   * draws exactly as it did before heat existed. Values outside 0-1 are clamped.
   */
  heat?: number
}

export type Graph3DLink = {
  source: string
  target: string
  /** Pull strength relative to the heaviest link. Defaults to 1. */
  weight?: number
  /** Passed through untouched; the layout does not read it. */
  kind?: string
}

/**
 * `default` draws on whatever surface the host provides. `void` is the orb look:
 * an always-dark gradient the component paints itself, additive soft-glow nodes
 * and a tight node-size range.
 */
export type Graph3DTone = "default" | "void"

export type MappedNode = {
  id: string
  label: string
  group: string
  /** Index into `MappedGraph.nodes`, and into every per-node buffer. */
  index: number
  /** World-space radius. */
  radius: number
  /** Kept links touching this node. */
  degree: number
  /** CSS custom property this node's group draws from. */
  token: string
  /** 0 to 1, present only when the node was given a finite heat. */
  heat?: number
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

const BASE_RADIUS = 1.8
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

  const mappedNodes: MappedNode[] = kept.map((node, index) => {
    const mapped: MappedNode = {
      id: node.id,
      label: node.label,
      group: node.group,
      index,
      radius: BASE_RADIUS * Math.sqrt(Math.min(MAX_SIZE, Math.max(MIN_SIZE, finitePositive(node.size, 1)))),
      degree: 0,
      token: tokenByGroup.get(node.group)!,
    }
    const heat = resolveHeat(node.heat)
    if (heat !== undefined) mapped.heat = heat
    return mapped
  })

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
  for (const { source, target } of resolved) {
    mappedNodes[source]!.degree++
    mappedNodes[target]!.degree++
  }

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

/** A node's heat clamped to 0-1, or undefined when it has none (missing or not a finite number). */
export function resolveHeat(heat: number | undefined): number | undefined {
  if (typeof heat !== "number" || !Number.isFinite(heat)) return undefined
  return Math.min(1, Math.max(0, heat))
}

/** A cold node (heat 0) draws at this share of full brightness: dim, but still there to be found. */
export const HEAT_FLOOR = 0.42
/** Brightness gained from heat 0 to heat 1, so the hottest node reaches full brightness. */
const HEAT_GAIN = 1 - HEAT_FLOOR
/** A cold node keeps this share of its group colour's saturation; a hot one keeps all of it. */
const HEAT_MIN_SATURATION = 0.3
/** Sprite scale at heat 0 and heat 1; heat 0.5 is the node's own size. */
const HEAT_SIZE_RANGE = { cold: 0.6, hot: 1.4 } as const

/** Brightness multiplier: `floor + heat * gain`, or 1 when the node has no heat. */
export function heatBrightness(heat: number | undefined): number {
  return heat === undefined ? 1 : HEAT_FLOOR + heat * HEAT_GAIN
}

/** Sprite size multiplier, 0.6 cold to 1.4 hot, or 1 when the node has no heat. */
export function heatSizeScale(heat: number | undefined): number {
  return heat === undefined ? 1 : HEAT_SIZE_RANGE.cold + heat * (HEAT_SIZE_RANGE.hot - HEAT_SIZE_RANGE.cold)
}

/**
 * The group colour a node draws in. A cold node is pulled toward the grey of equal
 * luminance, so it keeps its hue but loses saturation; a hot node keeps the full colour.
 */
export function heatColour(colour: Rgb, heat: number | undefined): Rgb {
  if (heat === undefined) return colour
  const saturation = HEAT_MIN_SATURATION + (1 - HEAT_MIN_SATURATION) * heat
  const grey = 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2]
  return [
    grey + (colour[0] - grey) * saturation,
    grey + (colour[1] - grey) * saturation,
    grey + (colour[2] - grey) * saturation,
  ]
}

/** The tone prop's value, with anything unrecognised read as the default tone. */
export function resolveTone(tone: Graph3DTone | undefined): Graph3DTone {
  return tone === "void" ? "void" : "default"
}

/** The surface `tone="void"` paints: the page's darkest surface rising to a deep blue, all from tokens. */
export const VOID_SURFACE_BACKGROUND =
  "linear-gradient(0deg, var(--surface-0) 30%, color-mix(in oklab, var(--surface-0) 88%, var(--chart-5)))"

/** Void node sprites stay between these, in CSS px: a speck for a loose note, a bright bloom for a hub. */
const VOID_SPRITE_PX = { min: 3, max: 20 } as const
/** Void sprites are drawn at this share of the node's diameter; the glow supplies the rest of the size. */
const VOID_NODE_SCALE = 0.7
/** Each unit of sqrt(degree) adds this share of a void sprite's base size. */
const VOID_DEGREE_GAIN = 0.35

/** How the engine draws one tone: blending, node profile, sprite clamp (device px) and link opacity. */
export type ToneProfile = {
  additive: boolean
  /** True draws a soft falloff with no edge; false draws a hard disc with a halo. */
  softGlow: boolean
  /** Sprite size over node size; the default tone pads the sprite so its halo has room. */
  spriteFactor: number
  minSpritePx: number
  maxSpritePx: number
  baseEdgeOpacity: number
  activeEdgeOpacity: number
}

export function toneProfile(tone: Graph3DTone, pixelRatio: number): ToneProfile {
  if (tone === "void") {
    return {
      additive: true,
      softGlow: true,
      spriteFactor: 1,
      minSpritePx: VOID_SPRITE_PX.min * pixelRatio,
      maxSpritePx: VOID_SPRITE_PX.max * pixelRatio,
      baseEdgeOpacity: 0.16,
      activeEdgeOpacity: 0.7,
    }
  }
  return {
    additive: false,
    softGlow: false,
    spriteFactor: 2.6,
    minSpritePx: 2,
    maxSpritePx: 160,
    baseEdgeOpacity: 0.2,
    activeEdgeOpacity: 0.85,
  }
}

/**
 * World-space size the node's sprite is drawn from: the node diameter, and under void a
 * degree-weighted one, both scaled by the node's heat when it has any.
 */
export function nodeSpriteSize(node: Pick<MappedNode, "radius" | "degree" | "heat">, tone: Graph3DTone): number {
  const diameter = node.radius * 2 * heatSizeScale(node.heat)
  if (tone !== "void") return diameter
  return diameter * VOID_NODE_SCALE * (1 + VOID_DEGREE_GAIN * Math.sqrt(node.degree))
}

/** On-screen sprite diameter in device px: the vertex shader's formula, for picking and tests. */
export function spritePixelDiameter(
  worldSize: number,
  pixelsPerWorldUnit: number,
  distance: number,
  pixelRatio: number,
  profile: ToneProfile,
): number {
  const raw = (worldSize * profile.spriteFactor * pixelsPerWorldUnit * pixelRatio) / distance
  return Math.min(profile.maxSpritePx, Math.max(profile.minSpritePx, raw))
}

/** Indices of the highlighted ids that exist in the graph; unknown ids are ignored. */
export function resolveHighlight(ids: readonly string[] | undefined, graph: MappedGraph): Set<number> {
  const wanted = new Set(ids ?? [])
  return new Set(graph.nodes.filter((node) => wanted.has(node.id)).map((node) => node.index))
}

/** Index of the node with this id, or -1 when `id` is unset or not in the graph. */
export function resolveFocus(id: string | undefined, graph: MappedGraph): number {
  if (id === undefined) return -1
  return graph.nodes.find((node) => node.id === id)?.index ?? -1
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

const numberOrNone = (token: string | undefined, percentScale: number) => {
  if (token === undefined) return Number.NaN
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
  const channels = (functional[2]?.split("/")[0] ?? "").trim().split(/[\s,]+/)
  if (channels.length < 3) return null

  if (functional[1] === "oklch") {
    const lightness = numberOrNone(channels[0], 1)
    const chroma = numberOrNone(channels[1], 0.4)
    const hueToken = channels[2]
    const hue = hueToken?.endsWith("deg") ? Number.parseFloat(hueToken) : numberOrNone(hueToken, 360)
    return [lightness, chroma, hue].some(Number.isNaN) ? null : oklchToSrgb(lightness, chroma, hue)
  }

  const [red, green, blue] = [0, 1, 2].map((position) => numberOrNone(channels[position], 255) / 255)
  if (red === undefined || green === undefined || blue === undefined) return null
  return [red, green, blue].some(Number.isNaN) ? null : [clamp01(red), clamp01(green), clamp01(blue)]
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
    const depth = screen[index * 3 + 2] ?? Number.NaN
    if (!Number.isFinite(depth)) continue
    const reach = (radiiPx[index] ?? 0) + slack
    const dx = (screen[index * 3] ?? 0) - pointerX
    const dy = (screen[index * 3 + 1] ?? 0) - pointerY
    if (dx * dx + dy * dy <= reach * reach && depth < bestDepth) {
      best = index
      bestDepth = depth
    }
  }
  return best
}

export const easeInOutCubic = (progress: number) =>
  progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
