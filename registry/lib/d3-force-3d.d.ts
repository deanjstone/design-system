// d3-force-3d ships no types. This is the slice graph-3d-engine uses.
declare module "d3-force-3d" {
  export type SimulationNode = {
    index?: number
    x: number
    y: number
    z: number
    vx?: number
    vy?: number
    vz?: number
  }

  export type Force = (alpha: number) => void

  export type Simulation<N extends SimulationNode> = {
    tick(iterations?: number): Simulation<N>
    stop(): Simulation<N>
    alpha(): number
    alpha(value: number): Simulation<N>
    alphaMin(): number
    alphaMin(value: number): Simulation<N>
    alphaDecay(value: number): Simulation<N>
    velocityDecay(value: number): Simulation<N>
    force(name: string, force: Force | null): Simulation<N>
    nodes(): N[]
  }

  export type LinkForce = Force & {
    id(accessor: (node: unknown, index: number) => unknown): LinkForce
    distance(value: number | ((link: unknown) => number)): LinkForce
    strength(value: number | ((link: unknown, index: number) => number)): LinkForce
    iterations(value: number): LinkForce
  }

  export type ManyBodyForce = Force & {
    strength(value: number): ManyBodyForce
    distanceMax(value: number): ManyBodyForce
    theta(value: number): ManyBodyForce
  }

  export type RadialForce = Force & { strength(value: number): RadialForce }

  export function forceSimulation<N extends SimulationNode>(nodes: N[], numDimensions?: number): Simulation<N>
  export function forceLink(links: { source: number; target: number }[]): LinkForce
  export function forceManyBody(): ManyBodyForce
  export function forceCenter(x?: number, y?: number, z?: number): Force
  export function forceRadial(radius: number, x?: number, y?: number, z?: number): RadialForce
}
