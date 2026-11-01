// The builders behind the myargus links registry (design-system ADR-0004).
// Pure functions of the registry data: no DOM, no Node, so a Worker, a Vite
// app and a Node service all call the same code. `links.ts` binds them to the
// vendored data; import from there, not from here.

export type Bucket = "internal" | "external" | "api" | "mcp" | "tailnet"
export type Status = "live" | "planned" | "redirect" | "retired"

export interface LinkEntry {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly bucket: Bucket
  readonly status: Status
  readonly host?: string
  readonly path?: string
  readonly port?: number
  readonly redirect?: string
  readonly switcher: boolean
  readonly routes: readonly string[]
}

export interface LinkRegistry {
  readonly revision: number
  readonly domain: string
  readonly cookieDomain: string
  readonly tailnetHost: string
  readonly entries: readonly LinkEntry[]
}

export interface LinkOptions {
  /**
   * Replace the origin (scheme, host, port) for a local or preview run. The
   * path and the slash rules are kept. Backend code reads this from one env var
   * per deployment and passes it in; nothing else about a URL is configurable.
   */
  readonly origin?: string
}

export interface SwitcherApp {
  readonly id: string
  readonly name: string
  readonly href: string
  readonly description?: string
  readonly current: boolean
}

export class LinkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LinkError"
  }
}

const BUCKET_BUILDER: Record<Bucket, string> = {
  internal: "appUrl",
  external: "appUrl",
  api: "apiUrl",
  mcp: "mcpUrl",
  tailnet: "tailnetUrl",
}

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "")

function parseOrigin(origin: string): string {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    throw new LinkError(`origin ${JSON.stringify(origin)} is not a URL`)
  }
  const hasPath = url.pathname !== "/" || url.search !== "" || url.hash !== ""
  if ((url.protocol !== "https:" && url.protocol !== "http:") || hasPath) {
    throw new LinkError(`origin ${JSON.stringify(origin)} must be http(s)://host[:port] with no path`)
  }
  return url.origin
}

export function createLinks<const Registry extends LinkRegistry>(registry: Registry) {
  type Id = Registry["entries"][number]["id"]
  type SwitcherId = Extract<Registry["entries"][number], { readonly switcher: true; readonly status: "live" }>["id"]

  const byId = new Map<string, LinkEntry>(registry.entries.map((entry) => [entry.id, entry]))

  const lookup = (id: string, builder: string): LinkEntry => {
    const entry = byId.get(id)
    if (!entry) throw new LinkError(`${builder}: unknown link id ${JSON.stringify(id)}`)
    return entry
  }

  // A redirect entry builds its target; a retired one must not be built at all.
  const resolve = (id: string, builder: string, buckets: Bucket[]): LinkEntry => {
    let entry = lookup(id, builder)
    if (entry.status === "redirect" && entry.redirect) entry = lookup(entry.redirect, builder)
    if (entry.status === "retired") throw new LinkError(`${builder}: ${entry.id} is retired; remove the reference`)
    if (!buckets.includes(entry.bucket)) {
      throw new LinkError(`${builder}: ${entry.id} is a ${entry.bucket} entry; use ${BUCKET_BUILDER[entry.bucket]}`)
    }
    return entry
  }

  const originOf = (entry: LinkEntry, options?: LinkOptions): string => {
    if (options?.origin !== undefined) return parseOrigin(options.origin)
    if (entry.bucket === "tailnet") return `https://${registry.tailnetHost}:${entry.port}`
    return `https://${entry.host}`
  }

  // The path the entry is mounted at, with no trailing slash ("" for a host root).
  const mountOf = (entry: LinkEntry): string => trimTrailingSlashes(entry.path ?? "")

  const appUrl = (id: Id, options?: LinkOptions): string => {
    const entry = resolve(id, "appUrl", ["internal", "external"])
    return `${originOf(entry, options)}${mountOf(entry)}/`
  }

  const routeUrl = (
    id: Id,
    path: string,
    params: Record<string, string | number> = {},
    options?: LinkOptions,
  ): string => {
    const entry = resolve(id, "routeUrl", ["internal", "external"])
    if (!entry.routes.includes(path)) {
      throw new LinkError(`routeUrl: ${path} is not a registered route of ${entry.id}; add it to links.json`)
    }
    const used = new Set<string>()
    const filled = path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, name: string) => {
      const value = params[name]
      if (value === undefined) throw new LinkError(`routeUrl: ${path} needs the parameter ${name}`)
      used.add(name)
      return encodeURIComponent(String(value))
    })
    const unused = Object.keys(params).filter((name) => !used.has(name))
    if (unused.length > 0) throw new LinkError(`routeUrl: ${path} takes no parameter ${unused.join(", ")}`)
    return `${originOf(entry, options)}${mountOf(entry)}${filled}`
  }

  const baseUrl = (builder: "apiUrl" | "mcpUrl", bucket: Bucket) => (id: Id, options?: LinkOptions): string => {
    const entry = resolve(id, builder, [bucket])
    return `${originOf(entry, options)}${mountOf(entry)}`
  }

  const tailnetUrl = (id: Id, options?: LinkOptions): string => {
    const entry = resolve(id, "tailnetUrl", ["tailnet"])
    return `${originOf(entry, options)}/`
  }

  const switcherApps = (currentId: SwitcherId): SwitcherApp[] => {
    const current = lookup(currentId, "switcherApps")
    if (!current.switcher || current.status !== "live") {
      throw new LinkError(`switcherApps: ${currentId} is not a switcher app`)
    }
    return registry.entries
      .filter((entry) => entry.switcher && entry.status === "live")
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        href: appUrl(entry.id),
        ...(entry.description === undefined ? {} : { description: entry.description }),
        current: entry.id === currentId,
      }))
  }

  return {
    appUrl,
    routeUrl,
    apiUrl: baseUrl("apiUrl", "api"),
    mcpUrl: baseUrl("mcpUrl", "mcp"),
    tailnetUrl,
    switcherApps,
    COOKIE_DOMAIN: registry.cookieDomain as Registry["cookieDomain"],
  }
}
