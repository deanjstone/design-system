import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// design-system#167: in an installed iOS PWA the status-bar band stayed dark after the
// system appearance changed while the app was open. WebKit may not re-evaluate the two
// media-scoped theme-color metas on resume, so the head snippet's second script re-applies
// one resolved theme-color (and color-scheme) on pageshow, visibilitychange, a system
// mode change, and a change of the app's own `dark` class. jsdom cannot show the band;
// these tests pin what the page asks for. The device check is design-system#168.

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const html = read("../registry/app-html-head/app-html-head.html")
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])
const metas = html.match(/<meta name="theme-color"[^>]*>/g) ?? []
const LIGHT = /media="\(prefers-color-scheme: light\)" content="(#[0-9a-f]{6})"/.exec(metas[0])![1]
const DARK = /media="\(prefers-color-scheme: dark\)" content="(#[0-9a-f]{6})"/.exec(metas[1])![1]

const refreshScript = scripts.find((script) => script.includes("theme-color")) ?? ""

type Listener = (event: { matches: boolean }) => void

// A controllable `(prefers-color-scheme: dark)` query.
const fakeSystem = (initialDark: boolean) => {
  let dark = initialDark
  const listeners = new Set<Listener>()
  const query = {
    get matches() {
      return dark
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  }
  return {
    matchMedia: () => query,
    set: (nextDark: boolean) => {
      dark = nextDark
      for (const listener of listeners) listener({ matches: nextDark })
    },
  }
}

const themeColors = () =>
  [...document.head.querySelectorAll('meta[name="theme-color"]')].map((tag) => ({
    content: tag.getAttribute("content"),
    media: tag.getAttribute("media"),
  }))

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const boot = (system: ReturnType<typeof fakeSystem>) => {
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: system.matchMedia })
  new Function(refreshScript)()
}

// Earlier tests' scripts stay subscribed to <html>; let their observers drain on the reset
// before the head is rebuilt, so a stale callback cannot rewrite it.
beforeEach(async () => {
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.classList.remove("dark")
  document.documentElement.style.removeProperty("color-scheme")
  await settle()
  document.head.innerHTML = metas.join("\n")
})

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia")
})

describe("the head snippet's theme-color refresh", () => {
  it("is a second inline script, so the Dynamic Type script stays first and alone", () => {
    expect(scripts).toHaveLength(2)
    expect(scripts[0]).toContain("--dt-scale")
    expect(refreshScript).not.toContain("--dt-scale")
  })

  it("keeps the two media-scoped metas for the first paint, before any script runs", () => {
    expect(metas).toHaveLength(2)
  })

  it("collapses to one unscoped theme-color at the light colour when the system is light", () => {
    boot(fakeSystem(false))
    expect(themeColors()).toEqual([{ content: LIGHT, media: null }])
    expect(document.documentElement.style.colorScheme).toBe("light")
  })

  it("collapses to one unscoped theme-color at the dark colour when the system is dark", () => {
    boot(fakeSystem(true))
    expect(themeColors()).toEqual([{ content: DARK, media: null }])
    expect(document.documentElement.style.colorScheme).toBe("dark")
  })

  it("re-applies when the system switches while the page is open", () => {
    const system = fakeSystem(true)
    boot(system)
    system.set(false)
    expect(themeColors()).toEqual([{ content: LIGHT, media: null }])
    expect(document.documentElement.style.colorScheme).toBe("light")
  })

  it.each(["pageshow", "visibilitychange"])("re-applies on %s, the resume the system change event can miss", (type) => {
    let dark = true
    const system = fakeSystem(true)
    Object.defineProperty(system.matchMedia(), "matches", { get: () => dark })
    boot(system)
    expect(themeColors()[0].content).toBe(DARK)

    dark = false
    const target = type === "pageshow" ? window : document
    target.dispatchEvent(new Event(type))
    expect(themeColors()).toEqual([{ content: LIGHT, media: null }])
    expect(document.documentElement.style.colorScheme).toBe("light")
  })

  it("inserts a fresh meta element on every re-apply, not an edit of the old one", () => {
    const system = fakeSystem(true)
    boot(system)
    const before = document.head.querySelector('meta[name="theme-color"]')
    system.set(false)
    const after = document.head.querySelector('meta[name="theme-color"]')
    expect(after).not.toBe(before)
    expect(before?.isConnected).toBe(false)
  })

  it("follows the app's own mode once the theme init has run: an explicit Dark over a light system", async () => {
    document.documentElement.setAttribute("data-theme", "ocean")
    document.documentElement.classList.add("dark")
    boot(fakeSystem(false))
    expect(themeColors()).toEqual([{ content: DARK, media: null }])
  })

  it("follows a change of the html dark class, so a mode toggle or the app's own system watcher moves the band", async () => {
    document.documentElement.setAttribute("data-theme", "ocean")
    boot(fakeSystem(false))
    expect(themeColors()[0].content).toBe(LIGHT)

    document.documentElement.classList.add("dark")
    await settle()
    expect(themeColors()).toEqual([{ content: DARK, media: null }])
    expect(document.documentElement.style.colorScheme).toBe("dark")
  })

  it("does nothing where there is no matchMedia", () => {
    Reflect.deleteProperty(window, "matchMedia")
    new Function(refreshScript)()
    expect(themeColors()).toHaveLength(2)
  })

  it("does nothing for a head that carries no media-scoped pair, rather than inventing a colour", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#123456" />'
    boot(fakeSystem(true))
    expect(themeColors()).toEqual([{ content: "#123456", media: null }])
  })

  it("uses the colours the page declared, so an app that changed them keeps its own", () => {
    document.head.innerHTML =
      '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />' +
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />'
    const system = fakeSystem(false)
    boot(system)
    expect(themeColors()).toEqual([{ content: "#ffffff", media: null }])
    system.set(true)
    expect(themeColors()).toEqual([{ content: "#000000", media: null }])
  })
})
