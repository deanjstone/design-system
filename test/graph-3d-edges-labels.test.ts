// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  EDGE_TOKENS,
  LABELS,
  buildAdjacency,
  edgeTier,
  hotOrder,
  isZoomedIn,
  linkDrawOrder,
  mapGraph,
  placeLabels,
  strongestNeighbours,
  toneProfile,
} from "@/lib/graph-3d-core"
import { sampleGraph } from "../docs/graph-3d/sample"

// Edge styling and neighbour labels (design-system#183): the pure decisions behind the
// void tone's tinted edges, the top-8 hover and the DOM labels. The WebGL and DOM halves
// are proved in a real browser by docs/graph-3d/inspect.mjs.

describe("edgeTier", () => {
  it("reads a shared-topic kind as a topic edge, whatever the spelling", () => {
    expect(edgeTier("topic")).toBe("topic")
    expect(edgeTier("shared-topic")).toBe("topic")
    expect(edgeTier("Shared_Topic")).toBe("topic")
  })

  it("reads every other kind, and a link with no kind, as a link edge", () => {
    expect(edgeTier("link")).toBe("link")
    expect(edgeTier("wikilink")).toBe("link")
    expect(edgeTier(undefined)).toBe("link")
    expect(edgeTier("")).toBe("link")
  })
})

describe("EDGE_TOKENS", () => {
  it("tints a link and a topic edge from two different theme tokens", () => {
    expect(EDGE_TOKENS.link).toMatch(/^--/)
    expect(EDGE_TOKENS.topic).toMatch(/^--/)
    expect(EDGE_TOKENS.link).not.toBe(EDGE_TOKENS.topic)
  })
})

describe("toneProfile edge and label settings", () => {
  it("keeps the default tone as it was: one edge colour, every touching link on hover, no labels", () => {
    expect(toneProfile("default", 1)).toMatchObject({
      kindTint: false,
      hoverNeighbourLimit: Number.POSITIVE_INFINITY,
      labels: false,
    })
  })

  it("tints edges by kind, lights the top 8 neighbours on hover and draws labels under void", () => {
    const profile = toneProfile("void", 1)
    expect(profile.kindTint).toBe(true)
    expect(profile.hoverNeighbourLimit).toBe(8)
    expect(profile.labels).toBe(true)
  })

  it("keeps void's faint edges at 0.16 opacity, additive", () => {
    const profile = toneProfile("void", 1)
    expect(profile.baseEdgeOpacity).toBe(0.16)
    expect(profile.additive).toBe(true)
  })
})

describe("linkDrawOrder", () => {
  it("draws the strongest link first", () => {
    const order = linkDrawOrder([{ strength: 0.2 }, { strength: 1 }, { strength: 0.6 }])
    expect(order).toEqual([1, 2, 0])
  })

  it("keeps equal strengths in their given order, so the order is the same every time", () => {
    expect(linkDrawOrder([{ strength: 0.5 }, { strength: 1 }, { strength: 0.5 }, { strength: 1 }])).toEqual([1, 3, 0, 2])
  })

  it("is a permutation of every link, none dropped and none repeated", () => {
    const { nodes, links } = sampleGraph(200, 183)
    const mapped = mapGraph(nodes, links)
    const order = linkDrawOrder(mapped.links)
    expect(order).toHaveLength(mapped.links.length)
    expect(new Set(order).size).toBe(mapped.links.length)
    for (let position = 1; position < order.length; position++) {
      expect(mapped.links[order[position - 1]!]!.strength).toBeGreaterThanOrEqual(mapped.links[order[position]!]!.strength)
    }
  })

  it("returns nothing for no links", () => {
    expect(linkDrawOrder([])).toEqual([])
  })
})

describe("strongestNeighbours", () => {
  // A hub (0) with ten spokes of falling strength, a repeat link to node 1, and one link elsewhere.
  const hubGraph = () =>
    mapGraph(
      Array.from({ length: 12 }, (_, index) => ({ id: `n${index}`, label: `Node ${index}`, group: "g" })),
      [
        ...Array.from({ length: 10 }, (_, spoke) => ({ source: "n0", target: `n${spoke + 1}`, weight: 10 - spoke })),
        { source: "n1", target: "n0", weight: 1 },
        { source: "n11", target: "n2", weight: 4 },
      ],
    )

  it("returns the top 8 neighbours of a hub, strongest link first", () => {
    const graph = hubGraph()
    const adjacency = buildAdjacency(graph)
    const { nodes, links } = strongestNeighbours(adjacency, graph.links, 0, 8)
    expect(nodes).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(links).toHaveLength(8)
    expect(links.map((link) => graph.links[link]!.strength)).toEqual([1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3])
  })

  it("returns every neighbour when there are fewer than the limit", () => {
    const graph = hubGraph()
    const adjacency = buildAdjacency(graph)
    expect(strongestNeighbours(adjacency, graph.links, 11, 8).nodes).toEqual([2])
  })

  it("names the other end of each link, not the node itself", () => {
    const graph = hubGraph()
    const adjacency = buildAdjacency(graph)
    expect(strongestNeighbours(adjacency, graph.links, 3, 8).nodes).toEqual([0])
  })

  it("counts a neighbour once when two links join the same pair, and keeps the stronger link", () => {
    const graph = hubGraph()
    const adjacency = buildAdjacency(graph)
    const { nodes, links } = strongestNeighbours(adjacency, graph.links, 1, 8)
    expect(nodes).toEqual([0])
    expect(links).toHaveLength(1)
    expect(graph.links[links[0]!]!.strength).toBe(1)
  })

  it("breaks a tie in strength toward the better connected neighbour", () => {
    const graph = mapGraph(
      [
        { id: "centre", label: "Centre", group: "g" },
        { id: "quiet", label: "Quiet", group: "g" },
        { id: "busy", label: "Busy", group: "g" },
        { id: "x", label: "X", group: "g" },
        { id: "y", label: "Y", group: "g" },
      ],
      [
        { source: "centre", target: "quiet" },
        { source: "centre", target: "busy" },
        { source: "busy", target: "x" },
        { source: "busy", target: "y" },
      ],
    )
    const adjacency = buildAdjacency(graph)
    expect(strongestNeighbours(adjacency, graph.links, 0, 1).nodes).toEqual([2])
  })

  it("returns nothing for a node with no links, or an index that is not in the graph", () => {
    const graph = mapGraph([{ id: "lonely", label: "Lonely", group: "g" }], [])
    const adjacency = buildAdjacency(graph)
    expect(strongestNeighbours(adjacency, graph.links, 0, 8)).toEqual({ nodes: [], links: [] })
    expect(strongestNeighbours(adjacency, graph.links, 5, 8)).toEqual({ nodes: [], links: [] })
  })

  it("returns nothing at a limit of zero", () => {
    const graph = hubGraph()
    expect(strongestNeighbours(buildAdjacency(graph), graph.links, 0, 0)).toEqual({ nodes: [], links: [] })
  })

  it("with no limit (the default tone) returns every neighbour", () => {
    const graph = hubGraph()
    expect(strongestNeighbours(buildAdjacency(graph), graph.links, 0, Number.POSITIVE_INFINITY).nodes).toHaveLength(10)
  })
})

describe("hotOrder", () => {
  it("lists the hottest nodes first", () => {
    const graph = mapGraph(
      [
        { id: "a", label: "A", group: "g", heat: 0.2 },
        { id: "b", label: "B", group: "g", heat: 0.9 },
        { id: "c", label: "C", group: "g", heat: 0.5 },
      ],
      [],
    )
    expect(hotOrder(graph.nodes)).toEqual([1, 2, 0])
  })

  it("ranks a node with no heat last among nodes with heat, and by connections when heat is missing", () => {
    const graph = mapGraph(
      [
        { id: "a", label: "A", group: "g" },
        { id: "b", label: "B", group: "g" },
        { id: "c", label: "C", group: "g", heat: 0.1 },
      ],
      [{ source: "b", target: "c" }],
    )
    expect(hotOrder(graph.nodes)).toEqual([2, 1, 0])
  })

  it("breaks full ties by index, so the labels do not shuffle between frames", () => {
    const graph = mapGraph(
      [
        { id: "a", label: "A", group: "g" },
        { id: "b", label: "B", group: "g" },
        { id: "c", label: "C", group: "g" },
      ],
      [],
    )
    expect(hotOrder(graph.nodes)).toEqual([0, 1, 2])
  })
})

describe("isZoomedIn", () => {
  it("is true once the camera is inside about twice the orb's radius from its target", () => {
    expect(isZoomedIn(60, 120)).toBe(true)
    expect(isZoomedIn(LABELS.zoomedInRadii * 120 - 1, 120)).toBe(true)
  })

  it("is false at the starting view and anywhere farther out", () => {
    expect(isZoomedIn(2.9 * 120, 120)).toBe(false)
    expect(isZoomedIn(LABELS.zoomedInRadii * 120, 120)).toBe(false)
  })
})

describe("LABELS", () => {
  it("holds the spec's numbers: the top 8 neighbours on hover, about 40 hottest when zoomed in", () => {
    expect(LABELS.neighbours).toBe(8)
    expect(LABELS.hottest).toBe(40)
  })
})

describe("placeLabels", () => {
  const viewport = { width: 800, height: 600 }
  const candidate = (index: number, x: number, y: number, text = "Memory") => ({ index, x, y, text })

  it("keeps labels in priority order and drops any that would overlap one already placed", () => {
    const placed = placeLabels([candidate(1, 100, 100), candidate(2, 130, 104), candidate(3, 300, 300)], viewport, 10)
    expect(placed.map((label) => label.index)).toEqual([1, 3])
  })

  it("lets a lower-priority label through when it sits clear of the others", () => {
    const placed = placeLabels([candidate(1, 100, 100), candidate(2, 100, 140)], viewport, 10)
    expect(placed.map((label) => label.index)).toEqual([1, 2])
  })

  it("drops a label whose node is off the canvas", () => {
    const placed = placeLabels([candidate(1, -20, 100), candidate(2, 400, 700), candidate(3, 400, 300)], viewport, 10)
    expect(placed.map((label) => label.index)).toEqual([3])
  })

  it("flips a label to the node's left when it would run off the right edge", () => {
    const [label] = placeLabels([candidate(1, 790, 100, "A long label of a memory")], viewport, 10)
    expect(label!.left + label!.width).toBeLessThan(790)
    expect(label!.left + label!.width).toBeLessThanOrEqual(viewport.width)
  })

  it("drops a label that fits on neither side of its node", () => {
    expect(placeLabels([candidate(1, 40, 100, "x".repeat(200))], { width: 300, height: 600 }, 10)).toEqual([])
  })

  it("drops a node with no position (behind the camera)", () => {
    expect(placeLabels([candidate(1, Number.NaN, Number.NaN)], viewport, 10)).toEqual([])
  })

  it("stops at the cap", () => {
    const row = Array.from({ length: 30 }, (_, step) => candidate(step, 20, 20 + step * 40))
    expect(placeLabels(row, viewport, 5)).toHaveLength(5)
  })

  it("returns each label's box so the caller can place it", () => {
    const [label] = placeLabels([candidate(7, 100, 100, "Alpha")], viewport, 10)
    expect(label).toMatchObject({ index: 7, text: "Alpha" })
    expect(label!.left).toBeGreaterThan(100)
    expect(label!.top).toBeLessThan(100)
  })

  it("gives a longer label a wider box", () => {
    const [short] = placeLabels([candidate(1, 100, 100, "Hi")], viewport, 10)
    const [long] = placeLabels([candidate(1, 100, 100, "A much longer label")], viewport, 10)
    expect(long!.width).toBeGreaterThan(short!.width)
  })
})
