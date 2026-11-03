// The WebGL half of `graph-3d`: a d3-force-3d layout drawn with three.js as two
// draw calls (one Points object for nodes, one LineSegments for links) rather
// than a mesh per node, which is what keeps ~1,300 nodes and ~4,000 links smooth.
// graph-3d.tsx imports this lazily, so three.js stays out of the first bundle.

import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { forceCenter, forceLink, forceManyBody, forceRadial, forceSimulation } from "d3-force-3d"
import type { SimulationNode } from "d3-force-3d"

import {
  easeInOutCubic,
  parseCssColor,
  pickNearest,
  type MappedGraph,
  type MappedNode,
  type Rgb,
} from "@/lib/graph-3d-core"

export type GraphHover = { node: MappedNode; x: number; y: number }

export type GraphEngineOptions = {
  container: HTMLElement
  graph: MappedGraph
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
  uniform float uScale;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vColor = aColor;
    vAlpha = aAlpha;
    // Sprite covers 2.6x the node diameter so the halo has room to fade out.
    gl_PointSize = clamp(aSize * 2.6 * uScale * uPixelRatio / -viewPosition.z, 2.0, 160.0);
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

const lineVertexShader = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const lineFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
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
  const [red, green, blue, alpha] = colourProbe.getImageData(0, 0, 1, 1).data
  return alpha === 0 ? fallback : [red / 255, green / 255, blue / 255]
}

type SimNode = SimulationNode

export function createGraphEngine(options: GraphEngineOptions): GraphEngine {
  const { container, graph, onNodeClick, onHover } = options
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
  renderer.setPixelRatio(pixelRatio)
  const canvas = renderer.domElement
  canvas.style.display = "block"
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  container.appendChild(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 6000)
  const sphereRadius = 11 * Math.cbrt(Math.max(nodeCount, 8))
  camera.position.set(0, sphereRadius * 1, sphereRadius * 3.6)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = !reducedMotion
  controls.dampingFactor = 0.08
  controls.autoRotate = options.autoRotate
  controls.autoRotateSpeed = 0.45
  controls.enablePan = false
  controls.minDistance = 20
  controls.maxDistance = sphereRadius * 8
  const focusDistance = Math.max(controls.minDistance * 1.5, sphereRadius * 0.55)
  controls.addEventListener("change", () => requestRender())

  // Layout. A weak radial force pulls the cloud toward a sphere, which is what
  // makes a sparse graph read as an orb rather than a smear.
  // NaN positions make d3-force-3d seed a phyllotaxis spiral instead of stacking every node at the origin.
  const simNodes: SimNode[] = graph.nodes.map(() => ({ x: Number.NaN, y: Number.NaN, z: Number.NaN }))
  const linkData = graph.links.map((link) => ({ source: link.source, target: link.target }))
  const linkForce = forceLink(linkData)
    .distance(10)
    .strength((_link, position) => 0.06 + 0.5 * graph.links[position].strength)
  const simulation = forceSimulation(simNodes, 3)
    .alphaDecay(0.035)
    .velocityDecay(0.35)
    .force("link", linkForce)
    .force("charge", forceManyBody().strength(-26).distanceMax(sphereRadius * 1.2).theta(1))
    .force("centre", forceCenter(0, 0, 0))
    .force("sphere", forceRadial(sphereRadius, 0, 0, 0).strength(0.12))
    .stop()
  let settled = nodeCount === 0

  // Node buffers.
  const positions = new Float32Array(nodeCount * 3)
  const colours = new Float32Array(nodeCount * 3)
  const sizes = new Float32Array(nodeCount)
  const alphas = new Float32Array(nodeCount)
  const nodeGeometry = new THREE.BufferGeometry()
  nodeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  nodeGeometry.setAttribute("aColor", new THREE.BufferAttribute(colours, 3))
  nodeGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage))
  nodeGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage))
  const nodeMaterial = new THREE.ShaderMaterial({
    vertexShader: nodeVertexShader,
    fragmentShader: nodeFragmentShader,
    uniforms: { uScale: { value: 1 }, uPixelRatio: { value: pixelRatio } },
    transparent: true,
    depthWrite: false,
  })
  const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial)
  nodePoints.frustumCulled = false
  scene.add(nodePoints)

  // Link buffers: every link faint, then the active ones brighter on top.
  const linkPositions = new Float32Array(linkCount * 6)
  const activePositions = new Float32Array(linkCount * 6)
  const linkGeometry = new THREE.BufferGeometry()
  linkGeometry.setAttribute("position", new THREE.BufferAttribute(linkPositions, 3).setUsage(THREE.DynamicDrawUsage))
  const activeGeometry = new THREE.BufferGeometry()
  activeGeometry.setAttribute("position", new THREE.BufferAttribute(activePositions, 3).setUsage(THREE.DynamicDrawUsage))
  activeGeometry.setDrawRange(0, 0)
  const lineMaterial = (opacity: number) =>
    new THREE.ShaderMaterial({
      vertexShader: lineVertexShader,
      fragmentShader: lineFragmentShader,
      uniforms: { uColor: { value: new THREE.Vector3() }, uOpacity: { value: opacity } },
      transparent: true,
      depthWrite: false,
    })
  const baseLineMaterial = lineMaterial(0.2)
  const activeLineMaterial = lineMaterial(0.85)
  const baseLines = new THREE.LineSegments(linkGeometry, baseLineMaterial)
  const activeLines = new THREE.LineSegments(activeGeometry, activeLineMaterial)
  baseLines.frustumCulled = false
  activeLines.frustumCulled = false
  // Links first so node glows blend over them.
  baseLines.renderOrder = 0
  activeLines.renderOrder = 1
  nodePoints.renderOrder = 2
  scene.add(baseLines, activeLines)

  const nodeColours: Rgb[] = []

  function applyTheme() {
    const style = getComputedStyle(container)
    const inherited = resolveColour(style.color, [0.5, 0.5, 0.5])
    const read = (token: string, fallback: Rgb) => resolveColour(style.getPropertyValue(token), fallback)
    const byToken = new Map<string, Rgb>()
    for (const { token } of graph.groups) byToken.set(token, read(token, inherited))
    graph.nodes.forEach((node, index) => {
      const colour = byToken.get(node.token) ?? inherited
      nodeColours[index] = colour
      colours.set(colour, index * 3)
    })
    const edge = read("--muted-foreground", inherited)
    const active = read("--foreground", inherited)
    ;(baseLineMaterial.uniforms.uColor.value as THREE.Vector3).set(...edge)
    ;(activeLineMaterial.uniforms.uColor.value as THREE.Vector3).set(...active)
    nodeGeometry.getAttribute("aColor").needsUpdate = true
    requestRender()
  }

  function applyEmphasis() {
    const anyHighlight = highlight.size > 0
    for (let index = 0; index < nodeCount; index++) {
      const emphasised = index === hovered || highlight.has(index)
      sizes[index] = graph.nodes[index].radius * 2 * (emphasised ? ACTIVE_SCALE : 1)
      alphas[index] = emphasised || !anyHighlight ? (emphasised ? 1 : BASE_ALPHA) : DIMMED_ALPHA
    }
    nodeGeometry.getAttribute("aSize").needsUpdate = true
    nodeGeometry.getAttribute("aAlpha").needsUpdate = true
    refreshActiveLinks()
    requestRender()
  }

  function refreshActiveLinks() {
    let written = 0
    for (let link = 0; link < linkCount; link++) {
      const { source, target } = graph.links[link]
      if (!(source === hovered || target === hovered || highlight.has(source) || highlight.has(target))) continue
      for (let axis = 0; axis < 3; axis++) {
        activePositions[written * 6 + axis] = positions[source * 3 + axis]
        activePositions[written * 6 + 3 + axis] = positions[target * 3 + axis]
      }
      written++
    }
    activeGeometry.setDrawRange(0, written * 2)
    activeGeometry.getAttribute("position").needsUpdate = true
  }

  function syncPositions() {
    for (let index = 0; index < nodeCount; index++) {
      positions[index * 3] = simNodes[index].x
      positions[index * 3 + 1] = simNodes[index].y
      positions[index * 3 + 2] = simNodes[index].z
    }
    for (let link = 0; link < linkCount; link++) {
      const { source, target } = graph.links[link]
      for (let axis = 0; axis < 3; axis++) {
        linkPositions[link * 6 + axis] = positions[source * 3 + axis]
        linkPositions[link * 6 + 3 + axis] = positions[target * 3 + axis]
      }
    }
    nodeGeometry.getAttribute("position").needsUpdate = true
    linkGeometry.getAttribute("position").needsUpdate = true
    refreshActiveLinks()
  }

  // Picking: project every node to the screen and take the nearest under the
  // pointer. 1,300 projections is far cheaper than a raycast against sprites.
  const screen = new Float32Array(nodeCount * 3)
  const radiiPx = new Float32Array(nodeCount)
  const projected = new THREE.Vector3()
  function projectNodes(width: number, height: number) {
    camera.updateMatrixWorld()
    const pixelsPerWorldUnit = height / (2 * Math.tan((FIELD_OF_VIEW * Math.PI) / 360))
    for (let index = 0; index < nodeCount; index++) {
      projected.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2])
      const distance = projected.distanceTo(camera.position)
      projected.project(camera)
      const behind = projected.z > 1
      screen[index * 3] = (projected.x * 0.5 + 0.5) * width
      screen[index * 3 + 1] = (-projected.y * 0.5 + 0.5) * height
      screen[index * 3 + 2] = behind ? Number.NaN : distance
      radiiPx[index] = (graph.nodes[index].radius * pixelsPerWorldUnit) / distance
    }
  }

  function setHovered(next: number, x = 0, y = 0) {
    if (next !== hovered) {
      hovered = next
      controls.autoRotate = hovered === -1 && wantsAutoRotate
      canvas.style.cursor = hovered === -1 ? "grab" : "pointer"
      applyEmphasis()
    }
    onHover?.(hovered === -1 ? null : { node: graph.nodes[hovered], x, y })
  }

  let wantsAutoRotate = options.autoRotate
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
    focusNode(hit)
    onNodeClick?.(graph.nodes[hit])
  }
  canvas.addEventListener("pointermove", onPointerMove)
  canvas.addEventListener("pointerleave", onPointerLeave)
  canvas.addEventListener("pointerdown", onPointerDown)
  canvas.addEventListener("pointerup", onPointerUp)
  canvas.style.cursor = "grab"

  // Click-to-focus tween: target and camera glide so the node ends centred.
  let tween: {
    start: number
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    fromCamera: THREE.Vector3
    toCamera: THREE.Vector3
  } | null = null

  function focusNode(index: number) {
    if (index < 0 || index >= nodeCount) return
    const toTarget = new THREE.Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2])
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
    nodeMaterial.uniforms.uScale.value = height / (2 * Math.tan((FIELD_OF_VIEW * Math.PI) / 360))
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

  function frame() {
    frameHandle = 0
    if (disposed) return
    let moved = false

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
      syncPositions()
      moved = true
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
    }

    if ((!settled || tween || controls.autoRotate || moved) && !frameHandle) {
      frameHandle = requestAnimationFrame(frame)
    }
  }

  applyTheme()
  applyEmphasis()
  resize()
  // First paint shows a seeded starting cloud; reduced motion hides it until settled.
  for (let index = 0; index < nodeCount; index++) {
    positions[index * 3] = simNodes[index].x
    positions[index * 3 + 1] = simNodes[index].y
    positions[index * 3 + 2] = simNodes[index].z
  }
  syncPositions()
  requestRender()

  return {
    setAutoRotate(autoRotate) {
      wantsAutoRotate = autoRotate
      controls.autoRotate = autoRotate && hovered === -1
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
      activeGeometry.dispose()
      nodeMaterial.dispose()
      baseLineMaterial.dispose()
      activeLineMaterial.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
