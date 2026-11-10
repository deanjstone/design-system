import { describe, expect, it } from "vitest"

import {
  DEFAULT_FONT,
  FONT_COOKIE_NAME,
  FONTS,
  applyFont,
  fontInitScript,
  parseFont,
  readFont,
  setFont,
  writeFont,
} from "../registry/lib/font-preference"

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

describe("font choices", () => {
  it("offers the default font and Aspekta, and defaults to the former", () => {
    expect(FONTS).toEqual(["default", "aspekta"])
    expect(DEFAULT_FONT).toBe("default")
  })

  it("stores the choice under its own name, apart from the theme cookie", () => {
    expect(FONT_COOKIE_NAME).toBe("ds-font")
    expect(FONT_COOKIE_NAME).not.toBe("ds-theme")
  })

  it.each([
    [undefined, "default"],
    [null, "default"],
    ["", "default"],
    ["garbage", "default"],
    ["Aspekta", "default"],
    ["aspekta", "aspekta"],
    ["default", "default"],
  ])("parses %j as %s", (raw, font) => {
    expect(parseFont(raw)).toBe(font)
  })
})

describe("applyFont", () => {
  it("sets data-font for Aspekta", () => {
    const root = document.createElement("html")
    applyFont("aspekta", { root })
    expect(root.getAttribute("data-font")).toBe("aspekta")
  })

  it("leaves no data-font attribute for the default font, so the default page is untouched", () => {
    const root = document.createElement("html")
    applyFont("default", { root })
    expect(root.hasAttribute("data-font")).toBe(false)
    applyFont("aspekta", { root })
    applyFont("default", { root })
    expect(root.hasAttribute("data-font")).toBe(false)
  })
})

describe("writeFont / readFont", () => {
  it("writes a cookie on the configured domain and mirrors it to localStorage", () => {
    const cookies = fakeJar()
    const storage = fakeStorage()
    writeFont("aspekta", { cookies, storage, cookieDomain: ".myargus.cc", secure: true })
    const [name, ...attributes] = cookies.writes[0].split("; ")
    expect(name).toBe(`${FONT_COOKIE_NAME}=aspekta`)
    expect(attributes).toEqual(expect.arrayContaining(["Domain=.myargus.cc", "Path=/", "SameSite=Lax", "Secure"]))
    expect(storage.data[FONT_COOKIE_NAME]).toBe("aspekta")
  })

  it("reads the cookie first, then localStorage, then the default", () => {
    expect(readFont({ cookies: fakeJar(`${FONT_COOKIE_NAME}=aspekta`), storage: fakeStorage() })).toBe("aspekta")
    expect(readFont({ cookies: fakeJar(""), storage: fakeStorage({ [FONT_COOKIE_NAME]: "aspekta" }) })).toBe("aspekta")
    expect(readFont({ cookies: fakeJar(""), storage: fakeStorage() })).toBe("default")
    expect(readFont({ cookies: fakeJar(`${FONT_COOKIE_NAME}=comic-sans`), storage: null })).toBe("default")
  })

  it("does not read or write the theme cookie", () => {
    const cookies = fakeJar("ds-theme=grove.dark")
    expect(readFont({ cookies, storage: fakeStorage({ "ds-theme": "grove.dark" }) })).toBe("default")
    const storage = fakeStorage()
    writeFont("aspekta", { cookies: fakeJar(), storage })
    expect(Object.keys(storage.data)).toEqual([FONT_COOKIE_NAME])
  })

  it("keeps the cookie when localStorage throws", () => {
    const cookies = fakeJar()
    const blocked = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    expect(() => writeFont("aspekta", { cookies, storage: blocked })).not.toThrow()
    expect(cookies.writes).toHaveLength(1)
    expect(readFont({ cookies: fakeJar(`${FONT_COOKIE_NAME}=aspekta`), storage: blocked })).toBe("aspekta")
    expect(readFont({ cookies: fakeJar(""), storage: blocked })).toBe("default")
  })

  it("sets the choice and applies it in one call", () => {
    const root = document.createElement("html")
    const storage = fakeStorage()
    setFont("aspekta", { root, cookies: fakeJar(), storage })
    expect(root.getAttribute("data-font")).toBe("aspekta")
    expect(storage.data[FONT_COOKIE_NAME]).toBe("aspekta")
  })
})

describe("fontInitScript", () => {
  const run = (cookie: string, stored: Record<string, string> = {}) => {
    const root = document.createElement("html")
    new Function("document", "localStorage", fontInitScript())(
      { cookie, documentElement: root },
      { getItem: (key: string) => stored[key] ?? null },
    )
    return root
  }

  it("applies a stored Aspekta choice before first paint", () => {
    expect(run(`${FONT_COOKIE_NAME}=aspekta`).getAttribute("data-font")).toBe("aspekta")
    expect(run("", { [FONT_COOKIE_NAME]: "aspekta" }).getAttribute("data-font")).toBe("aspekta")
  })

  it("adds nothing for no stored value, a default value or garbage", () => {
    expect(run("").hasAttribute("data-font")).toBe(false)
    expect(run(`${FONT_COOKIE_NAME}=default`).hasAttribute("data-font")).toBe(false)
    expect(run(`${FONT_COOKIE_NAME}=%E0%A4%A`).hasAttribute("data-font")).toBe(false)
  })

  it("is plain ES5 so the oldest consumers can run it", () => {
    expect(fontInitScript()).not.toMatch(/=>|\bconst\b|\blet\b|`/)
  })
})
