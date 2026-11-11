// The unified-diff reader behind `file-diff` (design-system#205), moved here from ops-hub's pulls lib so the
// block carries it. No React, no DOM: it turns one file's patch into lines.

/** One changed file, in the shape GitHub's "list pull request files" gives. A `PullFile` fits as it is. */
type FileDiffFile = {
  filename: string
  /** Set on a rename: the path the file had before. */
  previousFilename?: string | null
  /** GitHub's status, for example `modified` or `renamed`. Only `renamed` changes what the block says. */
  status?: string
  additions: number
  deletions: number
  /** The unified-diff patch, or `null` when there is none to show (binary, too large, or a pure rename). */
  patch: string | null
}

type DiffLine = {
  kind: "hunk" | "context" | "add" | "del" | "note"
  /** The line's text without its leading + or - sign. A hunk header keeps its `@@`. */
  text: string
  oldLine: number | null
  newLine: number | null
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** A unified-diff patch as GitHub sends it per file, one entry per line with its line numbers. */
function parsePatch(patch: string): DiffLine[] {
  let oldLine = 0
  let newLine = 0
  return patch.split("\n").map((line): DiffLine => {
    const hunk = HUNK_HEADER.exec(line)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      return { kind: "hunk", text: line, oldLine: null, newLine: null }
    }
    if (line.startsWith("\\")) return { kind: "note", text: line.slice(1).trim(), oldLine: null, newLine: null }
    if (line.startsWith("+")) return { kind: "add", text: line.slice(1), oldLine: null, newLine: newLine++ }
    if (line.startsWith("-")) return { kind: "del", text: line.slice(1), oldLine: oldLine++, newLine: null }
    return { kind: "context", text: line.slice(1), oldLine: oldLine++, newLine: newLine++ }
  })
}

export { parsePatch }
export type { DiffLine, FileDiffFile }
