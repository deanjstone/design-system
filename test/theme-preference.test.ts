import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  COOKIE_NAME,
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODES,
  THEMES,
  applyPreference,
  parsePreference,
  readPreference,
  resolveMode,
  serializePreference,
  setPreference,
  themeInitScript,
  watchSystemMode,
  writePreference,
} from "../registry/lib/theme-preference"

// A document.cookie stand-in that records every write instead of enforcing the
// browser's domain rules, so the attributes can be asserted.
const fakeJar = (initial = "") => {
  const writes: string[] = []
  return {
    writes,
    get cookie() {
      return initial
    },
    set cookie(value: string) {
      writes.push(value)
      initial = value.split(";")[0]
    },
  }
}

const fakeStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial }
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value
    },
  }
}

describe("serialize / parse", () => {
  it.each(THEMES.flatMap((theme) => MODES.map((mode) => ({ theme, mode }))))(
    "round-trips $theme $mode",
    (preference) => {
      expect(parsePreference(serializePreference(preference))).toEqual(preference)
    },
  )

  it("defaults to Ocean following the system", () => {
    expect(DEFAULT_THEME).toBe("ocean")
    expect(DEFAULT_MODE).toBe("system")
    expect(parsePreference(undefined)).toEqual({ theme: "ocean", mode: "system" })
    expect(parsePreference(null)).toEqual({ theme: "ocean", mode: "system" })
  })

  it.each([
    ["", "ocean", "system"],
    ["garbage", "ocean", "system"],
    ["neon.dark", "ocean", "dark"],
    ["grove.sepia", "grove", "system"],
    ["t3-chat.light", "t3-chat", "light"],
    ["grove.dark.extra", "ocean", "system"],
  ])("falls back per field for %j", (raw, theme, mode) => {
    expect(parsePreference(raw)).toEqual({ theme, mode })
  })

  it("lists the six T3 themes with Ocean among them", () => {
    expect(THEMES).toEqual(["default", "t3-chat", "grove", "ocean", "ember", "iris"])
    expect(MODES).toEqual(["light", "dark", "system"])
  })
})

describe("writePreference", () => {
  it("sets a cookie on the configured parent domain and mirrors it to localStorage", () => {
    const cookies = fakeJar()
    const storage = fakeStorage()
    writePreference({ theme: "grove", mode: "dark" }, { cookies, storage, cookieDomain: ".myargus.cc", secure: true })
    expect(cookies.writes).toHaveLength(1)
    const [name, ...attributes] = cookies.writes[0].split("; ")
    expect(name).toBe(`${COOKIE_NAME}=grove.dark`)
    expect(attributes).toEqual(
      expect.arrayContaining(["Domain=.myargus.cc", "Path=/", "SameSite=Lax", "Secure"]),
    )
    expect(attributes.find((a) => a.startsWith("Max-Age="))).toBeDefined()
    expect(storage.data[COOKIE_NAME]).toBe("grove.dark")
  })

  it("omits Domain when none is configured, and Secure off https", () => {
    const cookies = fakeJar()
    writePreference({ theme: "iris", mode: "light" }, { cookies, storage: fakeStorage(), secure: false })
    expect(cookies.writes[0]).not.toMatch(/Domain=/)
    expect(cookies.writes[0]).not.toMatch(/Secure/)
  })

  it("still writes the cookie when localStorage throws", () => {
    const cookies = fakeJar()
    const storage = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    expect(() => writePreference({ theme: "ember", mode: "dark" }, { cookies, storage })).not.toThrow()
    expect(cookies.writes).toHaveLength(1)
  })
})

describe("readPreference", () => {
  it("reads the cookie among others", () => {
    const cookies = fakeJar(`a=1; ${COOKIE_NAME}=ember.dark; b=2`)
    expect(readPreference({ cookies, storage: fakeStorage() })).toEqual({ theme: "ember", mode: "dark" })
  })

  it("prefers the cookie over localStorage", () => {
    const cookies = fakeJar(`${COOKIE_NAME}=iris.light`)
    const storage = fakeStorage({ [COOKIE_NAME]: "grove.dark" })
    expect(readPreference({ cookies, storage }).theme).toBe("iris")
  })

  it("falls back to localStorage when there is no cookie (a host outside the cookie domain)", () => {
    const storage = fakeStorage({ [COOKIE_NAME]: "grove.dark" })
    expect(readPreference({ cookies: fakeJar("a=1"), storage })).toEqual({ theme: "grove", mode: "dark" })
  })

  it("falls back to the defaults when nothing is stored or storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => undefined,
    }
    expect(readPreference({ cookies: fakeJar(), storage })).toEqual({ theme: "ocean", mode: "system" })
  })
})

describe("resolveMode", () => {
  it.each([
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["system", true, "dark"],
    ["system", false, "light"],
  ] as const)("%s with prefersDark=%s is %s", (mode, prefersDark, expected) => {
    expect(resolveMode(mode, prefersDark)).toBe(expected)
  })
})

describe("applyPreference", () => {
  let root: HTMLElement
  beforeEach(() => {
    root = document.createElement("html")
  })

  it("sets data-theme and the dark class", () => {
    applyPreference({ theme: "grove", mode: "dark" }, { root, prefersDark: false })
    expect(root.getAttribute("data-theme")).toBe("grove")
    expect(root.classList.contains("dark")).toBe(true)
  })

  it("removes the dark class for light and follows the system for system", () => {
    root.classList.add("dark")
    applyPreference({ theme: "ocean", mode: "light" }, { root, prefersDark: true })
    expect(root.classList.contains("dark")).toBe(false)
    applyPreference({ theme: "ocean", mode: "system" }, { root, prefersDark: true })
    expect(root.classList.contains("dark")).toBe(true)
    applyPreference({ theme: "ocean", mode: "system" }, { root, prefersDark: false })
    expect(root.classList.contains("dark")).toBe(false)
  })

  it("leaves other classes alone", () => {
    root.classList.add("wco")
    applyPreference({ theme: "iris", mode: "dark" }, { root, prefersDark: false })
    expect(root.classList.contains("wco")).toBe(true)
  })
})

describe("setPreference", () => {
  it("persists and applies in one call", () => {
    const root = document.createElement("html")
    const cookies = fakeJar()
    setPreference(
      { theme: "ember", mode: "dark" },
      { root, prefersDark: false, cookies, storage: fakeStorage(), cookieDomain: ".myargus.cc" },
    )
    expect(root.getAttribute("data-theme")).toBe("ember")
    expect(cookies.writes[0]).toContain("Domain=.myargus.cc")
  })
})

describe("watchSystemMode", () => {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  }))
  afterEach(() => listeners.clear())

  it("reports system changes until unsubscribed", () => {
    const seen: boolean[] = []
    const stop = watchSystemMode((prefersDark) => seen.push(prefersDark), matchMedia as unknown as typeof window.matchMedia)
    expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)")
    listeners.forEach((listener) => listener({ matches: true }))
    stop()
    listeners.forEach((listener) => listener({ matches: false }))
    expect(seen).toEqual([true])
    expect(listeners.size).toBe(0)
  })

  it("is a no-op where matchMedia is missing", () => {
    expect(() => watchSystemMode(() => undefined, undefined)()).not.toThrow()
  })
})

describe("themeInitScript", () => {
  const run = (cookie: string, storage: Record<string, string>, prefersDark: boolean, hasMatchMedia = true) => {
    const root = document.createElement("html")
    const script = themeInitScript()
    new Function("document", "localStorage", "window", script)(
      { cookie, documentElement: root },
      { getItem: (key: string) => storage[key] ?? null },
      hasMatchMedia ? { matchMedia: () => ({ matches: prefersDark }) } : {},
    )
    return root
  }

  it.each(THEMES.flatMap((theme) => MODES.flatMap((mode) => [true, false].map((dark) => ({ theme, mode, dark })))))(
    "agrees with applyPreference for $theme $mode (system dark=$dark)",
    ({ theme, mode, dark }) => {
      const root = run(`${COOKIE_NAME}=${theme}.${mode}`, {}, dark)
      const expected = document.createElement("html")
      applyPreference({ theme, mode }, { root: expected, prefersDark: dark })
      expect(root.getAttribute("data-theme")).toBe(expected.getAttribute("data-theme"))
      expect(root.classList.contains("dark")).toBe(expected.classList.contains("dark"))
    },
  )

  it("reads localStorage when there is no cookie", () => {
    const root = run("", { [COOKIE_NAME]: "grove.dark" }, false)
    expect(root.getAttribute("data-theme")).toBe("grove")
    expect(root.classList.contains("dark")).toBe(true)
  })

  it("applies Ocean following the system for garbage and for no stored value", () => {
    const root = run(`${COOKIE_NAME}=%E0%A4%A`, {}, true)
    expect(root.getAttribute("data-theme")).toBe("ocean")
    expect(root.classList.contains("dark")).toBe(true)
  })

  it("treats a browser without matchMedia as light", () => {
    const root = run("", {}, true, false)
    expect(root.classList.contains("dark")).toBe(false)
  })

  it("is plain ES5 so the oldest consumers can run it", () => {
    const script = themeInitScript()
    expect(script).not.toMatch(/=>|\bconst\b|\blet\b|`/)
  })
})
