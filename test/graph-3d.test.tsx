import * as React from "react"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Graph3D } from "@/components/ui/graph-3d"

// Component behaviour of graph-3d (design-system#169): how props reach the
// engine, and the reduced-motion path. The engine is replaced by a recorder
// because jsdom has no WebGL; docs/graph-3d/measure.mjs drives the real one.

const engine = vi.hoisted(() => ({
  create: vi.fn(),
  setHighlight: vi.fn(),
  setAutoRotate: vi.fn(),
  refreshTheme: vi.fn(),
  focusNode: vi.fn(),
  dispose: vi.fn(),
}))

vi.mock("@/lib/graph-3d-engine", () => ({
  createGraphEngine: (options: unknown) => {
    engine.create(options)
    return {
      setHighlight: engine.setHighlight,
      setAutoRotate: engine.setAutoRotate,
      refreshTheme: engine.refreshTheme,
      focusNode: engine.focusNode,
      dispose: engine.dispose,
    }
  },
}))

const nodes = [
  { id: "a", label: "Alpha", group: "tools" },
  { id: "b", label: "Beta", group: "memory", size: 3 },
]
const links = [{ source: "a", target: "b", weight: 2, kind: "wikilink" }]

function mockReducedMotion(reduce: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    get matches() {
      return reduce
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }
  vi.stubGlobal("matchMedia", (text: string) => (text.includes("prefers-reduced-motion") ? query : { ...query, matches: false }))
  return {
    set(next: boolean) {
      reduce = next
      listeners.forEach((listener) => listener())
    },
  }
}

const ready = () => waitFor(() => expect(engine.create).toHaveBeenCalled())
const lastOptions = () => engine.create.mock.lastCall![0] as Record<string, any>

beforeEach(() => {
  Object.values(engine).forEach((fn) => fn.mockClear())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Graph3D prop mapping", () => {
  it("hands the engine a mapped graph, the highlight indices and auto-rotate on by default", async () => {
    mockReducedMotion(false)
    render(<Graph3D nodes={nodes} links={links} highlight={["b", "ghost"]} />)
    await ready()
    const options = lastOptions()
    expect(options.graph.nodes.map((node: { id: string; token: string }) => [node.id, node.token])).toEqual([
      ["a", "--chart-2"],
      ["b", "--chart-1"],
    ])
    expect(options.graph.links).toEqual([{ source: 0, target: 1, strength: 1, kind: "wikilink" }])
    expect([...options.highlight]).toEqual([1])
    expect(options.autoRotate).toBe(true)
    expect(options.reducedMotion).toBe(false)
  })

  it("turns auto-rotate off when the prop says so", async () => {
    mockReducedMotion(false)
    render(<Graph3D nodes={nodes} links={links} autoRotate={false} />)
    await ready()
    expect(lastOptions().autoRotate).toBe(false)
    expect(screen.getByRole("img").getAttribute("data-auto-rotate")).toBe("false")
  })

  it("labels the graph for assistive tech", async () => {
    mockReducedMotion(false)
    render(<Graph3D nodes={nodes} links={links} />)
    await ready()
    expect(screen.getByRole("img", { name: "Graph of 2 nodes and 1 links" })).toBeTruthy()
  })

  it("applies a new highlight without rebuilding the layout", async () => {
    mockReducedMotion(false)
    const { rerender } = render(<Graph3D nodes={nodes} links={links} highlight={[]} />)
    await ready()
    engine.setHighlight.mockClear()
    rerender(<Graph3D nodes={nodes} links={links} highlight={["a"]} />)
    await waitFor(() => expect(engine.setHighlight).toHaveBeenCalled())
    expect([...engine.setHighlight.mock.lastCall![0]]).toEqual([0])
    expect(engine.create).toHaveBeenCalledTimes(1)
  })

  it("relays a node click to onNodeClick with the caller's own node object", async () => {
    mockReducedMotion(false)
    const onNodeClick = vi.fn()
    render(<Graph3D nodes={nodes} links={links} onNodeClick={onNodeClick} />)
    await ready()
    lastOptions().onNodeClick(lastOptions().graph.nodes[1])
    expect(onNodeClick).toHaveBeenCalledWith(nodes[1])
  })

  it("shows the hovered node's label as a tooltip and clears it on leave", async () => {
    mockReducedMotion(false)
    render(<Graph3D nodes={nodes} links={links} />)
    await ready()
    act(() => {
      lastOptions().onHover({ node: lastOptions().graph.nodes[0], x: 40, y: 60 })
    })
    expect(screen.getByRole("tooltip").textContent).toContain("Alpha")
    act(() => {
      lastOptions().onHover(null)
    })
    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})

describe("Graph3D void labels", () => {
  it("leaves the hovered node's label to the engine's label layer: no tooltip under tone void", async () => {
    mockReducedMotion(false)
    render(<Graph3D nodes={nodes} links={links} tone="void" />)
    await ready()
    act(() => {
      lastOptions().onHover({ node: lastOptions().graph.nodes[0], x: 40, y: 60 })
    })
    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})

describe("Graph3D reduced motion", () => {
  it("never auto-rotates, even when autoRotate is true, and tells the engine", async () => {
    mockReducedMotion(true)
    render(<Graph3D nodes={nodes} links={links} autoRotate />)
    await ready()
    const options = lastOptions()
    expect(options.autoRotate).toBe(false)
    expect(options.reducedMotion).toBe(true)
    expect(screen.getByRole("img").getAttribute("data-reduced-motion")).toBe("true")
    expect(screen.getByRole("img").getAttribute("data-auto-rotate")).toBe("false")
  })

  it("stops rotation when the preference flips on while mounted", async () => {
    const media = mockReducedMotion(false)
    render(<Graph3D nodes={nodes} links={links} />)
    await ready()
    expect(lastOptions().autoRotate).toBe(true)
    act(() => media.set(true))
    await waitFor(() => expect(engine.dispose).toHaveBeenCalled())
    await waitFor(() => expect(engine.create).toHaveBeenCalledTimes(2))
    expect(lastOptions().autoRotate).toBe(false)
    expect(lastOptions().reducedMotion).toBe(true)
  })
})

describe("Graph3D lifecycle", () => {
  it("shows a fallback message when WebGL cannot start", async () => {
    mockReducedMotion(false)
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
    engine.create.mockImplementationOnce(() => {
      throw new Error("no webgl")
    })
    render(<Graph3D nodes={nodes} links={links} />)
    expect((await screen.findByRole("status")).textContent).toContain("3D view unavailable")
    expect(screen.getByRole("img").getAttribute("data-state")).toBe("error")
    quiet.mockRestore()
  })

  it("disposes the engine on unmount", async () => {
    mockReducedMotion(false)
    const { unmount } = render(<Graph3D nodes={nodes} links={links} />)
    await ready()
    unmount()
    expect(engine.dispose).toHaveBeenCalledTimes(1)
  })
})

describe("Graph3D focusId", () => {
  it("glides the camera to the node once the engine is ready", async () => {
    mockReducedMotion(false)
    render(<Graph3D nodes={nodes} links={links} focusId="b" />)
    await ready()
    await waitFor(() => expect(engine.focusNode).toHaveBeenCalledWith(1))
    expect(engine.create).toHaveBeenCalledTimes(1)
  })

  it("moves to the new node when focusId changes, without rebuilding the layout", async () => {
    mockReducedMotion(false)
    const { rerender } = render(<Graph3D nodes={nodes} links={links} focusId="a" />)
    await waitFor(() => expect(engine.focusNode).toHaveBeenCalledWith(0))
    rerender(<Graph3D nodes={nodes} links={links} focusId="b" />)
    await waitFor(() => expect(engine.focusNode).toHaveBeenLastCalledWith(1))
    expect(engine.focusNode).toHaveBeenCalledTimes(2)
    expect(engine.create).toHaveBeenCalledTimes(1)
  })

  it("does nothing for an id that is not in the graph, or when unset", async () => {
    mockReducedMotion(false)
    const { rerender } = render(<Graph3D nodes={nodes} links={links} focusId="ghost" />)
    await ready()
    rerender(<Graph3D nodes={nodes} links={links} />)
    expect(engine.focusNode).not.toHaveBeenCalled()
  })

  it("still focuses under reduced motion, and tells the engine to jump instead of glide", async () => {
    mockReducedMotion(true)
    render(<Graph3D nodes={nodes} links={links} focusId="a" />)
    await ready()
    await waitFor(() => expect(engine.focusNode).toHaveBeenCalledWith(0))
    expect(lastOptions().reducedMotion).toBe(true)
  })

  it("does not refocus when an unrelated prop changes", async () => {
    mockReducedMotion(false)
    const { rerender } = render(<Graph3D nodes={nodes} links={links} focusId="a" />)
    await waitFor(() => expect(engine.focusNode).toHaveBeenCalledTimes(1))
    rerender(<Graph3D nodes={nodes} links={links} focusId="a" highlight={["b"]} />)
    await waitFor(() => expect(engine.setHighlight).toHaveBeenCalled())
    expect(engine.focusNode).toHaveBeenCalledTimes(1)
  })
})

describe("Graph3D tone", () => {
  it("is the default tone unless asked: no surface of its own, no forced theme, and the engine is told", async () => {
    mockReducedMotion(false)
    render(<Graph3D nodes={nodes} links={links} />)
    await ready()
    const root = screen.getByRole("img")
    expect(root.getAttribute("data-tone")).toBe("default")
    expect(root.classList.contains("dark")).toBe(false)
    expect(root.getAttribute("style") ?? "").not.toContain("gradient")
    expect(lastOptions().tone).toBe("default")
  })

  it("paints its own dark token gradient under tone=void, whatever the page theme", async () => {
    mockReducedMotion(false)
    render(<Graph3D nodes={nodes} links={links} tone="void" />)
    await ready()
    const root = screen.getByRole("img")
    expect(root.getAttribute("data-tone")).toBe("void")
    expect(root.classList.contains("dark")).toBe(true)
    expect(root.getAttribute("style") ?? "").toContain("linear-gradient")
    expect(lastOptions().tone).toBe("void")
  })

  it("carries the page's named theme onto the void surface so the dark palette of that theme applies", async () => {
    mockReducedMotion(false)
    document.documentElement.setAttribute("data-theme", "ember")
    try {
      render(<Graph3D nodes={nodes} links={links} tone="void" />)
      await ready()
      expect(screen.getByRole("img").getAttribute("data-theme")).toBe("ember")
      act(() => document.documentElement.setAttribute("data-theme", "iris"))
      await waitFor(() => expect(screen.getByRole("img").getAttribute("data-theme")).toBe("iris"))
      expect(engine.refreshTheme).toHaveBeenCalled()
    } finally {
      document.documentElement.removeAttribute("data-theme")
    }
  })

  it("rebuilds the engine when the tone changes, and keeps a caller's className", async () => {
    mockReducedMotion(false)
    const { rerender } = render(<Graph3D nodes={nodes} links={links} className="h-96" />)
    await ready()
    rerender(<Graph3D nodes={nodes} links={links} className="h-96" tone="void" />)
    await waitFor(() => expect(engine.create).toHaveBeenCalledTimes(2))
    expect(lastOptions().tone).toBe("void")
    expect(screen.getByRole("img").classList.contains("h-96")).toBe(true)
  })
})
