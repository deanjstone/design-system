// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8")
const bytes = (relative: string) => readFileSync(path.join(root, relative))

type Entry = {
  file: string
  family: string
  weight?: string
  reservedFontName?: string
  url: string
  bytes: number
  sha256: string
  gitBlob: string
  licence: string
  source: { repository: string; commit: string; path: string }
}
const manifest = JSON.parse(read("registry/fonts/fonts.json")) as { fonts: Entry[]; notices: Entry[] }
const registry = JSON.parse(read("registry.json"))
const item = registry.items.find((entry: { name: string }) => entry.name === "font-aspekta")
const css = read("registry/fonts/ds-fonts.css")
const script = path.join(root, "registry/fonts/install-ds-fonts.sh")

const sha256 = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex")
const gitBlob = (buffer: Buffer) =>
  createHash("sha1").update(`blob ${buffer.length}\0`).update(buffer).digest("hex")

describe("the font files are the originals", () => {
  it.each([...manifest.fonts, ...manifest.notices])("$file matches the pinned upstream bytes", (entry) => {
    const buffer = bytes(`registry/fonts/${entry.file}`)
    expect(buffer.length).toBe(entry.bytes)
    expect(sha256(buffer)).toBe(entry.sha256)
    expect(gitBlob(buffer)).toBe(entry.gitBlob)
  })

  it.each(manifest.fonts)("$file is a WOFF2 file", (entry) => {
    expect(bytes(`registry/fonts/${entry.file}`).subarray(0, 4).toString("latin1")).toBe("wOF2")
  })

  it.each([...manifest.fonts, ...manifest.notices])("$file keeps its upstream name and comes from the font's own repository", (entry) => {
    expect(path.basename(entry.file)).toBe(path.basename(entry.source.path))
    expect(entry.source.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(entry.url).toBe(`https://raw.githubusercontent.com/${entry.source.repository}/${entry.source.commit}/${entry.source.path}`)
    expect(["ivodolenc/aspekta", "displaay/Azeret"]).toContain(entry.source.repository)
  })

  it("holds exactly the files the manifest lists, so there is no renamed or extra copy", () => {
    const onDisk = ["aspekta", "azeret-mono"].flatMap((dir) =>
      readdirSync(path.join(root, "registry/fonts", dir)).map((name) => `${dir}/${name}`),
    )
    expect(onDisk.sort()).toEqual([...manifest.fonts, ...manifest.notices].map((entry) => entry.file).sort())
  })

  it("is not routed through shadcn, which reads files as UTF-8 and would corrupt a binary", () => {
    const listed = registry.items.flatMap((entry: { files?: { path: string }[] }) => entry.files ?? []).map((file: { path: string }) => file.path)
    expect(listed.filter((file: string) => /\.(woff2?|ttf|otf)$/.test(file))).toEqual([])
  })
})

describe("the licence notices", () => {
  it("ship Aspekta's OFL text with its copyright and Reserved Font Name", () => {
    const licence = read("registry/fonts/aspekta/LICENSE.txt")
    expect(licence).toContain('Copyright (c) 2025 Ivo Dolenc')
    expect(licence).toContain('Reserved Font Name "Aspekta"')
    expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1")
  })

  it("ship Azeret Mono's OFL text with its copyright and authors", () => {
    expect(read("registry/fonts/azeret-mono/OFL.txt")).toContain("Copyright 2021 The Azeret Project Authors")
    expect(read("registry/fonts/azeret-mono/OFL.txt")).toContain("SIL OPEN FONT LICENSE Version 1.1")
    expect(read("registry/fonts/azeret-mono/AUTHORS.txt")).toContain("Displaay")
  })

  it("travel with the item to public/fonts/ds, next to the fonts", () => {
    const targets = Object.fromEntries(item.files.map((file: { path: string; target: string }) => [file.path, file.target]))
    expect(targets["registry/fonts/aspekta/LICENSE.txt"]).toBe("~/public/fonts/ds/LICENSE-Aspekta.txt")
    expect(targets["registry/fonts/azeret-mono/OFL.txt"]).toBe("~/public/fonts/ds/OFL-Azeret-Mono.txt")
    expect(targets["registry/fonts/azeret-mono/AUTHORS.txt"]).toBe("~/public/fonts/ds/AUTHORS-Azeret-Mono.txt")
  })

  it("are repeated in the stylesheet's header", () => {
    const header = css.slice(0, css.indexOf("@font-face"))
    expect(header).toContain("Reserved Font Name")
    expect(header).toContain("Ivo Dolenc")
    expect(header).toContain("The Azeret Project Authors")
    expect(header).toContain("SIL Open Font License 1.1")
  })
})

describe("ds-fonts.css", () => {
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => body)
  const declared = (body: string, property: string) => new RegExp(`${property}:\\s*([^;]+);`).exec(body)?.[1].trim()

  it("declares one face per shipped file, swapping in once loaded", () => {
    expect(faces).toHaveLength(manifest.fonts.length)
    for (const entry of manifest.fonts) {
      const body = faces.find((face) => face.includes(path.basename(entry.file)))
      expect(body, entry.file).toBeDefined()
      expect(declared(body!, "font-family")).toBe(`"${entry.family}"`)
      expect(declared(body!, "font-weight")).toBe(entry.weight)
      expect(declared(body!, "font-display")).toBe("swap")
      expect(declared(body!, "src")).toBe(`url("/fonts/ds/${path.basename(entry.file)}") format("woff2")`)
    }
  })

  it("keeps Aspekta's upstream family name rather than renaming it", () => {
    expect(faces.some((body) => declared(body, "font-family") === '"Aspekta Variable"')).toBe(true)
    expect(css).not.toMatch(/font-family:\s*"?Aspekta"?\s*;/)
  })

  it("switches the faces only under data-font=\"aspekta\", falling back to the system faces", () => {
    const rules = [...css.replace(/@font-face\s*\{[^}]*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)]
    expect(rules).toHaveLength(1)
    const [, selector, body] = rules[0]
    expect(selector.trim()).toBe('[data-font="aspekta"][data-font="aspekta"]')
    expect(declared(body, "--font-sans-stack")).toMatch(/^"Aspekta Variable", .*sans-serif$/)
    expect(declared(body, "--font-mono")).toMatch(/^"Azeret Mono", .*monospace$/)
  })
})

describe("font-aspekta item", () => {
  it("is listed, with the stylesheet, the install script and the notices as plain files", () => {
    expect(item.type).toBe("registry:file")
    expect(item.registryDependencies).toEqual(["deanjstone/design-system/font-preference"])
    const targets = Object.fromEntries(item.files.map((file: { path: string; target: string }) => [file.path, file.target]))
    expect(targets["registry/fonts/ds-fonts.css"]).toBe("~/src/ds-fonts.css")
    expect(targets["registry/fonts/install-ds-fonts.sh"]).toBe("~/scripts/install-ds-fonts.sh")
    expect(item.files).toHaveLength(5)
  })

  it("is built into r/font-aspekta.json, notices byte for byte", () => {
    const built = JSON.parse(read("r/font-aspekta.json"))
    const content = (target: string) => built.files.find((file: { target: string }) => file.target === target).content
    expect(content("~/public/fonts/ds/LICENSE-Aspekta.txt")).toBe(read("registry/fonts/aspekta/LICENSE.txt"))
    expect(content("~/public/fonts/ds/OFL-Azeret-Mono.txt")).toBe(read("registry/fonts/azeret-mono/OFL.txt"))
    expect(content("~/public/fonts/ds/AUTHORS-Azeret-Mono.txt")).toBe(read("registry/fonts/azeret-mono/AUTHORS.txt"))
  })
})

describe("install-ds-fonts.sh", () => {
  const scratch: string[] = []
  const tempDir = () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ds-fonts-"))
    scratch.push(dir)
    return dir
  }
  afterEach(() => {
    for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  const run = (destination: string, sourceDir?: string) =>
    spawnSync("bash", [script, destination], {
      encoding: "utf8",
      env: { ...process.env, ...(sourceDir ? { DS_FONTS_SOURCE_DIR: sourceDir } : {}), DS_FONTS_NO_NETWORK: "1" },
    })

  it("parses", () => {
    expect(() => execFileSync("bash", ["-n", script])).not.toThrow()
  })

  it("names every font's url and sha256 from the manifest", () => {
    const text = read("registry/fonts/install-ds-fonts.sh")
    for (const entry of manifest.fonts) {
      expect(text, entry.file).toContain(entry.url)
      expect(text, entry.file).toContain(entry.sha256)
    }
  })

  it("copies the originals byte for byte from a local source and verifies them", () => {
    const destination = tempDir()
    const result = run(destination, path.join(root, "registry/fonts"))
    expect(result.status, result.stderr).toBe(0)
    for (const entry of manifest.fonts) {
      expect(readFileSync(path.join(destination, path.basename(entry.file))).equals(bytes(`registry/fonts/${entry.file}`))).toBe(true)
    }
    expect(run(destination, path.join(root, "registry/fonts")).status).toBe(0)
  })

  it("refuses a file that does not match its checksum and writes nothing", () => {
    const source = tempDir()
    cpSync(path.join(root, "registry/fonts"), source, { recursive: true })
    const tampered = path.join(source, "aspekta/AspektaVF.woff2")
    writeFileSync(tampered, Buffer.concat([readFileSync(tampered), Buffer.from("x")]))
    const destination = tempDir()
    const result = run(destination, source)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/checksum/i)
    expect(existsSync(path.join(destination, "AspektaVF.woff2"))).toBe(false)
  })
})
