// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  GROUP_TOKENS,
  HEAT_FLOOR,
  easeInOutCubic,
  heatBrightness,
  heatColour,
  heatSizeScale,
  mapGraph,
  parseCssColor,
  nodeSpriteSize,
  pickNearest,
  resolveAutoRotate,
  resolveFocus,
  resolveHighlight,
  resolveTone,
  spritePixelDiameter,
  toneProfile,
  VOID_SURFACE_BACKGROUND,
} from "@/lib/graph-3d-core"

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
