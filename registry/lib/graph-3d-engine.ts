// The WebGL half of `graph-3d`: a d3-force-3d layout drawn with three.js as two
// draw calls (one Points object for nodes, one LineSegments for links) rather
// than a mesh per node, which is what keeps ~1,300 nodes and ~4,000 links smooth.
// graph-3d.tsx imports this lazily, so three.js stays out of the first bundle.

import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { forceCenter, forceLink, forceManyBody, forceRadial, forceSimulation } from "d3-force-3d"
import type { SimulationNode } from "d3-force-3d"

import {
  ATMOSPHERE,
  EDGE_TOKENS,
  LABELS,
  MOTION,
  breathScale,
  buildAdjacency,
  easeInOutCubic,
  edgeTier,
  heatBrightness,
  heatColour,
  heatSizeScale,
  hotOrder,
  isZoomedIn,
  linkDrawOrder,
  moteField,
  motionTarget,
  nodePhase,
  nodeSpriteSize,
  parseCssColor,
  pickNearest,
  placeLabels,
  precession,
  resolveAtmosphere,
  resolveTone,
  shellForce,
  snapToShells,
  spritePixelDiameter,
  stepMotionRate,
  strongestNeighbours,
  toneProfile,
  type Graph3DTone,
  type MappedGraph,
  type MappedNode,
  type Rgb,
} from "@/lib/graph-3d-core"

export type GraphHover = { node: MappedNode; x: number; y: number }

export type GraphEngineOptions = {
  container: HTMLElement
  graph: MappedGraph
  /** Defaults to "default". `void` draws additive soft-glow nodes and links for a dark surface. */
  tone?: Graph3DTone
  autoRotate: boolean
  reducedMotion: boolean
  highlight: ReadonlySet<number>
  onNodeClick?: (node: MappedNode) => void
  onHover?: (hover: GraphHover | null) => void
}

export type GraphEngine = {
  setAutoRotate(autoRotate: boolean): void
  setHighlight(highlight: ReadonlySet<number>): void
  refreshTheme(): void
  focusNode(index: number): void
  dispose(): void
}

const FIELD_OF_VIEW = 50
const FRAME_BUDGET_MS = 8
const FOCUS_MS = 650
const CLICK_SLOP_PX = 5
const DIMMED_ALPHA = 0.22
const BASE_ALPHA = 0.92
const ACTIVE_SCALE = 1.7

const nodeVertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  attribute float aMote;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uSpriteFactor;
  uniform float uMinPx;
  uniform float uMaxPx;
  uniform float uTime;
  uniform float uPulse;
  uniform float uPulseRate;
  uniform float uPulseDepth;
  uniform float uDrift;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // aMote is 0 for a node and a dust mote's diameter in CSS px otherwise: motes share this draw call.
    bool isMote = aMote > 0.0;
    vec3 home = position;
    if (isMote) {
      home += uDrift * vec3(sin(uTime * 0.06 + aPhase), sin(uTime * 0.047 + aPhase * 1.7), cos(uTime * 0.053 + aPhase * 2.3));
    }
    vec4 viewPosition = modelViewMatrix * vec4(home, 1.0);
    vColor = aColor;
    // A node's pulse dims it by up to uPulseDepth, each on its own phase; uPulse is 0 when nothing moves.
    float pulse = isMote ? 1.0 : 1.0 - uPulse * uPulseDepth * (0.5 - 0.5 * sin(uTime * uPulseRate + aPhase));
    vAlpha = aAlpha * pulse;
    // The default tone's sprite covers 2.6x the node diameter so the halo has room to fade out.
    gl_PointSize = isMote
      ? aMote * uPixelRatio
      : clamp(aSize * uSpriteFactor * uScale * uPixelRatio / -viewPosition.z, uMinPx, uMaxPx);
    gl_Position = projectionMatrix * viewPosition;
  }
`

const nodeFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float distanceFromCentre = length(gl_PointCoord - 0.5) * 2.0;
    float core = 1.0 - smoothstep(0.34, 0.40, distanceFromCentre);
    float halo = pow(1.0 - smoothstep(0.0, 1.0, distanceFromCentre), 2.4) * 0.6;
    float alpha = max(core, halo) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`

// Void tone: a point of light with no edge. The falloff and the pale core are written
// for this engine; additive blending sums overlapping nodes toward white.
const voidNodeFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float distanceFromCentre = length(gl_PointCoord - 0.5);
    float glow = pow(1.0 - smoothstep(0.0, 0.5, distanceFromCentre), 1.8);
    float core = pow(glow, 4.0);
    float alpha = glow * vAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.4), alpha);
  }
`

// One draw for every link: aTint is the link's own colour (its kind's token under void, the
// one edge colour otherwise), and aActive is 1 on both ends of a link that touches the hovered
// or highlighted node, which then takes the brighter colour and opacity.
const lineVertexShader = /* glsl */ `
  attribute vec3 aTint;
  attribute float aActive;
  varying vec3 vTint;
  varying float vActive;
  void main() {
    vTint = aTint;
    vActive = aActive;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const lineFragmentShader = /* glsl */ `
  uniform vec3 uActiveColor;
  uniform float uOpacity;
  uniform float uActiveOpacity;
  varying vec3 vTint;
  varying float vActive;
  void main() {
    gl_FragColor = vec4(mix(vTint, uActiveColor, vActive), mix(uOpacity, uActiveOpacity, vActive));
  }
`

// Void tone's membrane: a back-faced sphere just outside the outermost node, lit only at the
// rim (a fresnel term on the view angle) and tinted between two tokens that drift slowly.
const membraneVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vDirection;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-viewPosition.xyz);
    vDirection = normalize(position);
    gl_Position = projectionMatrix * viewPosition;
  }
`

const membraneFragmentShader = /* glsl */ `
  uniform vec3 uColourA;
  uniform vec3 uColourB;
  uniform float uTime;
  uniform float uAlpha;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vDirection;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);
    float drift = 0.5 + 0.5 * sin(uTime * 0.15 + vDirection.y * 2.0 + vDirection.x * 1.3);
    gl_FragColor = vec4(mix(uColourA, uColourB, drift), rim * uAlpha);
  }
`

// Tokens are CSS custom properties; their values are whatever the theme wrote.
// Fall back to the browser's own parse for syntax graph-3d-core does not read.
let colourProbe: CanvasRenderingContext2D | null | undefined
function resolveColour(value: string, fallback: Rgb): Rgb {
  const parsed = parseCssColor(value)
  if (parsed) return parsed
  if (!value.trim()) return fallback
  if (colourProbe === undefined) {
    colourProbe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
    if (colourProbe) {
      colourProbe.canvas.width = 1
      colourProbe.canvas.height = 1
    }
  }
  if (!colourProbe) return fallback
  colourProbe.clearRect(0, 0, 1, 1)
  colourProbe.fillStyle = "#000"
  colourProbe.fillStyle = value
  colourProbe.fillRect(0, 0, 1, 1)
  const [red = 0, green = 0, blue = 0, alpha = 0] = colourProbe.getImageData(0, 0, 1, 1).data
  return alpha === 0 ? fallback : [red / 255, green / 255, blue / 255]
}

type SimNode = SimulationNode

// Stands in for a link index that is out of range, which cannot happen: it is
// read only to satisfy noUncheckedIndexedAccess without a non-null assertion.
const NO_LINK = { source: 0, target: 0 } as const

export function createGraphEngine(options: GraphEngineOptions): GraphEngine {
  const { container, graph, onNodeClick, onHover } = options
  const tone = resolveTone(options.tone)
  const nodeCount = graph.nodes.length
  const linkCount = graph.links.length

  let reducedMotion = options.reducedMotion
  let highlight = options.highlight
  let hovered = -1
  let disposed = false
  let frameHandle = 0
  let renderRequested = true

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" })
  renderer.setClearColor(0x000000, 0)
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const profile = toneProfile(tone, pixelRatio)
  const blending = profile.additive ? THREE.AdditiveBlending : THREE.NormalBlending
  const atmosphere = resolveAtmosphere(profile, reducedMotion)
  renderer.setPixelRatio(pixelRatio)
  const canvas = renderer.domElement
  canvas.style.display = "block"
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  container.appendChild(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 6000)
  const sphereRadius = 11 * Math.cbrt(Math.max(nodeCount, 8))
  camera.position.set(0, sphereRadius * profile.cameraScale, sphereRadius * 3.6 * profile.cameraScale)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = !reducedMotion
  controls.dampingFactor = 0.08
  // With motion on, the orb itself precesses (see applyMotion) and OrbitControls' fixed-axis spin stays off.
  controls.autoRotate = !atmosphere.motion && options.autoRotate
  controls.autoRotateSpeed = 0.45
  controls.enablePan = false
  controls.minDistance = 20
  controls.maxDistance = sphereRadius * 8
  const focusDistance = Math.max(controls.minDistance * 1.5, sphereRadius * 0.55)
  controls.addEventListener("change", () => requestRender())
  // Motion holds still while the orb is being dragged or zoomed, and eases back once it has been left alone.
  let interacting = false
  let lastInteractionAt = Number.NEGATIVE_INFINITY
  controls.addEventListener("start", () => {
    interacting = true
  })
  controls.addEventListener("end", () => {
    interacting = false
    lastInteractionAt = performance.now()
  })

  // Layout. Default tone: a weak radial force pulls the cloud toward a sphere, which is
  // what makes a sparse graph read as an orb rather than a smear. Void tone: even a strong
  // radial force leaves the cloud lumpy (nodes out to 1.3R), so a shell force aims each node
  // at a radius between 0.4R and 1.0R by rank, and the settled layout is snapped onto them.
  // NaN positions make d3-force-3d seed a phyllotaxis spiral instead of stacking every node at the origin.
  const simNodes: SimNode[] = graph.nodes.map(() => ({ x: Number.NaN, y: Number.NaN, z: Number.NaN }))
  const linkData = graph.links.map((link) => ({ source: link.source, target: link.target }))
  const linkForce = forceLink(linkData)
    .distance(10)
    .strength((_link, position) => 0.06 + 0.5 * (graph.links[position]?.strength ?? 1))
  const simulation = forceSimulation(simNodes, 3)
    .alphaDecay(0.035)
    .velocityDecay(0.35)
    .force("link", linkForce)
    .force("charge", forceManyBody().strength(-26).distanceMax(sphereRadius * 1.2).theta(1))
    .force("centre", forceCenter(0, 0, 0))
    .force("sphere", profile.shellLayout ? shellForce(sphereRadius) : forceRadial(sphereRadius, 0, 0, 0).strength(0.12))
    .stop()
  let settled = nodeCount === 0

  // Node buffers.
  // Dust motes follow the nodes in the same buffers, so they draw in the nodes' one call.
  const moteCount = atmosphere.motes ? ATMOSPHERE.moteCount : 0
  const pointCount = nodeCount + moteCount
  const positions = new Float32Array(pointCount * 3)
  const colours = new Float32Array(pointCount * 3)
  const sizes = new Float32Array(pointCount)
  const alphas = new Float32Array(pointCount)
  const phases = new Float32Array(pointCount)
  const moteDiameters = new Float32Array(pointCount)
  for (let index = 0; index < nodeCount; index++) phases[index] = nodePhase(index)
  if (moteCount > 0) {
    const field = moteField(moteCount, sphereRadius)
    positions.set(field.positions, nodeCount * 3)
    phases.set(field.phases, nodeCount)
    alphas.fill(ATMOSPHERE.moteAlpha, nodeCount)
    moteDiameters.fill(ATMOSPHERE.motePx, nodeCount)
  }
  const nodeGeometry = new THREE.BufferGeometry()
  nodeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  nodeGeometry.setAttribute("aColor", new THREE.BufferAttribute(colours, 3))
  nodeGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage))
  nodeGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage))
  nodeGeometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1))
  nodeGeometry.setAttribute("aMote", new THREE.BufferAttribute(moteDiameters, 1))
  const scaleUniform = { value: 1 }
  const timeUniform = { value: 0 }
  const nodeMaterial = new THREE.ShaderMaterial({
    vertexShader: nodeVertexShader,
    fragmentShader: profile.softGlow ? voidNodeFragmentShader : nodeFragmentShader,
    uniforms: {
      uScale: scaleUniform,
      uPixelRatio: { value: pixelRatio },
      uSpriteFactor: { value: profile.spriteFactor },
      uMinPx: { value: profile.minSpritePx },
      uMaxPx: { value: profile.maxSpritePx },
      uTime: timeUniform,
      uPulse: { value: atmosphere.motion ? 1 : 0 },
      uPulseRate: { value: MOTION.pulseRate },
      uPulseDepth: { value: MOTION.pulseDepth },
      uDrift: { value: atmosphere.motion ? sphereRadius * ATMOSPHERE.moteDrift : 0 },
    },
    transparent: true,
    blending,
    depthWrite: false,
  })
  const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial)
  nodePoints.frustumCulled = false
  // Everything that belongs to the orb turns and breathes together; the camera stays put.
  const orb = new THREE.Group()
  orb.add(nodePoints)
  scene.add(orb)

  // Link buffers: every link faint and tinted by kind, the active ones brighter, all in one draw.
  // Under void the buffers run strongest link first; `drawOrder[slot]` is the graph link in each slot.
  // Additive blending sums the same whatever the order, so the order costs nothing and changes no pixel.
  const drawOrder = profile.kindTint ? linkDrawOrder(graph.links) : graph.links.map((_link, index) => index)
  const linkPositions = new Float32Array(linkCount * 6)
  const linkActive = new Float32Array(linkCount * 2)
  const linkTints = new Float32Array(linkCount * 6)
  const linkGeometry = new THREE.BufferGeometry()
  linkGeometry.setAttribute("position", new THREE.BufferAttribute(linkPositions, 3).setUsage(THREE.DynamicDrawUsage))
  linkGeometry.setAttribute("aTint", new THREE.BufferAttribute(linkTints, 3))
  linkGeometry.setAttribute("aActive", new THREE.BufferAttribute(linkActive, 1).setUsage(THREE.DynamicDrawUsage))
  const activeColour = new THREE.Vector3()
  const linkMaterial = new THREE.ShaderMaterial({
    vertexShader: lineVertexShader,
    fragmentShader: lineFragmentShader,
    uniforms: {
      uActiveColor: { value: activeColour },
      uOpacity: { value: profile.baseEdgeOpacity },
      uActiveOpacity: { value: profile.activeEdgeOpacity },
    },
    transparent: true,
    blending,
    depthWrite: false,
  })
  const lines = new THREE.LineSegments(linkGeometry, linkMaterial)
  lines.frustumCulled = false
  // Links first so node glows blend over them.
  lines.renderOrder = 0
  nodePoints.renderOrder = 2
  orb.add(lines)

  const membraneColourA = new THREE.Vector3()
  const membraneColourB = new THREE.Vector3()
  const membraneGeometry = atmosphere.membrane ? new THREE.SphereGeometry(sphereRadius * ATMOSPHERE.membraneRadius, 48, 32) : null
  const membraneMaterial = atmosphere.membrane
    ? new THREE.ShaderMaterial({
        vertexShader: membraneVertexShader,
        fragmentShader: membraneFragmentShader,
        uniforms: {
          uColourA: { value: membraneColourA },
          uColourB: { value: membraneColourB },
          uTime: timeUniform,
          uAlpha: { value: ATMOSPHERE.rimAlpha },
          uPower: { value: ATMOSPHERE.rimPower },
        },
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    : null
  if (membraneGeometry && membraneMaterial) {
    const membrane = new THREE.Mesh(membraneGeometry, membraneMaterial)
    membrane.frustumCulled = false
    membrane.renderOrder = -1
    orb.add(membrane)
  }

  const nodeColours: Rgb[] = []

  function applyTheme() {
    const style = getComputedStyle(container)
    const inherited = resolveColour(style.color, [0.5, 0.5, 0.5])
    const read = (token: string, fallback: Rgb) => resolveColour(style.getPropertyValue(token), fallback)
    const byToken = new Map<string, Rgb>()
    for (const { token } of graph.groups) byToken.set(token, read(token, inherited))
    graph.nodes.forEach((node, index) => {
      const colour = heatColour(byToken.get(node.token) ?? inherited, node.heat)
      nodeColours[index] = colour
      colours.set(colour, index * 3)
    })
    const edge = read("--muted-foreground", inherited)
    const active = read("--foreground", inherited)
    activeColour.set(...active)
    const tierColours = {
      link: read(EDGE_TOKENS.link, edge),
      topic: read(EDGE_TOKENS.topic, edge),
    }
    drawOrder.forEach((link, slot) => {
      const tint = profile.kindTint ? tierColours[edgeTier(graph.links[link]?.kind)] : edge
      linkTints.set(tint, slot * 6)
      linkTints.set(tint, slot * 6 + 3)
    })
    linkGeometry.getAttribute("aTint").needsUpdate = true
    for (let mote = 0; mote < moteCount; mote++) colours.set(edge, (nodeCount + mote) * 3)
    membraneColourA.set(...read("--chart-5", inherited))
    membraneColourB.set(...read("--chart-2", inherited))
    nodeGeometry.getAttribute("aColor").needsUpdate = true
    requestRender()
  }

  function applyEmphasis() {
    const anyHighlight = highlight.size > 0
    for (let index = 0; index < nodeCount; index++) {
      const emphasised = index === hovered || highlight.has(index)
      const node = graph.nodes[index]
      sizes[index] = (node ? nodeSpriteSize(node, tone) : 0) * (emphasised ? ACTIVE_SCALE : 1)
      // Heat dims a cold node toward its floor; a hovered or highlighted node is always full.
      alphas[index] = emphasised ? 1 : (anyHighlight ? DIMMED_ALPHA : BASE_ALPHA) * heatBrightness(node?.heat)
    }
    nodeGeometry.getAttribute("aSize").needsUpdate = true
    nodeGeometry.getAttribute("aAlpha").needsUpdate = true
    refreshActiveLinks()
    requestRender()
  }

  // Under void a hovered node lights its top 8 neighbours' links, not every link it has.
  const adjacency = profile.labels || Number.isFinite(profile.hoverNeighbourLimit) ? buildAdjacency(graph) : []
  const limitedHover = Number.isFinite(profile.hoverNeighbourLimit)
  function refreshActiveLinks() {
    const hoverLinks =
      limitedHover && hovered !== -1
        ? new Set(strongestNeighbours(adjacency, graph.links, hovered, profile.hoverNeighbourLimit).links)
        : null
    for (let slot = 0; slot < linkCount; slot++) {
      const link = drawOrder[slot] ?? 0
      const { source, target } = graph.links[link] ?? NO_LINK
      const touchesHover = hoverLinks ? hoverLinks.has(link) : source === hovered || target === hovered
      const active = touchesHover || highlight.has(source) || highlight.has(target) ? 1 : 0
      linkActive[slot * 2] = active
      linkActive[slot * 2 + 1] = active
    }
    linkGeometry.getAttribute("aActive").needsUpdate = true
  }

  function copySimulationPositions() {
    simNodes.forEach(({ x, y, z }, index) => {
      positions[index * 3] = x
      positions[index * 3 + 1] = y
      positions[index * 3 + 2] = z
    })
  }

  function syncPositions() {
    copySimulationPositions()
    for (let slot = 0; slot < linkCount; slot++) {
      const { source, target } = graph.links[drawOrder[slot] ?? 0] ?? NO_LINK
      for (let axis = 0; axis < 3; axis++) {
        linkPositions[slot * 6 + axis] = positions[source * 3 + axis] ?? 0
        linkPositions[slot * 6 + 3 + axis] = positions[target * 3 + axis] ?? 0
      }
    }
    nodeGeometry.getAttribute("position").needsUpdate = true
    linkGeometry.getAttribute("position").needsUpdate = true
  }

  // Picking: project every node to the screen and take the nearest under the
  // pointer. 1,300 projections is far cheaper than a raycast against sprites.
  const screen = new Float32Array(nodeCount * 3)
  const radiiPx = new Float32Array(nodeCount)
  const projected = new THREE.Vector3()
  function projectNodes(width: number, height: number) {
    camera.updateMatrixWorld()
    orb.updateMatrixWorld()
    const pixelsPerWorldUnit = height / (2 * Math.tan((FIELD_OF_VIEW * Math.PI) / 360))
    for (let index = 0; index < nodeCount; index++) {
      projected.set(positions[index * 3] ?? 0, positions[index * 3 + 1] ?? 0, positions[index * 3 + 2] ?? 0).applyMatrix4(orb.matrixWorld)
      const distance = projected.distanceTo(camera.position)
      projected.project(camera)
      const behind = projected.z > 1
      screen[index * 3] = (projected.x * 0.5 + 0.5) * width
      screen[index * 3 + 1] = (-projected.y * 0.5 + 0.5) * height
      screen[index * 3 + 2] = behind ? Number.NaN : distance
      // Default tone: the node's own radius. Void: the drawn (clamped) sprite, so a pick matches what is lit.
      radiiPx[index] =
        tone === "void"
          ? spritePixelDiameter(sizes[index] ?? 0, pixelsPerWorldUnit, distance, pixelRatio, profile) / pixelRatio / 2
          : (((graph.nodes[index]?.radius ?? 0) * heatSizeScale(graph.nodes[index]?.heat) * pixelsPerWorldUnit) / distance)
    }
  }

  function setHovered(next: number, x = 0, y = 0) {
    if (next !== hovered) {
      hovered = next
      syncNativeAutoRotate()
      canvas.style.cursor = hovered === -1 ? "grab" : "pointer"
      applyEmphasis()
    }
    const node = graph.nodes[hovered]
    onHover?.(node ? { node, x, y } : null)
  }

  let wantsAutoRotate = options.autoRotate
  function syncNativeAutoRotate() {
    controls.autoRotate = !atmosphere.motion && wantsAutoRotate && hovered === -1
  }
  let pointerMoved: { x: number; y: number } | null = null
  let downAt: { x: number; y: number } | null = null

  const localPoint = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const onPointerMove = (event: PointerEvent) => {
    if (event.buttons !== 0) {
      if (hovered !== -1) setHovered(-1)
      return
    }
    pointerMoved = localPoint(event)
    requestRender()
  }
  const onPointerLeave = () => {
    pointerMoved = null
    setHovered(-1)
  }
  const onPointerDown = (event: PointerEvent) => {
    downAt = localPoint(event)
    pendingFocus = -1
  }
  const onPointerUp = (event: PointerEvent) => {
    const up = localPoint(event)
    const start = downAt
    downAt = null
    if (!start || Math.hypot(up.x - start.x, up.y - start.y) > CLICK_SLOP_PX) return
    const rect = canvas.getBoundingClientRect()
    projectNodes(rect.width, rect.height)
    const hit = pickNearest(screen, radiiPx, up.x, up.y, event.pointerType === "touch" ? 14 : 4)
    if (hit === -1) return
    const node = graph.nodes[hit]
    if (!node) return
    focusNode(hit)
    onNodeClick?.(node)
  }
  canvas.addEventListener("pointermove", onPointerMove)
  canvas.addEventListener("pointerleave", onPointerLeave)
  canvas.addEventListener("pointerdown", onPointerDown)
  canvas.addEventListener("pointerup", onPointerUp)
  canvas.style.cursor = "grab"

  // Labels (void only). Plain DOM, not sprites: they stay crisp and selectable-free, and a handful
  // is cheap to move. A pool is built once; each update places the hovered node, its top 8
  // neighbours and, zoomed in, the hottest nodes on screen, then hides the rest of the pool.
  const labelLayer = profile.labels ? document.createElement("div") : null
  const labelPool: HTMLDivElement[] = []
  const hottestFirst = profile.labels ? hotOrder(graph.nodes) : []
  if (labelLayer) {
    labelLayer.dataset.slot = "graph-3d-labels"
    labelLayer.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none"
    container.appendChild(labelLayer)
  }

  const labelStyle = (role: string) =>
    "position:absolute;left:0;top:0;display:none;box-sizing:border-box;height:18px;padding:0 6px;" +
    "font:500 11px/18px var(--font-sans, system-ui, sans-serif);white-space:nowrap;pointer-events:none;" +
    (role === "hover"
      ? "background:var(--foreground);color:var(--background);"
      : "background:color-mix(in oklab, var(--surface-0) 72%, transparent);color:var(--foreground);" +
        (role === "hot" ? "opacity:0.78;" : ""))

  function labelElement(position: number) {
    let element = labelPool[position]
    if (!element) {
      element = document.createElement("div")
      element.dataset.slot = "graph-3d-label"
      // The corner comes from the theme's radius scale; everything else is inline, so the layout needs no stylesheet.
      element.className = "rounded-sm"
      element.setAttribute("aria-hidden", "true")
      labelLayer?.appendChild(element)
      labelPool[position] = element
    }
    return element
  }

  function updateLabels() {
    if (!labelLayer) return
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    const zoomedIn = isZoomedIn(camera.position.distanceTo(controls.target), sphereRadius)
    const candidates: { index: number; x: number; y: number; text: string; role: string }[] = []
    if (hovered !== -1 || zoomedIn) {
      projectNodes(width, height)
      const add = (index: number, role: string) => {
        const node = graph.nodes[index]
        if (node) candidates.push({ index, x: screen[index * 3] ?? Number.NaN, y: screen[index * 3 + 1] ?? Number.NaN, text: node.label, role })
      }
      const listed = new Set<number>()
      if (hovered !== -1) {
        add(hovered, "hover")
        listed.add(hovered)
        for (const neighbour of strongestNeighbours(adjacency, graph.links, hovered, LABELS.neighbours).nodes) {
          add(neighbour, "neighbour")
          listed.add(neighbour)
        }
      }
      if (zoomedIn) {
        let onScreen = 0
        for (const index of hottestFirst) {
          if (listed.has(index)) continue
          const x = screen[index * 3] ?? Number.NaN
          const y = screen[index * 3 + 1] ?? Number.NaN
          if (!Number.isFinite(screen[index * 3 + 2] ?? Number.NaN) || x < 0 || y < 0 || x > width || y > height) continue
          add(index, "hot")
          // Overlapping labels are dropped, so offer a few more than will fit.
          if (++onScreen >= LABELS.hottest * 3) break
        }
      }
    }
    const roleOf = new Map(candidates.map((candidate) => [candidate.index, candidate.role]))
    const cap = (hovered === -1 ? 0 : 1 + LABELS.neighbours) + (zoomedIn ? LABELS.hottest : 0)
    const placed = placeLabels(candidates, { width, height }, cap)
    placed.forEach((label, position) => {
      const element = labelElement(position)
      const role = roleOf.get(label.index) ?? "hot"
      if (element.dataset.role !== role) {
        element.dataset.role = role
        element.style.cssText = labelStyle(role)
      }
      if (element.textContent !== label.text) element.textContent = label.text
      element.style.transform = `translate(${Math.round(label.left)}px, ${Math.round(label.top)}px)`
      element.style.display = "block"
    })
    for (let position = placed.length; position < labelPool.length; position++) {
      const element = labelPool[position]
      if (element) element.style.display = "none"
    }
  }

  // Click-to-focus tween: target and camera glide so the node ends centred.
  let pendingFocus = -1
  let tween: {
    start: number
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    fromCamera: THREE.Vector3
    toCamera: THREE.Vector3
  } | null = null

  function focusNode(index: number) {
    if (index < 0 || index >= nodeCount) return
    // The layout is still moving: glide now, and again once it settles so the
    // camera ends on the node's final position rather than its seeded one.
    pendingFocus = settled ? -1 : index
    // The orb is still, so the camera ends on the node: a click is an interaction and holds the motion.
    lastInteractionAt = performance.now()
    orb.updateMatrixWorld()
    const toTarget = new THREE.Vector3(positions[index * 3] ?? 0, positions[index * 3 + 1] ?? 0, positions[index * 3 + 2] ?? 0).applyMatrix4(
      orb.matrixWorld,
    )
    const outward = camera.position.clone().sub(controls.target).normalize()
    const toCamera = toTarget.clone().addScaledVector(outward, focusDistance)
    if (reducedMotion) {
      controls.target.copy(toTarget)
      camera.position.copy(toCamera)
      controls.update()
      requestRender()
      return
    }
    tween = {
      start: performance.now(),
      fromTarget: controls.target.clone(),
      toTarget,
      fromCamera: camera.position.clone(),
      toCamera,
    }
    requestRender()
  }

  function resize() {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    scaleUniform.value = height / (2 * Math.tan((FIELD_OF_VIEW * Math.PI) / 360))
    requestRender()
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)

  // Frame loop. It sleeps when nothing moves (settled, not rotating, no tween,
  // no pending hover) and wakes on requestRender().
  function requestRender() {
    renderRequested = true
    if (!frameHandle && !disposed) frameHandle = requestAnimationFrame(frame)
  }

  // Motion clocks, in seconds. `motionClock` drives the breath, the pulse and the drift; `spinClock`
  // drives the precessing rotation and runs only while auto-rotate is on. Both advance at `motionRate`,
  // which holds at 0 while the orb is touched or hovered and eases back to 1 once it has been idle.
  let motionClock = 0
  let spinClock = 0
  let motionRate = 1
  let lastFrameAt = performance.now()

  function applyMotion() {
    timeUniform.value = motionClock
    orb.scale.setScalar(breathScale(motionClock))
    const { yaw, pitch } = precession(spinClock)
    orb.rotation.set(pitch, yaw, 0, "YXZ")
    orb.updateMatrixWorld()
  }

  function stepMotion(now: number): boolean {
    const elapsed = Math.min(100, now - lastFrameAt)
    lastFrameAt = now
    const target = motionTarget({ interacting, hovered: hovered !== -1, idleMs: now - lastInteractionAt })
    motionRate = stepMotionRate(motionRate, target, elapsed)
    if (target === 0 && motionRate < 0.0005) motionRate = 0
    if (motionRate === 0) return false
    motionClock += (elapsed / 1000) * motionRate
    if (wantsAutoRotate) spinClock += (elapsed / 1000) * motionRate
    applyMotion()
    return true
  }

  function frame() {
    frameHandle = 0
    if (disposed) return
    let moved = false
    if (atmosphere.motion && stepMotion(performance.now())) moved = true

    if (!settled) {
      const deadline = performance.now() + FRAME_BUDGET_MS
      do {
        simulation.tick()
        if (simulation.alpha() < simulation.alphaMin()) {
          settled = true
          canvas.dataset.settled = "true"
          break
        }
      } while (performance.now() < deadline)
      if (settled && profile.shellLayout) snapToShells(simNodes, sphereRadius)
      syncPositions()
      moved = true
      if (settled && pendingFocus !== -1) focusNode(pendingFocus)
    }

    if (tween) {
      const progress = Math.min(1, (performance.now() - tween.start) / FOCUS_MS)
      const eased = easeInOutCubic(progress)
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased)
      camera.position.lerpVectors(tween.fromCamera, tween.toCamera, eased)
      if (progress === 1) tween = null
      moved = true
    }

    if (controls.update()) moved = true

    if (pointerMoved) {
      const rect = canvas.getBoundingClientRect()
      projectNodes(rect.width, rect.height)
      // Auto-rotate pauses over a hovered node (see setHovered), so the tooltip holds still.
      setHovered(pickNearest(screen, radiiPx, pointerMoved.x, pointerMoved.y, 4), pointerMoved.x, pointerMoved.y)
      pointerMoved = null
    }

    // Reduced motion lays the graph out unseen and shows only the settled result.
    const hideUntilSettled = reducedMotion && !settled
    if (!hideUntilSettled && (moved || renderRequested)) {
      renderer.render(scene, camera)
      renderRequested = false
      updateLabels()
    }

    if ((!settled || tween || controls.autoRotate || moved || atmosphere.motion) && !frameHandle) {
      frameHandle = requestAnimationFrame(frame)
    }
  }

  applyTheme()
  applyEmphasis()
  resize()
  // First paint shows a seeded starting cloud; reduced motion hides it until settled.
  syncPositions()
  requestRender()

  return {
    setAutoRotate(autoRotate) {
      wantsAutoRotate = autoRotate
      syncNativeAutoRotate()
      requestRender()
    },
    setHighlight(next) {
      highlight = next
      applyEmphasis()
    },
    refreshTheme: applyTheme,
    focusNode,
    dispose() {
      disposed = true
      cancelAnimationFrame(frameHandle)
      resizeObserver.disconnect()
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointerup", onPointerUp)
      controls.dispose()
      simulation.stop()
      nodeGeometry.dispose()
      linkGeometry.dispose()
      nodeMaterial.dispose()
      linkMaterial.dispose()
      membraneGeometry?.dispose()
      membraneMaterial?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      labelLayer?.remove()
      canvas.remove()
    },
  }
}
