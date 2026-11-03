import * as React from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Graph3D, type Graph3DNode } from "@/components/ui/graph-3d"
import { sampleGraph } from "./sample"

// Query: ?n=1300 nodes, ?seed=169, ?theme=dark|light, ?rotate=0 to stop rotation.
const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get("n") ?? 1300)
const seed = Number(params.get("seed") ?? 169)
document.documentElement.classList.toggle("dark", params.get("theme") !== "light")

function Demo() {
  const { nodes, links } = React.useMemo(() => sampleGraph(nodeCount, seed), [])
  const groups = React.useMemo(() => [...new Set(nodes.map((node) => node.group))].sort(), [nodes])
  const [highlightGroup, setHighlightGroup] = React.useState<string | null>(null)
  const [clicked, setClicked] = React.useState<Graph3DNode | null>(null)
  const highlight = React.useMemo(
    () => (highlightGroup ? nodes.filter((node) => node.group === highlightGroup).map((node) => node.id) : []),
    [nodes, highlightGroup],
  )

  return (
    <main className="flex h-dvh flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-lg font-medium">graph-3d</h1>
        <Badge variant="secondary">{nodes.length} nodes</Badge>
        <Badge variant="secondary">{links.length} links</Badge>
        {groups.map((group) => (
          <Button
            key={group}
            size="sm"
            variant={highlightGroup === group ? "default" : "outline"}
            onClick={() => setHighlightGroup(highlightGroup === group ? null : group)}
          >
            {group}
          </Button>
        ))}
        <span data-testid="clicked" className="ml-auto text-sm text-muted-foreground">
          {clicked ? `Focused: ${clicked.label}` : "Click a node to focus it"}
        </span>
      </header>
      <Graph3D
        nodes={nodes}
        links={links}
        highlight={highlight}
        autoRotate={params.get("rotate") !== "0"}
        onNodeClick={setClicked}
        className="min-h-0 flex-1 border border-border bg-card"
      />
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<Demo />)
