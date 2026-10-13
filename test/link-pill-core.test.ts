// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  PENDING_HREF,
  classify,
  describeLink,
} from "../registry/lib/link-pill-core"

describe("classify", () => {
  it.each([
    ["mention:agent/tex", { kind: "mention", target: "agent", id: "tex" }],
    ["mention:session/abc-123", { kind: "mention", target: "session", id: "abc-123" }],
    ["mention:memory/fact_bitwarden", { kind: "mention", target: "memory", id: "fact_bitwarden" }],
    ["mention:person/Jane%20Citizen", { kind: "mention", target: "person", id: "Jane Citizen" }],
    [
      "mention:note/CORTEX/PROJECTS/Stockade",
      { kind: "mention", target: "note", id: "CORTEX/PROJECTS/Stockade" },
    ],
    ["MENTION:agent/tex", { kind: "mention", target: "agent", id: "tex" }],
  ])("%s is a mention", (href, expected) => {
    expect(classify(href)).toEqual(expected)
  })

  it.each([
    "mention:robot/tex",
    "mention:agent/",
    "mention:agent",
    "mention:/tex",
    "mention:Agent/tex",
    "mention:person/%E0%A4%A",
  ])("%s degrades to None", (href) => {
    expect(classify(href)).toEqual({ kind: "none" })
  })

  it.each([
    ["geo:-37.8,144.97", { kind: "location", latitude: -37.8, longitude: 144.97 }],
    ["geo:48.2010,16.3695,183", { kind: "location", latitude: 48.201, longitude: 16.3695 }],
    ["geo:0,0;u=35", { kind: "location", latitude: 0, longitude: 0 }],
    ["GEO:1.5,2.5", { kind: "location", latitude: 1.5, longitude: 2.5 }],
  ])("%s is a location", (href, expected) => {
    expect(classify(href)).toEqual(expected)
  })

  it.each(["geo:", "geo:abc,def", "geo:91,0", "geo:0,181", "geo:12"])(
    "%s is not a location",
    (href) => {
      expect(classify(href)).toEqual({ kind: "none" })
    },
  )

  it.each([
    ["https://example.com/survey-results.pdf", "pdf"],
    ["http://example.com/a/b/data.CSV?download=1#top", "csv"],
    ["https://example.com/archive.zip", "zip"],
    ["https://example.com/sheet.xlsx", "xlsx"],
    ["https://example.com/report.docx", "docx"],
    ["https://example.com/photo.png", "png"],
    ["https://example.com/photo.jpg", "jpg"],
  ])("%s is a file", (href, extension) => {
    expect(classify(href)).toEqual({ kind: "file", extension })
  })

  it.each([
    "https://example.com",
    "https://example.com/",
    "https://example.com/blog/post",
    "https://example.com/page.html",
    "https://example.com/?file=report.pdf",
    "http://localhost:3000/dashboard",
  ])("%s is a URL", (href) => {
    expect(classify(href)).toEqual({ kind: "url" })
  })

  it.each([
    "#section",
    "/relative/path.pdf",
    "../notes.md",
    "relative.pdf",
    "mailto:someone@example.com",
    "tel:+61400000000",
    "https://",
    "http:// spaced.example.com/",
    "javascript:alert(1)",
    "ftp://example.com/file.pdf",
    "",
    "   ",
  ])("%j is None", (href) => {
    expect(classify(href)).toEqual({ kind: "none" })
  })

  it("flags the streaming placeholder as pending", () => {
    expect(PENDING_HREF).toBe("streamdown:incomplete-link")
    expect(classify(PENDING_HREF)).toEqual({ kind: "none", pending: true })
  })

  it("treats undefined and non-string hrefs as None", () => {
    expect(classify(undefined)).toEqual({ kind: "none" })
  })
})

describe("describeLink", () => {
  it.each([
    [{ kind: "mention", target: "agent", id: "tex" }, "mention", "Agent", "Agent: ", "agent"],
    [{ kind: "mention", target: "session", id: "s" }, "mention", "Session", "Session: ", "session"],
    [{ kind: "mention", target: "note", id: "n" }, "mention", "Note", "Note: ", "note"],
    [{ kind: "mention", target: "memory", id: "m" }, "mention", "Memory", "Memory: ", "memory"],
    [{ kind: "mention", target: "person", id: "p" }, "mention", "Person", "Person: ", "person"],
    [{ kind: "file", extension: "pdf" }, "file", "PDF", "PDF file: ", "file"],
    [{ kind: "file", extension: "csv" }, "file", "CSV", "CSV file: ", "file"],
    [{ kind: "location", latitude: 1, longitude: 2 }, "location", "Map", "Map location: ", "location"],
  ] as const)("describes %j", (classification, kind, kindTag, srPrefix, icon) => {
    const description = describeLink(classification)
    expect(description).toMatchObject({ kind, kindTag, srPrefix, icon })
    expect(description?.iconPaths.length).toBeGreaterThan(0)
  })

  it("adds a mention-target modifier class", () => {
    expect(describeLink({ kind: "mention", target: "note", id: "n" })?.modifiers).toEqual([
      "link-pill--mention",
      "link-pill--note",
    ])
    expect(describeLink({ kind: "file", extension: "pdf" })?.modifiers).toEqual(["link-pill--file"])
  })

  it("has no kind tag or announcement for a URL link", () => {
    expect(describeLink({ kind: "url" })).toMatchObject({
      kind: "url",
      kindTag: "",
      srPrefix: "",
      icon: "url",
    })
  })

  it("describes None as nothing", () => {
    expect(describeLink({ kind: "none" })).toBeNull()
  })
})

describe("core isolation", () => {
  it("imports nothing", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../registry/lib/link-pill-core.ts", import.meta.url)),
      "utf8",
    )
    expect(source).not.toMatch(/(?:^|\s)(?:from|import)\s+["']/m)
  })
})
