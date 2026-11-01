#!/usr/bin/env node
// The iPhone safe-area and touch rules of the design-check item (design-system#137).
// Unlike scripts/design-detect.sh this check blocks: it exits 1 when a UI file the
// change touched breaks a rule. It scans only files changed since <base-sha>, so an
// untouched file with an old finding never fails a PR.
//
//   node scripts/design-rules.mjs <base-sha>
//
// Exit status: 0 clean, 1 findings, 2 usage error.
//
// Rules (each one explains itself in its message):
//   viewport-height-unit      min-h-screen, h-screen, 100vh
//   viewport-fit-cover        a viewport meta with no viewport-fit=cover
//   fixed-without-safe-edge   fixed positioning with no max(…env…) edge
//   side-inset-without-floor  env(safe-area-inset-left|right) with no non-zero floor
//   form-text-under-16        a form control under 16px at any breakpoint
//   focus-ring-alpha-only     a focus indicator that is only a translucent ring
//
// The checks are textual. They read class strings and CSS declarations, not the
// rendered page, so they catch the common slips, not every possible one. A line that
// is right for a reason the rule cannot see takes a `design-rules-ignore` comment on
// that line or the line above.
//
// Shipped by the design-system `design-check` registry item. The registry-owned ui
// directory (components.json `aliases.ui`) is never scanned: `shadcn add` put those
// files there, so a finding there is the registry's, not this app's.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const IGNORE_MARKER = "design-rules-ignore"
const UI_FILE = /\.(?:tsx|jsx|css|html|vue|svelte)$/

const lineOf = (text, index) => text.slice(0, index).split("\n").length

const lineIsIgnored = (lines, line) =>
  (lines[line - 1] ?? "").includes(IGNORE_MARKER) || (lines[line - 2] ?? "").includes(IGNORE_MARKER)

// A class token without its variant prefixes: `md:hover:fixed` -> `fixed`.
const stripVariants = (token) => {
  let rest = token
  for (;;) {
    const next = rest.replace(/^(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)?|\[[^\]\s]*\]):/i, "")
    if (next === rest) break
    rest = next
  }
  return rest.replace(/^!/, "")
}

// Every quoted run on one line (backtick runs may span lines): the strings a class
// list lives in. Each quote kind is read on its own so an apostrophe in prose cannot
// pair with a double quote elsewhere.
const quotedStrings = (text) => {
  const found = []
  for (const pattern of [/"([^"\n]*)"/g, /'([^'\n]*)'/g, /`([^`]*)`/g]) {
    for (const match of text.matchAll(pattern)) found.push({ value: match[1], index: match.index + 1 })
  }
  return found
}

const classTokens = (value) => value.split(/\s+/).filter(Boolean)

// A string that reads as a class list: more than one token, one of them utility-shaped.
const looksLikeClassList = (tokens) => tokens.length > 1 && tokens.some((token) => /[-:[]/.test(token))

// The text of the CSS block (or style object) around `index`.
const enclosingBlock = (text, index) => {
  const start = Math.max(text.lastIndexOf("{", index), 0)
  const end = text.indexOf("}", index)
  return text.slice(start, end === -1 ? text.length : end + 1)
}

const findings = (file, text, rule, message, matches) => {
  const lines = text.split("\n")
  return matches
    .map((index) => ({ file, rule, message, line: lineOf(text, index) }))
    .filter((finding) => !lineIsIgnored(lines, finding.line))
    .map((finding) => ({ ...finding, snippet: (lines[finding.line - 1] ?? "").trim().slice(0, 140) }))
}

const viewportHeightUnit = (file, text) => {
  const matches = []
  for (const { value, index } of quotedStrings(text)) {
    for (const match of value.matchAll(/(?<![\w-])(?:[\w[\]:!/.-]+:)?(?:min-)?h-screen(?![\w-])/g)) {
      matches.push(index + match.index)
    }
  }
  // The min-h-app utility ships its own 100vh fallback inside this block; it is the
  // one place the unit is right.
  const unguarded = text.replace(/@supports not \([^)]*dvh[^)]*\)\s*\{[^{}]*\}/g, (block) => " ".repeat(block.length))
  for (const match of unguarded.matchAll(/(?<![\w.])100vh(?![\w])/g)) matches.push(match.index)
  return findings(
    file,
    text,
    "viewport-height-unit",
    "min-h-screen, h-screen and 100vh are taller than the visible area on iOS Safari. Use min-h-app (or h-dvh).",
    [...new Set(matches)],
  )
}

const viewportFitCover = (file, text) => {
  const matches = [...text.matchAll(/<meta\b[^>]*\bname=["']viewport["'][^>]*>/gi)]
    .filter((match) => !/viewport-fit\s*=\s*cover/i.test(match[0]))
    .map((match) => match.index)
  return findings(
    file,
    text,
    "viewport-fit-cover",
    "The viewport meta needs viewport-fit=cover, or env(safe-area-inset-*) is always 0. Use the app-html-head item.",
    matches,
  )
}

const SAFE_EDGE_HINT = /env\(|max\(|-edge\b|-edge-|inset-corner|-safe\b|--edge-|--safe-/

const fixedWithoutSafeEdge = (file, text) => {
  const matches = []
  for (const { value, index } of quotedStrings(text)) {
    const tokens = classTokens(value)
    if (!looksLikeClassList(tokens)) continue
    const bases = tokens.map(stripVariants)
    if (!bases.includes("fixed")) continue
    if (bases.includes("inset-0") || bases.some((token) => SAFE_EDGE_HINT.test(token))) continue
    matches.push(index + value.search(/(?<![\w-])(?:[\w[\]:!/.-]+:)?fixed(?![\w-])/))
  }
  for (const match of text.matchAll(/position\s*:\s*["']?fixed\b/g)) {
    const block = enclosingBlock(text, match.index)
    if (/\binset\s*:\s*0\b/.test(block) || SAFE_EDGE_HINT.test(block)) continue
    matches.push(match.index)
  }
  return findings(
    file,
    text,
    "fixed-without-safe-edge",
    "A fixed element needs a max(…env(safe-area-inset-*)…) edge: use inset-corner-br, px-edge, pb-edge or the --edge-* tokens.",
    matches,
  )
}

// The arguments of every max( call that encloses `index`, innermost first.
const enclosingMaxArguments = (text, index) => {
  const calls = []
  let depth = 0
  for (let at = index - 1; at >= 0; at -= 1) {
    const char = text[at]
    if (char === ")") depth += 1
    else if (char === "(") {
      if (depth > 0) {
        depth -= 1
        continue
      }
      if (/max$/.test(text.slice(0, at))) {
        let closing = 0
        let end = at
        for (; end < text.length; end += 1) {
          if (text[end] === "(") closing += 1
          else if (text[end] === ")" && (closing -= 1) === 0) break
        }
        calls.push(splitTopLevel(text.slice(at + 1, end)))
      }
    } else if (/[;{}"'`\n]/.test(char)) break
  }
  return calls
}

const splitTopLevel = (text) => {
  const parts = []
  let depth = 0
  let current = ""
  for (const char of text) {
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) {
      parts.push(current)
      current = ""
    } else current += char
  }
  parts.push(current)
  return parts.map((part) => part.trim())
}

const isZero = (value) => /^0(?:\.0+)?(?:px|rem|em|%)?$/.test(value)

const sideInsetWithoutFloor = (file, text) => {
  const matches = []
  for (const match of text.matchAll(/env\(\s*safe-area-inset-(?:left|right)\b/g)) {
    const declarationStart = Math.max(
      text.lastIndexOf(";", match.index),
      text.lastIndexOf("{", match.index),
      text.lastIndexOf("}", match.index),
    )
    // --safe-l: env(safe-area-inset-left, 0px) defines a token; it is not a use.
    if (/^\s*--[\w-]+\s*:/.test(text.slice(declarationStart + 1, match.index))) continue
    // The theme's own pl-safe and pr-safe definitions land in the consumer's css; their
    // uses are what the rule flags, below.
    if (/@utility\s+p[lr]-safe\s*$/.test(text.slice(0, text.lastIndexOf("{", match.index)).trimEnd())) continue
    const hasFloor = enclosingMaxArguments(text, match.index).some((args) =>
      args.some((arg) => !arg.includes("env(") && !isZero(arg)),
    )
    if (!hasFloor) matches.push(match.index)
  }
  for (const { value, index } of quotedStrings(text)) {
    for (const match of value.matchAll(/(?<![\w-])(?:[\w[\]:!/.-]+:)?p[xlr]-safe(?![\w-])/g)) {
      if (!/^(?:[\w[\]:!/.-]+:)?(?:px|pl|pr)-safe$/.test(match[0])) continue
      matches.push(index + match.index)
    }
  }
  return findings(
    file,
    text,
    "side-inset-without-floor",
    "env(safe-area-inset-left|right) is 0 in Safari and in landscape, so a bare inset puts content on the curve. Use px-edge, --edge-x or max(<min>, env(…)).",
    [...new Set(matches)],
  )
}

const FORM_TAG = /<(?:input|textarea|select|Input|Textarea|Select|SelectTrigger|CommandInput|InputGroupInput|InputGroupTextarea)\b/g

const smallTextToken = (token) => {
  const base = stripVariants(token)
  if (/^text-(?:xs|sm|2xs|3xs)$/.test(base)) return true
  const arbitrary = /^text-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(base)
  if (!arbitrary) return false
  return Number(arbitrary[1]) * (arbitrary[2] === "rem" ? 16 : 1) < 16
}

const tagEnd = (text, start) => {
  const selfClosing = text.indexOf("/>", start)
  const closing = text.indexOf("</", start)
  const candidates = [selfClosing, closing].filter((at) => at !== -1)
  return Math.min(...candidates, text.length, start + 800)
}

const formTextUnder16 = (file, text) => {
  const matches = []
  for (const tag of text.matchAll(FORM_TAG)) {
    const region = text.slice(tag.index, tagEnd(text, tag.index))
    for (const { value } of quotedStrings(region)) {
      const small = classTokens(value).find(smallTextToken)
      if (small) {
        matches.push(tag.index + region.indexOf(small))
        break
      }
    }
  }
  return findings(
    file,
    text,
    "form-text-under-16",
    "iOS zooms the page when a focused field is under 16px. Keep form text at text-base or larger at every breakpoint (no md:text-sm).",
    matches,
  )
}

const ALPHA_RING = /^focus(?:-visible|-within)?:ring-[a-z-]+\/\d+$/
const SOLID_FOCUS =
  /^focus(?:-visible)?:(?:outline-(?!none$|hidden$)\S+|border-(?!transparent$)\S+|ring-(?:ring|primary|foreground|destructive))$/

const focusRingAlphaOnly = (file, text) => {
  const matches = []
  for (const { value, index } of quotedStrings(text)) {
    const tokens = classTokens(value)
    const ringed = tokens.find((token) => ALPHA_RING.test(token))
    if (!ringed) continue
    const solid = tokens.some((token) => !token.includes("/") && SOLID_FOCUS.test(token))
    if (!solid) matches.push(index + value.indexOf(ringed))
  }
  return findings(
    file,
    text,
    "focus-ring-alpha-only",
    "A translucent focus ring (ring-ring/50) is below 3:1 on the page. Add a solid outline or border-ring beside it (WCAG 1.4.11).",
    matches,
  )
}

const RULES = [viewportHeightUnit, viewportFitCover, fixedWithoutSafeEdge, sideInsetWithoutFloor, formTextUnder16, focusRingAlphaOnly]

export function checkSource(file, text) {
  return RULES.flatMap((rule) => rule(file, text)).sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule))
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

// The ui directory each components.json names, as a path prefix with a trailing slash.
function registryOwnedDirs(topLevel) {
  const dirs = []
  const configs = git("-C", topLevel, "ls-files", "--", ":(glob)**/components.json").split("\n").filter(Boolean)
  for (const config of configs) {
    try {
      const aliases = JSON.parse(readFileSync(`${topLevel}/${config}`, "utf8")).aliases ?? {}
      const alias = aliases.ui ?? (aliases.components ? `${aliases.components}/ui` : null)
      // A workspace-package alias (@scope/pkg/dir) cannot be mapped to a directory.
      if (!alias || (alias.startsWith("@") && !alias.startsWith("@/"))) continue
      dirs.push(`${alias.replace(/^(?:@|~|#)\//, "").replace(/^\.\//, "").replace(/\/$/, "")}/`)
    } catch (error) {
      console.error(`design-rules: could not read ${config}: ${error.message}`)
    }
  }
  return dirs
}

export function main(argv) {
  if (argv.length !== 1) {
    console.error("usage: design-rules.mjs <base-sha>")
    return 2
  }
  const topLevel = git("rev-parse", "--show-toplevel").trim()
  const owned = registryOwnedDirs(topLevel)
  const changed = git("-C", topLevel, "diff", "--name-only", "--diff-filter=d", argv[0], "HEAD")
    .split("\n")
    .filter((path) => UI_FILE.test(path))
    .filter((path) => !owned.some((dir) => path.startsWith(dir) || path.includes(`/${dir}`)))

  const all = changed.flatMap((path) => checkSource(path, readFileSync(`${topLevel}/${path}`, "utf8")))
  const heading = `### Design rules (${changed.length} changed UI file(s) scanned)`
  const lines = [heading, "", all.length === 0 ? "No findings." : `${all.length} finding(s):`, ""]
  for (const finding of all) lines.push(`- \`${finding.file}:${finding.line}\` ${finding.rule}: ${finding.message}`)
  console.log(lines.join("\n"))
  return all.length === 0 ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)))
