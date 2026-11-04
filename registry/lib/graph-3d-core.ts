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
  /** True settles the layout as a spherical shell (0.4R to 1.0R); false leaves the force cloud as it falls. */
  shellLayout: boolean
  /** Multiplies the camera's starting distance: the shell is tighter than the cloud, so void moves in. */
  cameraScale: number
  /** True adds the membrane, the motes and the breathing motion: see `resolveAtmosphere`. */
  atmosphere: boolean
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
      shellLayout: true,
      cameraScale: 0.8,
      atmosphere: true,
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
    shellLayout: false,
    cameraScale: 1,
    atmosphere: false,
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

/** The innermost shell, as a share of the outer radius: nodes spread between 0.4R and 1.0R. */
export const SHELL_INNER_FRACTION = 0.4

/** A body the shell layout can move: d3-force's node shape, positions plus optional velocity. */
export type ShellBody = { x: number; y: number; z: number; vx?: number; vy?: number; vz?: number }

/** A point on the unit sphere, evenly spread over `count` points by the golden angle. */
export function fibonacciDirection(index: number, count: number): readonly [x: number, y: number, z: number] {
  const height = 1 - (2 * (index + 0.5)) / Math.max(1, count)
  const ring = Math.sqrt(Math.max(0, 1 - height * height))
  const angle = index * Math.PI * (3 - Math.sqrt(5))
  return [ring * Math.cos(angle), height, ring * Math.sin(angle)]
}

/**
 * The shell radius for each node, from its distance from the centre: nodes are ranked by
 * distance and spread so the ball is filled evenly by volume between `SHELL_INNER_FRACTION`
 * and 1 times `outerRadius`. The order is the layout's own, so a node the links pulled
 * inward stays inward; only the spacing is regularised. Ties rank by index.
 */
export function shellRadii(distances: ArrayLike<number>, outerRadius: number): Float64Array {
  const count = distances.length
  const radii = new Float64Array(count)
  const order = Array.from({ length: count }, (_, index) => index).sort(
    (a, b) => (distances[a] ?? 0) - (distances[b] ?? 0) || a - b,
  )
  const innerVolume = SHELL_INNER_FRACTION ** 3
  order.forEach((node, rank) => {
    const share = count === 1 ? 1 : rank / (count - 1)
    radii[node] = outerRadius * Math.cbrt(innerVolume + (1 - innerVolume) * share)
  })
  return radii
}

const CENTRE_EPSILON = 1e-6

/** Unit direction of a body from the origin and its distance, or a spread-out direction at distance 0 for one sitting on the origin. */
function direction(body: ShellBody, index: number, count: number) {
  const distance = Math.hypot(body.x, body.y, body.z)
  if (distance < CENTRE_EPSILON) {
    const [x, y, z] = fibonacciDirection(index, count)
    return { x, y, z, distance: 0 }
  }
  return { x: body.x / distance, y: body.y / distance, z: body.z / distance, distance }
}

/** Moves every body onto its shell, along its own direction from the origin. Run once the layout settles. */
export function snapToShells(bodies: ShellBody[], outerRadius: number): void {
  const aims = bodies.map((body, index) => direction(body, index, bodies.length))
  const radii = shellRadii(aims.map((aim) => aim.distance), outerRadius)
  bodies.forEach((body, index) => {
    const aim = aims[index]!
    body.x = aim.x * radii[index]!
    body.y = aim.y * radii[index]!
    body.z = aim.z * radii[index]!
  })
}

/**
 * A d3-force force that pulls each body toward its shell radius: the radial force's
 * job, but aimed at a spread of radii instead of one, so the layout settles as a ball
 * with a clean outline. `strength` plays the same role as forceRadial's, and is high
 * on purpose: at 4 the settled layout sits within about 0.06R of its shells on average
 * (0.5 left 0.22R), so the final snap is a nudge, not a jump.
 */
export function shellForce(outerRadius: number, strength = 4) {
  let bodies: ShellBody[] = []
  const force = (alpha: number) => {
    const aims = bodies.map((body, index) => direction(body, index, bodies.length))
    const radii = shellRadii(aims.map((aim) => aim.distance), outerRadius)
    bodies.forEach((body, index) => {
      const aim = aims[index]!
      const pull = (radii[index]! - aim.distance) * strength * alpha
      body.vx = (body.vx ?? 0) + aim.x * pull
      body.vy = (body.vy ?? 0) + aim.y * pull
      body.vz = (body.vz ?? 0) + aim.z * pull
    })
  }
  force.initialize = (next: ShellBody[]) => {
    bodies = next
  }
  return force
}

/** The void tone's glass shell and dust. Radii are shares of the outer radius R, the one the shell layout fills. */
export const ATMOSPHERE = {
  /** The membrane sphere sits just outside the outermost node. */
  membraneRadius: 1.04,
  /** Peak alpha of the membrane's rim; the face-on centre is clear. */
  rimAlpha: 0.3,
  /** Fresnel falloff: higher keeps the glow to a thinner rim. */
  rimPower: 2.4,
  moteCount: 1000,
  moteInner: 1.15,
  moteOuter: 2.25,
  /** Diameter of a mote, in CSS px, whatever its distance. */
  motePx: 2.6,
  moteAlpha: 0.5,
  /** How far a mote wanders from its home along each axis, as a share of R. */
  moteDrift: 0.05,
} as const

/** The clocks behind the void tone's motion, in seconds and radians per second. */
export const MOTION = {
  /** Turn of the whole orb about its vertical axis. */
  yawRate: 0.05,
  /** The orb tips toward and away from the viewer by up to this many radians... */
  pitchTilt: 0.2,
  /** ...and the tilt itself swings round this slowly, so the view never repeats quickly. */
  pitchRate: 0.037,
  /** Two sines make the breath; their rates are not a multiple of each other. */
  breathRates: [0.52, 0.83] as const,
  breathAmplitudes: [0.006, 0.0035] as const,
  /** A node's pulse is `0.6 + 0.4 sin(rate t + phase)`, so it dims to 60% and no further. */
  pulseRate: 0.55,
  pulseDepth: 0.4,
  /** Motion holds still this long after the last interaction, then eases back. */
  idleMs: 8000,
  /** Time constants of the ease, in ms; a step covers `1 - exp(-dt / tau)` of the way to its target. */
  easeInMs: 1500,
  /** Stopping is quicker than starting, so the orb is still by the time you have looked at what you touched. */
  easeOutMs: 250,
} as const

/**
 * What the atmosphere draws. Under void the membrane is always there: it does not move,
 * so reduced motion keeps it. The motes and every motion are off under reduced motion.
 */
export function resolveAtmosphere(profile: Pick<ToneProfile, "atmosphere">, reducedMotion: boolean) {
  return {
    membrane: profile.atmosphere,
    motes: profile.atmosphere && !reducedMotion,
    motion: profile.atmosphere && !reducedMotion,
  }
}

/** A small seeded generator (mulberry32), so a rebuilt graph gets the same dust. */
function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Where the dust lives: `count` points spread evenly by volume through the shell between
 * `ATMOSPHERE.moteInner` and `moteOuter` times `outerRadius`, each with its own phase for
 * the drift. The same arguments give the same field.
 */
export function moteField(count: number, outerRadius: number, seed = 1182) {
  const random = seededRandom(seed)
  const positions = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  const innerVolume = ATMOSPHERE.moteInner ** 3
  const outerVolume = ATMOSPHERE.moteOuter ** 3
  for (let index = 0; index < count; index++) {
    const radius = outerRadius * Math.cbrt(innerVolume + (outerVolume - innerVolume) * random())
    const height = 2 * random() - 1
    const ring = Math.sqrt(1 - height * height)
    const angle = 2 * Math.PI * random()
    positions[index * 3] = radius * ring * Math.cos(angle)
    positions[index * 3 + 1] = radius * height
    positions[index * 3 + 2] = radius * ring * Math.sin(angle)
    phases[index] = 2 * Math.PI * random()
  }
  return { positions, phases }
}

/** A node's pulse phase, in [0, 2 pi): the golden angle per index, so neighbours are never in step. */
export function nodePhase(index: number): number {
  return (index * Math.PI * (3 - Math.sqrt(5))) % (2 * Math.PI)
}

/** The orb's size at motion time `seconds`, within 1% of 1: two sines that do not line up. */
export function breathScale(seconds: number): number {
  return (
    1 +
    MOTION.breathAmplitudes[0] * Math.sin(MOTION.breathRates[0] * seconds) +
    MOTION.breathAmplitudes[1] * Math.sin(MOTION.breathRates[1] * seconds + 1.3)
  )
}

/** The orb's rotation at motion time `seconds`, in radians: a steady yaw and a pitch that swings slowly. */
export function precession(seconds: number): { yaw: number; pitch: number } {
  return { yaw: MOTION.yawRate * seconds, pitch: MOTION.pitchTilt * Math.sin(MOTION.pitchRate * seconds) }
}

/** The rate (0 still, 1 full) the motion clock is heading for: still while touched, until idle long enough. */
export function motionTarget(state: { interacting: boolean; hovered: boolean; idleMs: number }): 0 | 1 {
  if (state.interacting || state.hovered) return 0
  return state.idleMs >= MOTION.idleMs ? 1 : 0
}

/** Moves the motion rate toward `target` over `dtMs`: slowly up, quickly down; frame-rate independent, never past the target. */
export function stepMotionRate(rate: number, target: number, dtMs: number): number {
  const tau = target < rate ? MOTION.easeOutMs : MOTION.easeInMs
  return rate + (target - rate) * (1 - Math.exp(-Math.max(0, dtMs) / tau))
}
