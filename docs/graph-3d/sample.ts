// Seeded sample graph for the graph-3d demo and its frame-rate measurement
// (design-system#169). Shaped like the CONTEXT vault the first consumer maps:
// about 1,274 memories and 1,994 [[links]], so ~1.56 links per node, mostly
// within a topic, with a few hubs. Deterministic: the same seed gives the same graph.
import type { Graph3DLink, Graph3DNode } from "../../registry/lib/graph-3d-core"

const GROUPS = ["argus", "homelab", "tools", "workflow", "reference"] as const

// mulberry32: a tiny seeded PRNG, so the demo and the measurement agree.
function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export function sampleGraph(nodeCount = 1300, seed = 169): { nodes: Graph3DNode[]; links: Graph3DLink[] } {
  const random = seededRandom(seed)
  const nodes: Graph3DNode[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `memory-${index}`,
    label: `Memory ${index + 1}`,
    group: GROUPS[Math.floor(random() * GROUPS.length)],
    size: 1,
  }))

  // Preferential attachment: every endpoint is pushed onto `stubs`, so busy nodes
  // keep attracting links and a few hubs emerge.
  const stubs: number[] = []
  const byGroup = new Map<string, number[]>()
  const links: Graph3DLink[] = []
  const degree = new Array<number>(nodeCount).fill(0)
  const seen = new Set<string>()

  const connect = (from: number, to: number, kind: string) => {
    if (from === to) return
    const key = from < to ? `${from}:${to}` : `${to}:${from}`
    if (seen.has(key)) return
    seen.add(key)
    links.push({ source: nodes[from].id, target: nodes[to].id, kind, weight: kind === "wikilink" ? 2 : 1 })
    degree[from]++
    degree[to]++
    stubs.push(from, to)
  }

  nodes.forEach((node, index) => {
    const siblings = byGroup.get(node.group) ?? []
    if (index > 0) {
      const wanted = 1 + (random() < 0.56 ? 1 : 0)
      for (let attempt = 0; attempt < wanted; attempt++) {
        const sameTopic = siblings.length > 0 && random() < 0.8
        const pool = sameTopic ? siblings : stubs.length > 0 ? stubs : [0]
        connect(index, pool[Math.floor(random() * pool.length)], sameTopic ? "wikilink" : "shared-topic")
      }
    }
    siblings.push(index)
    byGroup.set(node.group, siblings)
  })

  // Heat follows the square root of the link count, as the memory map's will: a few
  // foundational notes run hot and most stay cool.
  const busiest = Math.max(1, ...degree)
  nodes.forEach((node, index) => {
    node.size = 1 + Math.min(6, degree[index] / 3)
    node.heat = Math.sqrt(degree[index] / busiest)
  })
  return { nodes, links }
}
