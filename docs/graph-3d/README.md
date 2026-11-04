# graph-3d

A 3D force-directed graph that reads as a slowly turning orb of small glowing
nodes joined by faint edges (design-system#169). First consumer: the ops hub
Memory map (argus#1047).

```bash
npx shadcn add deanjstone/design-system/graph-3d
```

```tsx
import { Graph3D } from "@/components/ui/graph-3d"

// Keep these arrays stable (module scope or useMemo): a new array rebuilds the layout.
<Graph3D
  nodes={nodes}            // { id, label, group, size? }
  links={links}            // { source, target, weight?, kind? }
  highlight={["memory-4"]} // ids; the rest dim, their links light up
  focusId="memory-4"       // glide the camera to a node picked elsewhere (a search result); a jump under reduced motion
  autoRotate               // default true, always off under prefers-reduced-motion
  tone="void"              // the orb look: its own dark gradient, additive soft glow (default: "default")
  onNodeClick={(node) => openMemory(node.id)}
  className="h-[32rem] border bg-card"
/>
```

The component fills its parent (`size-full`, `min-h-64`) and, with the default tone,
paints a transparent canvas, so the surface behind it is yours: `bg-card`, or
`bg-surface-1` for a permanently dark panel.

## Tone

`tone="default"` (the default) is unchanged: normal blending, a hard disc with a halo
and the page's own theme.

`tone="void"` is the orb look, built to sit on a dark surface in light and dark pages
alike:

- **Surface.** The component paints its own gradient, `--surface-0` rising to a deep
  blue mixed from `--chart-5`, so it needs no background class. It carries a `dark`
  class (and copies the page's `data-theme`), so group colours and edges read the dark
  values of the tokens even on a light page.
- **Light.** Nodes and links use additive blending, so overlaps sum toward white. A node
  is a soft point with no edge, a pale core fading out through `pow(1 - smoothstep, 1.8)`.
- **Size.** No 2.6x sprite padding. A sprite is clamped to 3 to 20 CSS px; hubs grow by
  `sqrt(degree)` (the count of kept links), so most nodes are specks and a few bloom.
- **Picking.** The hit radius follows the drawn sprite, not the node's size.

Changing `tone` rebuilds the layout, like changing `nodes`. Try it in the demo with
`?tone=void`.

| Default tone | `tone="void"` |
|---|---|
| ![default tone, dark page](../assets/graph-3d-void-before-default-dark.png) | ![void tone, dark page](../assets/graph-3d-void-after-dark.png) |

`tone="void"` on a light page: ![void tone, light page](../assets/graph-3d-void-after-light.png)

## Behaviour

- **Orbit, zoom, hover, click.** Drag to orbit, wheel or pinch to zoom, hover for a
  label tooltip, click to glide the camera to the node and call `onNodeClick` with
  your own node object. Auto-rotate pauses while a node is hovered.
- **Colour comes from tokens.** Each group takes `--chart-1` to `--chart-5` in
  sorted order, wrapping after five; edges use `--muted-foreground`, active edges
  `--foreground`. Pass `groupTokens={{ risk: "--destructive" }}` to pin a group to
  another token. Light, dark and every named theme work because the engine
  re-reads the tokens when the `html` element's class or attributes change.
- **Reduced motion.** Under `prefers-reduced-motion: reduce` nothing rotates, the
  camera jumps instead of gliding, damping is off, and the layout is computed
  unseen so the first thing painted is the settled graph. The page then draws
  nothing until you interact. The preference is read live: flipping it while the
  graph is mounted rebuilds it in the quiet mode.
- **Fallback.** Without WebGL the component renders a short message
  (`role="status"`) and logs the cause; the rest of the page is unaffected.

## Why three.js and d3-force-3d, not 3d-force-graph

`3d-force-graph` (and `react-force-graph-3d`) build one `Mesh` per node and one
object per link. At 1,300 nodes and 2,000 to 4,000 links that is thousands of draw
calls, which is what the 60fps goal rules out. Here the layout is
`d3-force-3d` (Barnes-Hut many-body, so a tick is near-linear) and drawing is two
draw calls: one `Points` object with a glow shader for the nodes and one
`LineSegments` for the edges. Picking projects the nodes to the screen instead of
raycasting sprites. It costs roughly 400 lines we own, but no per-node scene graph
and no dependency on a wrapper's release cadence.

## Bundle

`graph-3d.tsx` is small. `three` and `d3-force-3d` load through a dynamic
`import()` of `graph-3d-engine` the first time a graph mounts, so a bundler splits
them into their own chunk and a page without a graph never pays for them.

## Run the demo and the measurement

```bash
node docs/graph-3d/measure.mjs            # builds, opens one headless tab, prints JSON
node docs/graph-3d/measure.mjs --nodes 600
```

The demo (`docs/graph-3d/demo.tsx`) renders `sampleGraph(1300)`, a seeded graph
shaped like the CONTEXT vault (1,300 nodes, about 2,000 links, five groups). The
script builds it to a temporary directory, serves it for the run, drives one
Chromium tab, then removes everything; it never leaves a server running.
Add `?n=1300&theme=light&rotate=0` to the demo URL to change what it renders.

## Measured at 1,300 nodes and 2,010 links

`node docs/graph-3d/measure.mjs`, headless Chromium, one 1280x800 tab, on the
homelab host (no GPU, so WebGL is SwiftShader software rendering):

| | Result |
|---|---|
| Force layout settles in | 9.1 s, drawn live while it settles (the orb forms on screen) |
| Frame rate while settling | 21.6 fps, median frame 50 ms |
| Frame rate, settled and auto-rotating | 23.2 fps, median frame 50 ms |
| Main thread per frame while rotating | 0.57 ms in all tasks, 0.24 ms of it script |
| Hover tooltip, click to focus | works (the sweep finds a node, a click focuses it) |
| `prefers-reduced-motion: reduce` | `data-auto-rotate="false"`, two screenshots 1.5 s apart are byte-identical |

The 22 fps is the software rasteriser, not this code: the page's own work is about
0.6 ms a frame, which leaves room for far more than 60 fps, and a GPU draws two
draw calls of points and lines in well under a millisecond. Treat the frame rate
here as a floor measured without a GPU, and re-measure on the consuming device when
it matters. Screenshots: [dark](../assets/graph-3d-1300-dark.png),
[light](../assets/graph-3d-1300-light.png).

![graph-3d, 1,300 nodes, dark](../assets/graph-3d-1300-dark.png)
![graph-3d, 1,300 nodes, light](../assets/graph-3d-1300-light.png)
