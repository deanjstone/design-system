// @vitest-environment node

import { forceCenter, forceLink, forceManyBody, forceRadial, forceSimulation } from "d3-force-3d"
import { describe, expect, it } from "vitest"

import {
  ATMOSPHERE,
  GROUP_TOKENS,
  HEAT_FLOOR,
  MOTION,
  SHELL_INNER_FRACTION,
  breathScale,
  easeInOutCubic,
  fibonacciDirection,
  heatBrightness,
  heatColour,
  heatSizeScale,
  mapGraph,
  moteField,
  motionTarget,
  nodePhase,
  parseCssColor,
  nodeSpriteSize,
  pickNearest,
  precession,
  resolveAtmosphere,
  resolveAutoRotate,
  resolveFocus,
  resolveHighlight,
  resolveTone,
  shellForce,
  shellRadii,
  snapToShells,
  spritePixelDiameter,
  stepMotionRate,
  toneProfile,
  VOID_SURFACE_BACKGROUND,
} from "@/lib/graph-3d-core"
import { sampleGraph } from "../docs/graph-3d/sample"

// graph-3d prop mapping, theme-colour parsing and the reduced-motion decision
// (design-system#169). The renderer is WebGL and is proved in a real browser by
// docs/graph-3d/measure.mjs; everything it decides from props is here.

const nodes = [
  { id: "a", label: "Alpha", group: "tools" },
  { id: "b", label: "Beta", group: "memory", size: 4 },
  { id: "c", label: "Gamma", group: "tools", size: 0 },
]

describe("mapGraph", () => {
  it("indexes nodes in order and resolves link ends to indices", () => {
    const graph = mapGraph(nodes, [{ source: "a", target: "c" }, { source: "c", target: "b", kind: "wikilink" }])
    expect(graph.nodes.map((node) => [node.id, node.index])).toEqual([["a", 0], ["b", 1], ["c", 2]])
    expect(graph.links).toEqual([
      { source: 0, target: 2, strength: 1 },
      { source: 2, target: 1, strength: 1, kind: "wikilink" },
    ])
  })

  it("drops links with a missing end or the same node at both ends, and counts them", () => {
    const graph = mapGraph(nodes, [
      { source: "a", target: "ghost" },
      { source: "b", target: "b" },
      { source: "a", target: "b" },
    ])
    expect(graph.links).toHaveLength(1)
    expect(graph.droppedLinks).toBe(2)
  })

  it("keeps the first node when an id repeats", () => {
    const graph = mapGraph([...nodes, { id: "a", label: "Again", group: "x" }], [])
    expect(graph.nodes).toHaveLength(3)
    expect(graph.nodes[0].label).toBe("Alpha")
    expect(graph.droppedNodes).toBe(1)
  })

  it("grows the radius with size and falls back to size 1 when it is not a positive number", () => {
    const [plain, big, zero] = mapGraph(nodes, []).nodes
    const fallbacks = mapGraph(
      [
        { id: "n", label: "n", group: "g", size: Number.NaN },
        { id: "i", label: "i", group: "g", size: -3 },
        { id: "u", label: "u", group: "g" },
      ],
      [],
    ).nodes
    expect(big.radius).toBeGreaterThan(plain.radius)
    expect(zero.radius).toBe(plain.radius)
    expect(new Set(fallbacks.map((node) => node.radius))).toEqual(new Set([plain.radius]))
  })

  it("clamps a huge size so one node cannot swallow the orb", () => {
    const [huge, capped] = mapGraph(
      [
        { id: "h", label: "h", group: "g", size: 1_000_000 },
        { id: "c", label: "c", group: "g", size: 16 },
      ],
      [],
    ).nodes
    expect(huge.radius).toBe(capped.radius)
  })

  it("gives each group a chart token in sorted order, wrapping after the fifth", () => {
    const many = Array.from({ length: 7 }, (_, position) => ({
      id: `n${position}`,
      label: `n${position}`,
      group: `group-${position}`,
    }))
    const graph = mapGraph(many, [])
    expect(graph.groups.map((entry) => entry.token)).toEqual([...GROUP_TOKENS, GROUP_TOKENS[0], GROUP_TOKENS[1]])
    expect(graph.nodes[6].token).toBe(GROUP_TOKENS[1])
  })

  it("lets groupTokens override a group's token", () => {
    const graph = mapGraph(nodes, [], { memory: "--success" })
    expect(graph.groups).toEqual([
      { group: "memory", token: "--success" },
      { group: "tools", token: GROUP_TOKENS[1] },
    ])
  })

  it("normalises weight against the heaviest link and treats a bad weight as 1", () => {
    const graph = mapGraph(nodes, [
      { source: "a", target: "b", weight: 4 },
      { source: "b", target: "c", weight: 1 },
      { source: "a", target: "c", weight: -2 },
    ])
    expect(graph.links.map((link) => link.strength)).toEqual([1, 0.25, 0.25])
  })

  it("maps an empty graph without dividing by zero", () => {
    expect(mapGraph([], [])).toEqual({ nodes: [], links: [], groups: [], droppedLinks: 0, droppedNodes: 0 })
  })
})

describe("resolveFocus", () => {
  const graph = mapGraph(nodes, [])

  it("returns the node's index, or -1 for an unknown or unset id", () => {
    expect(resolveFocus("b", graph)).toBe(1)
    expect(resolveFocus("ghost", graph)).toBe(-1)
    expect(resolveFocus(undefined, graph)).toBe(-1)
  })
})

describe("resolveHighlight", () => {
  it("returns the indices of known ids and ignores the rest", () => {
    const graph = mapGraph(nodes, [])
    expect([...resolveHighlight(["c", "ghost", "a"], graph)].sort((x, y) => x - y)).toEqual([0, 2])
    expect(resolveHighlight(undefined, graph).size).toBe(0)
  })
})

describe("resolveAutoRotate", () => {
  it("rotates by default", () => {
    expect(resolveAutoRotate(undefined, false)).toBe(true)
    expect(resolveAutoRotate(true, false)).toBe(true)
  })
  it("stays off when the prop says so", () => {
    expect(resolveAutoRotate(false, false)).toBe(false)
  })
  it("never rotates under prefers-reduced-motion, whatever the prop says", () => {
    expect(resolveAutoRotate(true, true)).toBe(false)
    expect(resolveAutoRotate(undefined, true)).toBe(false)
  })
})

describe("parseCssColor", () => {
  const close = (actual: readonly number[] | null, expected: readonly number[]) => {
    expect(actual).not.toBeNull()
    actual!.forEach((channel, position) => expect(channel).toBeCloseTo(expected[position], 1))
  }

  it("reads 3, 6 and 8 digit hex", () => {
    close(parseCssColor("#fff"), [1, 1, 1])
    close(parseCssColor("#0a6f75"), [10 / 255, 111 / 255, 117 / 255])
    close(parseCssColor("#0a6f75ff"), [10 / 255, 111 / 255, 117 / 255])
  })

  it("reads rgb() in comma and space syntax", () => {
    close(parseCssColor("rgb(255, 0, 51)"), [1, 0, 0.2])
    close(parseCssColor("rgb(255 0 51 / 50%)"), [1, 0, 0.2])
  })

  it("reads the oklch() values the chart tokens use", () => {
    close(parseCssColor("oklch(59.6% 0.145 163.225)"), [5 / 255, 150 / 255, 105 / 255])
    close(parseCssColor("oklch(1 0 0)"), [1, 1, 1])
    close(parseCssColor("oklch(0 0 0)"), [0, 0, 0])
    close(parseCssColor("oklch(0.62 0 0 / 40%)"), parseCssColor("oklch(0.62 0 0)")!)
  })

  it("returns null for syntax it does not read", () => {
    expect(parseCssColor("color-mix(in oklab, red, blue)")).toBeNull()
    expect(parseCssColor("rebeccapurple")).toBeNull()
    expect(parseCssColor("")).toBeNull()
    expect(parseCssColor("oklch(abc 0 0)")).toBeNull()
  })
})

describe("pickNearest", () => {
  // x, y, depth per node
  const screen = new Float32Array([100, 100, 0.5, 104, 100, 0.2, 300, 300, 0.1])
  const radii = new Float32Array([6, 6, 6])

  it("returns -1 when nothing is within reach", () => {
    expect(pickNearest(screen, radii, 200, 200, 4)).toBe(-1)
  })
  it("hits a node inside its radius plus slack", () => {
    expect(pickNearest(screen, radii, 308, 300, 4)).toBe(2)
  })
  it("prefers the nearer node when discs overlap the pointer", () => {
    expect(pickNearest(screen, radii, 102, 100, 0)).toBe(1)
  })
  it("skips a node behind the camera (non-finite depth)", () => {
    const behind = new Float32Array([100, 100, Number.NaN])
    expect(pickNearest(behind, new Float32Array([6]), 100, 100, 4)).toBe(-1)
  })
})

describe("easeInOutCubic", () => {
  it("runs 0 to 1 and is symmetric about the midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
  })
})

describe("mapGraph degree", () => {
  it("counts the kept links touching each node, so a hub has a high degree", () => {
    const graph = mapGraph(nodes, [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
      { source: "b", target: "c" },
      { source: "a", target: "ghost" },
      { source: "a", target: "a" },
    ])
    expect(graph.nodes.map((node) => [node.id, node.degree])).toEqual([["a", 2], ["b", 2], ["c", 2]])
  })

  it("is 0 for a node with no links", () => {
    expect(mapGraph(nodes, []).nodes.map((node) => node.degree)).toEqual([0, 0, 0])
  })
})

describe("resolveTone", () => {
  it("is the default tone unless the prop says void", () => {
    expect(resolveTone(undefined)).toBe("default")
    expect(resolveTone("default")).toBe("default")
    expect(resolveTone("void")).toBe("void")
    expect(resolveTone("neon" as never)).toBe("default")
  })
})

describe("toneProfile", () => {
  it("keeps the default tone as it was: normal blending, hard disc, 2.6x sprite, 2 to 160 device px", () => {
    expect(toneProfile("default", 2)).toMatchObject({
      additive: false,
      softGlow: false,
      spriteFactor: 2.6,
      minSpritePx: 2,
      maxSpritePx: 160,
      baseEdgeOpacity: 0.2,
      activeEdgeOpacity: 0.85,
    })
  })

  it("makes void additive with a soft glow and no sprite padding factor", () => {
    const profile = toneProfile("void", 1)
    expect(profile.additive).toBe(true)
    expect(profile.softGlow).toBe(true)
    expect(profile.spriteFactor).toBe(1)
  })

  it("lays out as a spherical shell under void only; the default tone keeps its cloud layout", () => {
    expect(toneProfile("void", 1).shellLayout).toBe(true)
    expect(toneProfile("default", 1).shellLayout).toBe(false)
  })

  it("moves the camera in for the tighter shell, and leaves the default tone's framing alone", () => {
    expect(toneProfile("default", 1).cameraScale).toBe(1)
    expect(toneProfile("void", 1).cameraScale).toBeLessThan(1)
    expect(toneProfile("void", 1).cameraScale).toBeGreaterThan(0.5)
  })

  it("clamps void sprites to 3 to 20 CSS px, scaled to device pixels", () => {
    expect(toneProfile("void", 1)).toMatchObject({ minSpritePx: 3, maxSpritePx: 20 })
    expect(toneProfile("void", 2)).toMatchObject({ minSpritePx: 6, maxSpritePx: 40 })
  })
})

describe("nodeSpriteSize", () => {
  const plain = { radius: 1.8, degree: 0 }

  it("leaves the default tone at the node diameter whatever the degree", () => {
    expect(nodeSpriteSize(plain, "default")).toBe(3.6)
    expect(nodeSpriteSize({ radius: 1.8, degree: 40 }, "default")).toBe(3.6)
  })

  it("makes void sprites smaller than the default for a node with no links", () => {
    expect(nodeSpriteSize(plain, "void")).toBeLessThan(nodeSpriteSize(plain, "default"))
  })

  it("grows a void sprite with the square root of the degree", () => {
    const base = nodeSpriteSize(plain, "void")
    const growth = (degree: number) => nodeSpriteSize({ radius: 1.8, degree }, "void") / base - 1
    expect(growth(16)).toBeCloseTo(growth(4) * 2)
    expect(growth(4)).toBeGreaterThan(0)
  })
})

describe("spritePixelDiameter", () => {
  // 800 px canvas, 50 degree field of view, camera 450 units out: the engine's usual orb view.
  const scale = 800 / (2 * Math.tan((50 * Math.PI) / 360))
  const px = (node: { radius: number; degree: number }, tone: "default" | "void", pixelRatio = 1) =>
    spritePixelDiameter(nodeSpriteSize(node, tone), scale, 450, pixelRatio, toneProfile(tone, pixelRatio))

  it("keeps void sprites inside 3 to 20 CSS px, from an unlinked small node to a huge hub", () => {
    expect(px({ radius: 0.9, degree: 0 }, "void")).toBeGreaterThanOrEqual(3)
    expect(px({ radius: 1.8, degree: 0 }, "void")).toBeLessThan(8)
    expect(px({ radius: 1.8, degree: 9 }, "void")).toBeGreaterThan(px({ radius: 1.8, degree: 0 }, "void"))
    expect(px({ radius: 7, degree: 400 }, "void")).toBe(20)
  })

  it("scales the void clamp with the device pixel ratio", () => {
    expect(px({ radius: 7, degree: 400 }, "void", 2)).toBe(40)
  })

  it("does not change the default tone: the old 2.6x sprite, clamped 2 to 160", () => {
    const old = (2 * 1.8 * 2.6 * scale) / 450
    expect(px({ radius: 1.8, degree: 0 }, "default")).toBeCloseTo(old)
    expect(px({ radius: 1.8, degree: 0 }, "default")).toBeGreaterThan(15)
  })
})

describe("VOID_SURFACE_BACKGROUND", () => {
  it("is a dark gradient built from theme tokens, with no literal colour", () => {
    expect(VOID_SURFACE_BACKGROUND).toMatch(/^linear-gradient\(/)
    expect(VOID_SURFACE_BACKGROUND).toMatch(/var\(--[a-z0-9-]+\)/)
    expect(VOID_SURFACE_BACKGROUND).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i)
  })
})

// Per-node heat (design-system#181): a 0-1 value that sets how bright, how large and how
// saturated a node is. A graph with no heat draws exactly as it did before.
describe("mapGraph heat", () => {
  const heated = (heat: number | undefined) => mapGraph([{ id: "a", label: "A", group: "g", heat }], []).nodes[0]!

  it("carries heat through, clamped to 0-1", () => {
    expect(heated(0.4).heat).toBe(0.4)
    expect(heated(0).heat).toBe(0)
    expect(heated(3).heat).toBe(1)
    expect(heated(-2).heat).toBe(0)
  })

  it("leaves heat off the node when it is missing or not a finite number", () => {
    for (const heat of [undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect("heat" in heated(heat)).toBe(false)
    }
  })
})

describe("heatBrightness", () => {
  it("is full brightness when a node has no heat, so an unheated graph is unchanged", () => {
    expect(heatBrightness(undefined)).toBe(1)
  })

  it("runs from the floor at heat 0 to full at heat 1, rising in between", () => {
    expect(heatBrightness(0)).toBeCloseTo(HEAT_FLOOR)
    expect(heatBrightness(1)).toBeCloseTo(1)
    expect(heatBrightness(0.25)).toBeLessThan(heatBrightness(0.5))
    expect(heatBrightness(0.5)).toBeLessThan(heatBrightness(0.75))
  })

  it("keeps a cold node visible: the floor is well above zero", () => {
    expect(HEAT_FLOOR).toBeGreaterThan(0.3)
    expect(HEAT_FLOOR).toBeLessThan(0.6)
  })
})

describe("heatSizeScale", () => {
  it("is 1 for a node with no heat", () => {
    expect(heatSizeScale(undefined)).toBe(1)
  })

  it("shrinks a cold node and grows a hot one", () => {
    expect(heatSizeScale(0)).toBeLessThan(1)
    expect(heatSizeScale(1)).toBeGreaterThan(1)
    expect(heatSizeScale(0.2)).toBeLessThan(heatSizeScale(0.8))
  })
})

describe("heatColour", () => {
  const red = [0.9, 0.2, 0.1] as const
  const spread = (colour: readonly number[]) => Math.max(...colour) - Math.min(...colour)
  const luma = (colour: readonly number[]) => 0.2126 * colour[0]! + 0.7152 * colour[1]! + 0.0722 * colour[2]!

  it("returns the group colour untouched with no heat, and at full heat", () => {
    expect(heatColour(red, undefined)).toEqual(red)
    for (const [index, channel] of heatColour(red, 1).entries()) expect(channel).toBeCloseTo(red[index]!)
  })

  it("desaturates a cold node toward grey but keeps its hue and luminance", () => {
    const cold = heatColour(red, 0)
    expect(spread(cold)).toBeLessThan(spread(red))
    expect(spread(cold)).toBeGreaterThan(0)
    expect(luma(cold)).toBeCloseTo(luma(red))
    expect(cold[0]).toBeGreaterThan(cold[1]!)
    expect(cold[1]).toBeGreaterThan(cold[2]!)
  })

  it("saturates more as heat rises", () => {
    expect(spread(heatColour(red, 0.2))).toBeLessThan(spread(heatColour(red, 0.7)))
  })
})

describe("nodeSpriteSize with heat", () => {
  const base = { radius: 1.8, degree: 4 }

  it("is unchanged when the node has no heat, in both tones", () => {
    expect(nodeSpriteSize(base, "default")).toBe(3.6)
    expect(nodeSpriteSize({ ...base, heat: undefined }, "void")).toBe(nodeSpriteSize(base, "void"))
  })

  it("draws a hot node larger than a cold one", () => {
    for (const tone of ["default", "void"] as const) {
      expect(nodeSpriteSize({ ...base, heat: 1 }, tone)).toBeGreaterThan(nodeSpriteSize({ ...base, heat: 0 }, tone))
    }
  })
})

// The spherical shell layout (design-system#181). A stronger forceRadial alone left the
// cloud lumpy (radial spread 0.12 of the mean even at strength 1, reaching 1.3R), so under
// tone="void" nodes are pulled to shells between 0.4R and 1.0R and snapped there on settle.
describe("shellRadii", () => {
  const outer = 100

  it("spreads ranks from the inner shell to the outer radius, nearest the centre first", () => {
    const radii = shellRadii([5, 80, 20, 300, 41], outer)
    expect(Math.min(...radii)).toBeCloseTo(outer * SHELL_INNER_FRACTION)
    expect(Math.max(...radii)).toBeCloseTo(outer)
    expect(radii[0]).toBeLessThan(radii[2]!)
    expect(radii[2]).toBeLessThan(radii[4]!)
    expect(radii[4]).toBeLessThan(radii[1]!)
    expect(radii[1]).toBeLessThan(radii[3]!)
  })

  it("keeps every node inside the band whatever the input distances", () => {
    const distances = Array.from({ length: 500 }, (_, index) => (index * 7919) % 1000)
    for (const radius of shellRadii(distances, outer)) {
      expect(radius).toBeGreaterThanOrEqual(outer * SHELL_INNER_FRACTION - 1e-9)
      expect(radius).toBeLessThanOrEqual(outer + 1e-9)
    }
  })

  it("fills the ball evenly by volume, so the median node sits near the cube-root midpoint", () => {
    const sorted = [...shellRadii(Array.from({ length: 1001 }, (_, index) => index), outer)].sort((a, b) => a - b)
    const expected = outer * Math.cbrt((SHELL_INNER_FRACTION ** 3 + 1) / 2)
    expect(sorted[500]).toBeCloseTo(expected, 0)
  })

  it("handles no nodes and a single node", () => {
    expect(shellRadii([], outer)).toHaveLength(0)
    expect(shellRadii([12], outer)[0]).toBeCloseTo(outer)
  })

  it("gives tied distances different shells deterministically, by index", () => {
    const radii = shellRadii([3, 3, 3], outer)
    expect(radii[0]).toBeLessThan(radii[1]!)
    expect(radii[1]).toBeLessThan(radii[2]!)
  })
})

describe("fibonacciDirection", () => {
  it("returns unit vectors, all different", () => {
    const seen = new Set<string>()
    for (let index = 0; index < 50; index++) {
      const [x, y, z] = fibonacciDirection(index, 50)
      expect(Math.hypot(x, y, z)).toBeCloseTo(1)
      seen.add([x, y, z].map((value) => value.toFixed(4)).join(","))
    }
    expect(seen.size).toBe(50)
  })

  it("is finite for a single node", () => {
    expect(fibonacciDirection(0, 1).every(Number.isFinite)).toBe(true)
  })
})

describe("snapToShells", () => {
  const outer = 120
  const distanceOf = (node: { x: number; y: number; z: number }) => Math.hypot(node.x, node.y, node.z)

  it("moves each node along its own direction from the centre, and keeps its rank order", () => {
    const nodes = [
      { x: 10, y: 0, z: 0 },
      { x: 0, y: 40, z: 0 },
      { x: 0, y: 0, z: 400 },
    ]
    snapToShells(nodes, outer)
    expect(nodes[0]!.x).toBeGreaterThan(0)
    expect(nodes[0]!.y).toBeCloseTo(0)
    expect(nodes[1]!.y).toBeGreaterThan(0)
    expect(nodes[2]!.z).toBeGreaterThan(0)
    expect(distanceOf(nodes[0]!)).toBeCloseTo(outer * SHELL_INNER_FRACTION)
    expect(distanceOf(nodes[2]!)).toBeCloseTo(outer)
    expect(distanceOf(nodes[0]!)).toBeLessThan(distanceOf(nodes[1]!))
    expect(distanceOf(nodes[1]!)).toBeLessThan(distanceOf(nodes[2]!))
  })

  it("places nodes stacked on the centre on distinct directions instead of leaving them there", () => {
    const nodes = Array.from({ length: 6 }, () => ({ x: 0, y: 0, z: 0 }))
    snapToShells(nodes, outer)
    expect(new Set(nodes.map((node) => [node.x, node.y, node.z].map((value) => value.toFixed(3)).join(","))).size).toBe(6)
    for (const node of nodes) expect(Number.isFinite(distanceOf(node))).toBe(true)
  })
})

describe("shellForce in a simulation", () => {
  const { nodes, links } = sampleGraph(400, 169)
  const graph = mapGraph(nodes, links)
  const sphereRadius = 11 * Math.cbrt(graph.nodes.length)

  type Body = { x: number; y: number; z: number }
  const settle = (sphereForce: ReturnType<typeof shellForce> | ReturnType<typeof forceRadial>) => {
    const bodies: Body[] = graph.nodes.map(() => ({ x: Number.NaN, y: Number.NaN, z: Number.NaN }))
    const simulation = forceSimulation(bodies, 3)
      .alphaDecay(0.035)
      .velocityDecay(0.35)
      .force("link", forceLink(graph.links.map(({ source, target }) => ({ source, target }))).distance(10))
      .force("charge", forceManyBody().strength(-26).distanceMax(sphereRadius * 1.2).theta(1))
      .force("centre", forceCenter(0, 0, 0))
      .force("sphere", sphereForce)
      .stop()
    while (simulation.alpha() >= simulation.alphaMin()) simulation.tick()
    return bodies
  }
  const outline = (bodies: Body[]) => Math.max(...bodies.map((body) => Math.hypot(body.x, body.y, body.z))) / sphereRadius

  it("settles with a clean outline: nothing strays far past the outer radius, unlike the radial force it replaces", () => {
    const cloud = settle(forceRadial(sphereRadius, 0, 0, 0).strength(0.12))
    const shells = settle(shellForce(sphereRadius))
    expect(outline(cloud)).toBeGreaterThan(1.4)
    expect(outline(shells)).toBeLessThan(1.2)
  })

  it("already sits near its shells before the final snap, so the snap does not jump", () => {
    const bodies = settle(shellForce(sphereRadius))
    const before = bodies.map((body) => ({ ...body }))
    snapToShells(bodies, sphereRadius)
    const moved = bodies.map((body, index) => Math.hypot(body.x - before[index]!.x, body.y - before[index]!.y, body.z - before[index]!.z))
    const mean = moved.reduce((sum, distance) => sum + distance, 0) / moved.length
    expect(mean).toBeLessThan(sphereRadius * 0.1)
  })

  it("ends with every node between 0.4R and 1.0R after the snap", () => {
    const bodies = settle(shellForce(sphereRadius))
    snapToShells(bodies, sphereRadius)
    for (const body of bodies) {
      const radius = Math.hypot(body.x, body.y, body.z)
      expect(radius).toBeGreaterThanOrEqual(sphereRadius * SHELL_INNER_FRACTION - 1e-6)
      expect(radius).toBeLessThanOrEqual(sphereRadius + 1e-6)
    }
  })
})

describe("atmosphere gating", () => {
  it("is part of the void profile only", () => {
    expect(toneProfile("void", 1).atmosphere).toBe(true)
    expect(toneProfile("default", 1).atmosphere).toBe(false)
  })

  it("draws nothing extra and moves nothing under the default tone", () => {
    expect(resolveAtmosphere(toneProfile("default", 1), false)).toEqual({ membrane: false, motes: false, motion: false })
  })

  it("draws the membrane, the motes and the motion under void", () => {
    expect(resolveAtmosphere(toneProfile("void", 1), false)).toEqual({ membrane: true, motes: true, motion: true })
  })

  it("keeps only the still membrane under reduced motion: no motes, no motion", () => {
    expect(resolveAtmosphere(toneProfile("void", 1), true)).toEqual({ membrane: true, motes: false, motion: false })
  })

  it("holds the spec's numbers: membrane at 1.04R, rim alpha 0.3, 1,000 motes between 1.15R and 2.25R", () => {
    expect(ATMOSPHERE.membraneRadius).toBe(1.04)
    expect(ATMOSPHERE.rimAlpha).toBe(0.3)
    expect(ATMOSPHERE.moteCount).toBe(1000)
    expect([ATMOSPHERE.moteInner, ATMOSPHERE.moteOuter]).toEqual([1.15, 2.25])
  })
})

describe("moteField", () => {
  const radius = 100
  const field = moteField(ATMOSPHERE.moteCount, radius)
  const distance = (index: number) =>
    Math.hypot(field.positions[index * 3]!, field.positions[index * 3 + 1]!, field.positions[index * 3 + 2]!)

  it("returns one position triple and one phase per mote", () => {
    expect(field.positions).toHaveLength(ATMOSPHERE.moteCount * 3)
    expect(field.phases).toHaveLength(ATMOSPHERE.moteCount)
  })

  it("keeps every mote between 1.15R and 2.25R", () => {
    for (let index = 0; index < ATMOSPHERE.moteCount; index++) {
      expect(distance(index)).toBeGreaterThanOrEqual(radius * ATMOSPHERE.moteInner - 1e-3)
      expect(distance(index)).toBeLessThanOrEqual(radius * ATMOSPHERE.moteOuter + 1e-3)
    }
  })

  it("fills the shell evenly by volume, not bunched at the inner edge", () => {
    const innerVolume = ATMOSPHERE.moteInner ** 3
    const outerVolume = ATMOSPHERE.moteOuter ** 3
    const halfway = Math.cbrt((innerVolume + outerVolume) / 2) * radius
    const inside = Array.from({ length: ATMOSPHERE.moteCount }, (_, index) => distance(index)).filter((value) => value < halfway).length
    expect(inside / ATMOSPHERE.moteCount).toBeGreaterThan(0.4)
    expect(inside / ATMOSPHERE.moteCount).toBeLessThan(0.6)
  })

  it("is the same field every time, so a rebuild does not reshuffle the dust", () => {
    expect(Array.from(moteField(50, radius).positions)).toEqual(Array.from(moteField(50, radius).positions))
  })

  it("spreads over every direction rather than one hemisphere", () => {
    const mean = [0, 1, 2].map((axis) => {
      let sum = 0
      for (let index = 0; index < ATMOSPHERE.moteCount; index++) sum += field.positions[index * 3 + axis]! / distance(index)
      return sum / ATMOSPHERE.moteCount
    })
    for (const value of mean) expect(Math.abs(value)).toBeLessThan(0.1)
  })

  it("returns an empty field for no motes", () => {
    expect(moteField(0, radius).positions).toHaveLength(0)
  })
})

describe("nodePhase", () => {
  it("is deterministic and inside one turn", () => {
    for (const index of [0, 1, 2, 500, 1486]) {
      expect(nodePhase(index)).toBe(nodePhase(index))
      expect(nodePhase(index)).toBeGreaterThanOrEqual(0)
      expect(nodePhase(index)).toBeLessThan(Math.PI * 2)
    }
  })

  it("gives neighbouring nodes different phases, so they do not pulse in step", () => {
    expect(new Set(Array.from({ length: 200 }, (_, index) => nodePhase(index).toFixed(6))).size).toBe(200)
    expect(Math.abs(nodePhase(1) - nodePhase(0))).toBeGreaterThan(0.5)
  })
})

describe("breathScale", () => {
  const samples = Array.from({ length: 4000 }, (_, step) => breathScale(step * 0.5))

  it("stays within about 1% of full size", () => {
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0.99)
    expect(Math.max(...samples)).toBeLessThanOrEqual(1.01)
  })

  it("moves, in both directions, so it reads as breathing", () => {
    expect(Math.max(...samples)).toBeGreaterThan(1.005)
    expect(Math.min(...samples)).toBeLessThan(0.995)
  })

  it("is the same size at the same time", () => {
    expect(breathScale(12.5)).toBe(breathScale(12.5))
  })

  it("is made of two sines, so its beat does not repeat on the first sine's period", () => {
    const first = 2 * Math.PI / MOTION.breathRates[0]
    expect(breathScale(first + 3)).not.toBeCloseTo(breathScale(3), 6)
  })
})

describe("precession", () => {
  it("turns the yaw steadily forward", () => {
    expect(precession(0).yaw).toBe(0)
    expect(precession(20).yaw).toBeGreaterThan(precession(10).yaw)
    expect(precession(30).yaw - precession(20).yaw).toBeCloseTo(precession(10).yaw - precession(0).yaw, 9)
  })

  it("tilts the pitch to and fro within its limit, so the view circles from changing angles", () => {
    const pitches = Array.from({ length: 2000 }, (_, step) => precession(step * 2).pitch)
    expect(Math.max(...pitches)).toBeLessThanOrEqual(MOTION.pitchTilt + 1e-9)
    expect(Math.min(...pitches)).toBeGreaterThanOrEqual(-MOTION.pitchTilt - 1e-9)
    expect(Math.max(...pitches)).toBeGreaterThan(MOTION.pitchTilt * 0.9)
    expect(Math.min(...pitches)).toBeLessThan(-MOTION.pitchTilt * 0.9)
  })

  it("is not a fixed axis: the pitch is not constant", () => {
    expect(precession(5).pitch).not.toBeCloseTo(precession(60).pitch, 3)
  })
})

describe("motionTarget", () => {
  it("is still while the pointer is on the orb or a node is hovered", () => {
    expect(motionTarget({ interacting: true, hovered: false, idleMs: 1e9 })).toBe(0)
    expect(motionTarget({ interacting: false, hovered: true, idleMs: 1e9 })).toBe(0)
  })

  it("stays still until the idle time has passed, then moves", () => {
    expect(motionTarget({ interacting: false, hovered: false, idleMs: 0 })).toBe(0)
    expect(motionTarget({ interacting: false, hovered: false, idleMs: MOTION.idleMs - 1 })).toBe(0)
    expect(motionTarget({ interacting: false, hovered: false, idleMs: MOTION.idleMs })).toBe(1)
  })
})

describe("stepMotionRate", () => {
  it("does not move on a zero step", () => {
    expect(stepMotionRate(0.3, 1, 0)).toBe(0.3)
  })

  it("eases toward its target without overshooting", () => {
    let rate = 0
    let previous = 0
    for (let step = 0; step < 600; step++) {
      rate = stepMotionRate(rate, 1, 16)
      expect(rate).toBeGreaterThanOrEqual(previous)
      expect(rate).toBeLessThanOrEqual(1)
      previous = rate
    }
    expect(rate).toBeGreaterThan(0.99)
  })

  it("is not an instant jump: one frame covers a small share of the way", () => {
    expect(stepMotionRate(0, 1, 16)).toBeLessThan(0.05)
  })

  it("eases back down to still when the target drops", () => {
    let rate = 1
    for (let step = 0; step < 600; step++) rate = stepMotionRate(rate, 0, 16)
    expect(rate).toBeLessThan(0.01)
  })

  it("takes the same path at 30fps as at 60fps", () => {
    let fast = 0
    let slow = 0
    for (let step = 0; step < 120; step++) fast = stepMotionRate(fast, 1, 16)
    for (let step = 0; step < 60; step++) slow = stepMotionRate(slow, 1, 32)
    expect(slow).toBeCloseTo(fast, 6)
  })
})
