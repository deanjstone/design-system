// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  GROUP_TOKENS,
  easeInOutCubic,
  mapGraph,
  parseCssColor,
  pickNearest,
  resolveAutoRotate,
  resolveHighlight,
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
