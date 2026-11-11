// @vitest-environment node

import { describe, expect, it } from "vitest"

import { parsePatch } from "../registry/lib/diff-core"

// The unified-diff parser behind `file-diff` (design-system#205), moved from ops-hub's pulls lib so the
// block carries it. It reads one file's patch the way GitHub sends it, one entry per line.

const PATCH = ["@@ -10,3 +10,4 @@ export function a() {", " keep", "-gone", "+new one", "+new two", " tail"].join("\n")

describe("parsePatch", () => {
  it("reads a hunk header, and starts the line counts from it", () => {
    const [hunk, keep] = parsePatch(PATCH)

    expect(hunk).toEqual({ kind: "hunk", text: "@@ -10,3 +10,4 @@ export function a() {", oldLine: null, newLine: null })
    expect(keep).toEqual({ kind: "context", text: "keep", oldLine: 10, newLine: 10 })
  })

  it("numbers a deletion by its old line and an addition by its new line", () => {
    const lines = parsePatch(PATCH)

    expect(lines[2]).toEqual({ kind: "del", text: "gone", oldLine: 11, newLine: null })
    expect(lines[3]).toEqual({ kind: "add", text: "new one", oldLine: null, newLine: 11 })
    expect(lines[4]).toEqual({ kind: "add", text: "new two", oldLine: null, newLine: 12 })
  })

  it("moves both counts on after a context line that follows a change", () => {
    expect(parsePatch(PATCH)[5]).toEqual({ kind: "context", text: "tail", oldLine: 12, newLine: 13 })
  })

  it("restarts the counts at each hunk", () => {
    const lines = parsePatch(["@@ -1 +1 @@", "-a", "+b", "@@ -40,2 +41,2 @@", " c"].join("\n"))

    expect(lines[1]).toMatchObject({ kind: "del", oldLine: 1 })
    expect(lines[4]).toMatchObject({ kind: "context", oldLine: 40, newLine: 41 })
  })

  it("turns a no-newline marker into a note without a line number", () => {
    const lines = parsePatch(["@@ -1 +1 @@", "-a", "\\ No newline at end of file", "+a"].join("\n"))

    expect(lines[2]).toEqual({ kind: "note", text: "No newline at end of file", oldLine: null, newLine: null })
    expect(lines[3]).toMatchObject({ kind: "add", newLine: 1 })
  })

  it("keeps the indentation of the code", () => {
    expect(parsePatch(["@@ -1 +1 @@", "+    indented"].join("\n"))[1].text).toBe("    indented")
  })
})
