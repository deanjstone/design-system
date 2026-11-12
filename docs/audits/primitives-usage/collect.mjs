#!/usr/bin/env node
// Collects how every frontend uses the registry's UI primitives and tokens, and writes
// output/data.json and output/report.md. The audit doc's numbers come from here.
//
//   node docs/audits/primitives-usage/collect.mjs [--repos ~/repos] [--ref v3.24.0] [--no-fetch]
//
// Read-only on every consumer: it runs `git fetch`, `git ls-tree` and `git cat-file` against
// each repo's origin/main and never checks anything out. A repo listed with "remote": true
// that is not cloned under --repos is cloned bare into the cache directory.

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { basename, dirname, join, posix } from "node:path"
import { fileURLToPath } from "node:url"

import {
  SCALE,
  againstScale,
  componentsOf,
  cssVariables,
  declarationKey,
  emptyCounts,
  fingerprint,
  importsOf,
  measureCss,
  measureScript,
  mergeCounts,
  normaliseSource,
  scaleFor,
} from "./measure.mjs"
import { renderReport } from "./report.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ARGS = process.argv.slice(2)
const option = (name, fallback) => (ARGS.includes(name) ? ARGS[ARGS.indexOf(name) + 1] : fallback)
const REPOS = option("--repos", join(homedir(), "repos"))
const CACHE = option("--cache", join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "primitives-usage"))
const FETCH = !ARGS.includes("--no-fetch")
const OWNER_URL = "https://github.com/deanjstone"

const CODE = /\.(?:tsx?|jsx?|mjs)$/
const SKIP = /(?:^|\/)(?:node_modules|dist|build|coverage|__snapshots__|fixtures)\/|\.d\.ts$|\.gen\.ts$/
const TEST = /\.(?:test|spec|stories)\.[a-z]+$|(?:^|\/)(?:test|tests|__tests__|harness)\//
// Headless UI libraries a registry primitive already wraps. sonner, recharts and
// @tanstack/react-table are left out: an app has to import `toast`, chart parts and column
// helpers from them to use the registry's sonner, chart and data-table at all.
const HEADLESS = /^(?:@base-ui\/react|@base-ui-components\/|@radix-ui\/|@headlessui\/|@ark-ui\/|react-aria|@react-aria\/|@floating-ui\/|cmdk$|vaul$|downshift$|react-day-picker$|embla-carousel|input-otp$|react-resizable-panels$)/
const RAW_ELEMENTS = { button: "button", input: "input", select: "select / native-select", textarea: "textarea", table: "table", dialog: "dialog", label: "label", details: "collapsible / accordion", progress: "progress", hr: "separator" }
const SUFFIXES = ["Badge", "Pill", "Chip", "Row", "Card", "Skeleton", "EmptyState", "Empty", "Banner", "Dialog", "Sheet", "Toggle", "Stat", "Tile", "Timestamp", "Time", "Avatar", "Icon", "Button", "Field", "Section", "List", "Header", "Toolbar", "Error", "Loading", "Spinner"]

function git(cwd, args, input) {
  return execFileSync("git", ["-C", cwd, ...args], { input, maxBuffer: 1 << 30, stdio: ["pipe", "pipe", "pipe"] })
}

function gitText(cwd, args) {
  return git(cwd, args).toString("utf8").trim()
}

// Blob contents for many shas in one process.
function readBlobs(cwd, shas) {
  const unique = [...new Set(shas)]
  const blobs = new Map()
  if (unique.length === 0) return blobs
  const output = git(cwd, ["cat-file", "--batch"], unique.join("\n") + "\n")
  let offset = 0
  while (offset < output.length) {
    const headerEnd = output.indexOf(10, offset)
    const [sha, , size] = output.subarray(offset, headerEnd).toString("utf8").split(" ")
    const start = headerEnd + 1
    blobs.set(sha, output.subarray(start, start + Number(size)).toString("utf8"))
    offset = start + Number(size) + 1
  }
  return blobs
}

function listTree(cwd, ref, paths) {
  const output = gitText(cwd, ["ls-tree", "-r", ref, "--", ...paths])
  if (!output) return []
  return output.split("\n").map((line) => {
    const [meta, path] = line.split("\t")
    return { sha: meta.split(" ")[2], path }
  })
}

const hash = (text) => createHash("sha1").update(text).digest("hex")

function versionOrder(a, b) {
  const [x, y] = [a, b].map((tag) => tag.slice(1).split(".").map(Number))
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

// ---------------------------------------------------------------------------
// The registry, at every release tag.

function loadRegistry() {
  const root = gitText(HERE, ["rev-parse", "--show-toplevel"])
  const tags = gitText(root, ["tag", "--list", "v*"]).split("\n").filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag)).sort(versionOrder)
  const ref = option("--ref", tags.at(-1))
  const manifest = JSON.parse(gitText(root, ["show", `${ref}:registry.json`]))
  const items = manifest.items.map((item) => ({
    name: item.name,
    type: item.type.replace("registry:", ""),
    files: (item.files ?? []).map((file) => file.path),
    dependsOn: (item.registryDependencies ?? []).map((dependency) => dependency.split("/").at(-1).split("#")[0]),
  }))

  // basename -> tag -> normalised hash, for every source file the registry ever shipped.
  const perTag = new Map()
  const shas = []
  for (const tag of tags) {
    const tree = listTree(root, tag, ["registry", "theme/tokens.css"])
    perTag.set(tag, tree)
    shas.push(...tree.map((entry) => entry.sha))
  }
  const blobs = readBlobs(root, shas)
  const history = new Map()
  // Every declaration the registry has shipped as CSS: tokens.css, the stylesheets under
  // registry/, and the theme items in registry.json, which is the copy the CLI installs.
  const declarations = new Set()
  const addCss = (css) => {
    for (const match of css.matchAll(/(?:^|[;{\s])(--[\w-]+|[a-z][a-z-]*)\s*:\s*([^;{}]+)(?=[;}])/g)) declarations.add(declarationKey(match[1], match[2].trim()))
  }
  const addJson = (node) => {
    for (const [key, value] of Object.entries(node ?? {})) {
      if (typeof value === "string") {
        declarations.add(declarationKey(key, value))
        declarations.add(declarationKey(`--${key}`, value))
      } else addJson(value)
    }
  }
  const tokensByTag = new Map()
  for (const tag of tags) {
    for (const { sha, path } of perTag.get(tag)) {
      const text = blobs.get(sha)
      if (path.endsWith(".css")) addCss(text)
      if (path === "theme/tokens.css") tokensByTag.set(tag, text)
      if (!/\.(?:tsx?|css|mjs|sh|json)$/.test(path)) continue
      const name = basename(path)
      if (!history.has(name)) history.set(name, new Map())
      history.get(name).set(tag, { hashes: [hash(fingerprint(text)), hash(fingerprint(text, { stripLeadingComment: true }))], sha })
    }
  }

  for (const tag of tags) {
    const tagged = JSON.parse(gitText(root, ["show", `${tag}:registry.json`]))
    for (const item of tagged.items.filter((candidate) => candidate.type === "registry:theme" || candidate.css || candidate.cssVars)) {
      addJson(item.cssVars)
      addJson(item.css)
    }
  }

  const fileToItem = new Map()
  for (const item of items) for (const file of item.files) fileToItem.set(basename(file), item)
  // Older tags shipped files a current item no longer lists; map them by name where the item survives.
  for (const name of history.keys()) {
    if (fileToItem.has(name)) continue
    const item = items.find((candidate) => candidate.name === name.replace(/\.[a-z]+$/, ""))
    if (item) fileToItem.set(name, item)
  }

  const tokens = tokensByTag.get(ref)
  const tokenNames = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]))
  const semanticColours = new Set([...tokens.matchAll(/--color-([\w-]+)\s*:/g)].map((match) => match[1]))
  const uiExports = new Map()
  for (const item of items.filter((candidate) => candidate.type === "ui")) {
    for (const file of item.files) {
      const text = blobs.get(history.get(basename(file)).get(ref).sha)
      for (const match of text.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const name of match[1].split(",")) {
          const clean = name.trim().split(/\s+as\s+/).at(-1).replace(/^type\s+/, "")
          if (/^[A-Z]/.test(clean)) uiExports.set(clean, item.name)
        }
      }
      for (const component of componentsOf(text)) {
        if (new RegExp(`export\\s+(?:default\\s+)?function\\s+${component.name}\\b`).test(text)) uiExports.set(component.name, item.name)
      }
    }
  }

  return { root, tags, ref, items, history, blobs, fileToItem, declarations, tokensByTag, tokenNames, semanticColours, uiExports, sha: gitText(root, ["rev-parse", "--short", ref]) }
}

// ---------------------------------------------------------------------------
// One app.

function repoDir(app) {
  const local = join(REPOS, app.repo)
  if (existsSync(join(local, ".git"))) {
    if (FETCH) git(local, ["fetch", "--prune", "--quiet"])
    return { dir: local, ref: "origin/main" }
  }
  if (!app.remote) throw new Error(`${app.repo} is not cloned under ${REPOS}`)
  const cached = join(CACHE, `${app.repo}.git`)
  if (!existsSync(cached)) {
    mkdirSync(CACHE, { recursive: true })
    execFileSync("git", ["clone", "--bare", "--depth", "1", "--quiet", `${OWNER_URL}/${app.repo}`, cached], { stdio: "pipe" })
  } else if (FETCH) git(cached, ["fetch", "--depth", "1", "--quiet", "origin", "HEAD"])
  return { dir: cached, ref: existsSync(join(cached, "FETCH_HEAD")) && FETCH ? "FETCH_HEAD" : "HEAD" }
}

function lineDistance(a, b) {
  const counts = new Map()
  for (const line of a.split("\n")) counts.set(line, (counts.get(line) ?? 0) + 1)
  for (const line of b.split("\n")) counts.set(line, (counts.get(line) ?? 0) - 1)
  let distance = 0
  for (const value of counts.values()) distance += Math.abs(value)
  return distance
}

// Added and removed lines between a registry source and a consumer copy, by `git diff --no-index`.
function diffSummary(registryText, appText) {
  const dir = mkdtempSync(join(tmpdir(), "primitives-usage-"))
  try {
    writeFileSync(join(dir, "registry"), registryText + "\n")
    writeFileSync(join(dir, "app"), appText + "\n")
    let output = ""
    try {
      execFileSync("git", ["diff", "--no-index", "-U0", "--no-color", "registry", "app"], { cwd: dir, stdio: "pipe" })
    } catch (error) {
      output = error.stdout.toString("utf8")
    }
    const lines = output.split("\n").filter((line) => /^[+-](?![+-])/.test(line))
    return {
      added: lines.filter((line) => line.startsWith("+")).length,
      removed: lines.filter((line) => line.startsWith("-")).length,
      sample: lines.slice(0, 8).map((line) => line.slice(0, 160)),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// identical | stale | local-edit | forked, for one consumer file that carries a registry file's name.
function classify(registry, name, text, pin) {
  const versions = registry.history.get(name)
  const mine = hash(fingerprint(text))
  const matching = registry.tags.filter((tag) => versions.get(tag)?.hashes.includes(mine))
  const atRef = versions.get(registry.ref)
  if (matching.includes(registry.ref)) return { state: "identical", matches: [matching[0], registry.ref], matchesPin: matching.includes(pin) }
  if (matching.length > 0) {
    return { state: "stale", matches: [matching[0], matching.at(-1)], matchesPin: matching.includes(pin), removedAtRef: !atRef }
  }
  const normalised = normaliseSource(text)
  let nearest = null
  for (const tag of registry.tags) {
    const version = versions.get(tag)
    if (!version) continue
    const distance = lineDistance(normaliseSource(registry.blobs.get(version.sha), { stripLeadingComment: true }), normalised)
    if (!nearest || distance <= nearest.distance) nearest = { tag, distance, sha: version.sha }
  }
  const lines = normalised.split("\n").length
  const diff = diffSummary(normaliseSource(registry.blobs.get(nearest.sha), { stripLeadingComment: true }), normalised)
  // A copy on another headless library than the registry version nearest to it is a fork, as is
  // one that shares less than half its lines with every release.
  const otherLibrary = /from\s+["'](?:@radix-ui\/|vaul["'])/.test(text) && !/@radix-ui\/|vaul/.test(registry.blobs.get(nearest.sha))
  const state = otherLibrary || nearest.distance > lines ? "forked" : "local-edit"
  return { state, nearest: nearest.tag, added: diff.added, removed: diff.removed, sample: diff.sample, matchesPin: false }
}

function resolveImport(specifier, from, paths) {
  let base = null
  if (specifier.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), specifier))
  else if (specifier.startsWith("@/") || specifier.startsWith("~/")) base = specifier.slice(2)
  else return null
  const stems = [base, base.replace(/\.js$/, "")]
  const endings = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", "/index.ts", "/index.tsx"]
  const candidates = []
  for (const stem of stems) for (const ending of endings) candidates.push(stem + ending)
  if (specifier.startsWith(".")) return candidates.find((candidate) => paths.has(candidate)) ?? null
  let best = null
  for (const path of paths) {
    if (!candidates.some((candidate) => path === candidate || path.endsWith(`/${candidate}`))) continue
    if (!best || path.length < best.length) best = path
  }
  return best
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length
}

// List rows, found two ways: an element drawn once per item inside `.map(` and laid out as a
// flex or grid row, and a local component whose name ends in Row or ListItem.
function findRows(label, path, text) {
  const rows = []
  const describe = (kind, index, element, classes, body) => {
    const pick = (pattern) => [...new Set([...body.matchAll(pattern)].map((found) => found[0]))].slice(0, 6)
    return {
      kind,
      where: `${label}:${lineOf(text, index)}`,
      element,
      classes: classes.slice(0, 200),
      text: pick(/\btext-(?:\[[^\]]+\]|3xs|2xs|xs|sm|base|lg|xl|2xl)(?![\w-])/g),
      weight: pick(/\bfont-(?:normal|medium|semibold|bold)\b/g),
      height: pick(/\b(?:min-h|h)-(?:\d+(?:\.\d+)?|\[[^\]]+\])/g),
    }
  }
  const CLASSED = /<([A-Za-z][\w.]*)\b([^>]*?className=(?:"([^"]*)"|\{[^}]*?["'`]([^"'`]*)["'`])[^>]*)>/
  for (const match of text.matchAll(/\.map\(/g)) {
    const window = text.slice(match.index, match.index + 1600)
    const tag = CLASSED.exec(window)
    if (!tag || !/^(?:li|div|a|button|tr|article|Link|NavLink)$/.test(tag[1])) continue
    const classes = tag[3] ?? tag[4] ?? ""
    const isRow = /\b(?:flex|grid)\b/.test(classes) && !/\b(?:inline-flex|animate-pulse|flex-col)\b/.test(classes) && /\b(?:items-center|items-start|items-baseline|justify-between)\b/.test(classes) && /\b(?:(?:min-)?h-\d|p[xy]?-\d)/.test(classes)
    if (isRow) rows.push(describe("mapped", match.index + tag.index, tag[1], classes, window.slice(tag.index)))
  }
  for (const component of componentsOf(text)) {
    if (!/(?:Row|ListItem)$/.test(component.name)) continue
    const start = text.split("\n").slice(0, component.line - 1).join("\n").length
    const window = text.slice(start, start + 3000)
    const tag = CLASSED.exec(window)
    rows.push(describe("component", start + 1, component.name, tag ? (tag[3] ?? tag[4] ?? "") : "", window))
  }
  return rows
}

function measureApp(app, registry) {
  const { dir, ref } = repoDir(app)
  const root = app.path ? `${app.path}/` : ""
  const scopes = (app.only ?? ["src/", "index.html"]).map((scope) => root + scope)
  const tree = listTree(dir, ref, [...scopes, `${root}components.json`, `${root}package.json`]).filter((entry) => !SKIP.test(entry.path))
  const wanted = tree.filter((entry) => CODE.test(entry.path) || /\.(?:css|html|json)$/.test(entry.path))
  const blobs = readBlobs(dir, wanted.map((entry) => entry.sha))
  const files = new Map(wanted.map((entry) => [entry.path, blobs.get(entry.sha)]))
  const paths = new Set(files.keys())

  const config = files.has(`${root}components.json`) ? JSON.parse(files.get(`${root}components.json`)) : null
  const pinUrl = config?.registries?.["@design-system"]?.url ?? config?.registries?.["@design-system"] ?? null
  const pin = typeof pinUrl === "string" ? (/design-system\/([^/]+)\/r\//.exec(pinUrl)?.[1] ?? pinUrl) : null
  const packageJson = files.has(`${root}package.json`) ? JSON.parse(files.get(`${root}package.json`)) : {}
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
  const uiDir = app.uiDir ?? (config ? `${root}src/${config.aliases.ui.replace(/^@\//, "")}` : null)

  // Which consumer files carry a registry file's name, and what state each is in.
  const copies = new Map()
  const localUi = []
  for (const [path, text] of files) {
    if (!CODE.test(path) && !path.endsWith(".css")) continue
    if (TEST.test(path)) continue
    const name = basename(path)
    const inUi = uiDir !== null && path.startsWith(`${uiDir}/`)
    if (!registry.history.has(name)) {
      if (inUi) localUi.push(path)
      continue
    }
    const item = registry.fileToItem.get(name)
    const expected = inUi || /\/(?:components|hooks|lib)\/[^/]+$/.test(path) || path.endsWith(".css")
    if (!expected) continue
    const result = classify(registry, name, text, pin)
    // A lib or hook that shares a name but not its content is the app's own file, not a copy.
    if (result.state === "forked" && !inUi) continue
    copies.set(path, { path, file: name, item: item?.name ?? null, type: item?.type ?? "retired", ...result })
  }

  // Import graph.
  const edges = new Map()
  const packages = []
  for (const [path, text] of files) {
    if (!CODE.test(path) && !path.endsWith(".css")) continue
    const targets = new Set()
    for (const { specifier, line } of importsOf(text)) {
      const target = resolveImport(specifier, path, paths)
      if (target) targets.add(target)
      else if (!specifier.startsWith(".")) packages.push({ specifier, path, line })
    }
    edges.set(path, targets)
  }
  const isApp = (path) => !copies.has(path) && !TEST.test(path)
  const packageImports = {}
  for (const { specifier, path } of packages) {
    if (!isApp(path)) continue
    packageImports[specifier] ??= new Set()
    packageImports[specifier].add(path)
  }
  const reachable = new Set()
  const queue = [...edges.keys()].filter(isApp)
  while (queue.length > 0) {
    const path = queue.pop()
    if (reachable.has(path)) continue
    reachable.add(path)
    for (const target of edges.get(path) ?? []) queue.push(target)
  }
  for (const copy of copies.values()) {
    const importers = [...edges].filter(([from, targets]) => targets.has(copy.path) && from !== copy.path).map(([from]) => from)
    copy.appImporters = importers.filter(isApp).length
    copy.testImporters = importers.filter((from) => TEST.test(from)).length
    copy.copyImporters = importers.filter((from) => copies.has(from)).length
    copy.use = copy.appImporters > 0 ? "used" : reachable.has(copy.path) ? "dependency" : "unused"
  }

  // Bypasses: headless imports, raw elements and same-named local components in app-authored files.
  const authored = [...files.keys()].filter((path) => isApp(path) && (CODE.test(path) || path.endsWith(".css")))
  const headless = packages.filter(({ specifier, path }) => HEADLESS.test(specifier) && isApp(path) && !(uiDir && path.startsWith(`${uiDir}/`)))
  const rawElements = {}
  const duplicates = []
  const components = []
  const rows = []
  for (const path of authored) {
    if (!/\.[jt]sx$/.test(path)) continue
    const text = files.get(path)
    for (const element of Object.keys(RAW_ELEMENTS)) {
      const count = [...text.matchAll(new RegExp(`<${element}[\\s>/]`, "g"))].length
      if (count === 0) continue
      rawElements[element] ??= { count: 0, files: [] }
      rawElements[element].count += count
      rawElements[element].files.push({ path: `${app.repo}/${path}`, count })
    }
    for (const component of componentsOf(text)) {
      components.push({ name: component.name, where: `${app.repo}/${path}:${component.line}` })
      if (registry.uiExports.has(component.name)) duplicates.push({ name: component.name, primitive: registry.uiExports.get(component.name), where: `${app.repo}/${path}:${component.line}` })
    }
    rows.push(...findRows(`${app.repo}/${path}`, path, text))
  }

  // Tokens: what the app's CSS declares against the registry's token file at each tag.
  const cssFiles = [...files.keys()].filter((path) => path.endsWith(".css") && !TEST.test(path))
  const allCss = cssFiles.map((path) => files.get(path)).join("\n")
  const vars = cssVariables(allCss)
  const pairsOf = (css) => new Set([...css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map((match) => `${match[1]}:${match[2].replace(/\s+/g, "")}`))
  const appPairs = pairsOf(allCss)
  let theme = null
  if (appPairs.size > 0) {
    const coverage = (tag) => {
      const tagPairs = pairsOf(registry.tokensByTag.get(tag))
      let hit = 0
      for (const pair of tagPairs) if (appPairs.has(pair)) hit += 1
      return { tag, hit, total: tagPairs.size, share: hit / tagPairs.size }
    }
    const scores = registry.tags.map(coverage)
    const top = Math.max(...scores.map((score) => score.share))
    const best = scores.filter((score) => score.share === top)
    const refNames = new Set([...registry.tokensByTag.get(registry.ref).matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]))
    const everNames = new Set()
    for (const css of registry.tokensByTag.values()) for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) everNames.add(match[1])
    theme = {
      newestFullMatch: best.at(-1).tag,
      bestShare: top,
      atPin: scores.find((score) => score.tag === pin)?.share ?? null,
      atRef: scores.at(-1).share,
      missingAtRef: [...refNames].filter((name) => vars[name] === undefined).length,
      localNames: Object.keys(vars).filter((name) => !everNames.has(name)).length,
      declared: Object.keys(vars).length,
    }
  }

  // Hardcoding and the #207 histograms, split by who wrote the code.
  const scale = scaleFor(vars)
  const semanticColours = new Set([...registry.semanticColours, ...Object.keys(vars).filter((name) => name.startsWith("--color-")).map((name) => name.slice(8))])
  const context = { scale, semanticColours, tokenNames: registry.tokenNames, vars, registryDeclarations: registry.declarations }
  const totals = { authored: emptyCounts(), copies: emptyCounts() }
  const perFile = []
  for (const [path, text] of files) {
    if (TEST.test(path)) continue
    let counts = null
    if (CODE.test(path)) counts = measureScript(text, context)
    else if (path.endsWith(".css")) counts = measureCss(text, copies.has(path) ? { ...context, registryDeclarations: new Set() } : context)
    if (!counts) continue
    const bucket = copies.has(path) ? "copies" : "authored"
    mergeCounts(totals[bucket], counts)
    if (bucket === "authored") {
      const literal = Object.values(counts.arbitraryLiteral).reduce((sum, value) => sum + value, 0)
      perFile.push({
        path,
        hardcoded: literal + counts.rawColours + counts.inlineStyleLiterals + counts.paletteColourClasses,
        offScale:
          againstScale(counts.fontSize, SCALE.type).off +
          againstScale(counts.fontWeight, SCALE.weight).off +
          againstScale(counts.spacing, SCALE.spacing).off +
          againstScale(counts.radius, SCALE.radius).off,
      })
    }
  }

  return {
    id: app.id,
    repo: app.repo,
    path: app.path || ".",
    mirrorOf: app.mirrorOf ?? null,
    sha: gitText(dir, ["rev-parse", "--short", ref]),
    pin,
    style: config?.style ?? null,
    hasComponentsJson: config !== null,
    framework: ["react", "preact", "vue", "svelte", "solid-js"].filter((name) => dependencies[name]),
    headlessDependencies: Object.keys(dependencies).filter((name) => HEADLESS.test(name)).sort(),
    tailwind: dependencies.tailwindcss ?? null,
    files: { total: authored.length + copies.size, authored: authored.length, copies: copies.size },
    copies: [...copies.values()].sort((a, b) => a.path.localeCompare(b.path)),
    localUi: localUi.sort(),
    headless: headless.sort((a, b) => a.path.localeCompare(b.path)).map(({ specifier, path, line }) => ({ specifier, where: `${app.repo}/${path}:${line}` })),
    packageImports: Object.fromEntries(Object.entries(packageImports).map(([specifier, set]) => [specifier, set.size]).sort((a, b) => a[0].localeCompare(b[0]))),
    rawElements,
    duplicates,
    components,
    rows,
    theme,
    scale,
    totals,
    topHardcoded: perFile.map((file) => ({ ...file, path: `${app.repo}/${file.path}` })).filter((file) => file.hardcoded > 0).sort((a, b) => b.hardcoded - a.hardcoded).slice(0, 5),
    offScaleFiles: perFile.filter((file) => file.offScale > 0).length,
    offScale: {
      type: againstScale(totals.authored.fontSize, SCALE.type),
      weight: againstScale(totals.authored.fontWeight, SCALE.weight),
      spacing: againstScale(totals.authored.spacing, SCALE.spacing),
      radius: againstScale(totals.authored.radius, SCALE.radius),
    },
  }
}

// ---------------------------------------------------------------------------

function crossApp(apps, registry) {
  const counted = apps.filter((app) => !app.mirrorOf)
  const usage = registry.items
    .filter((item) => item.type === "ui" || item.type === "block")
    .map((item) => {
      const all = counted.map((app) => ({ app: app.id, copies: app.copies.filter((copy) => copy.item === item.name) })).filter((cell) => cell.copies.length > 0)
      const cells = all.filter((cell) => cell.copies.some((copy) => copy.state !== "forked"))
      return {
        name: item.name,
        type: item.type,
        forkedIn: all.filter((cell) => cell.copies.every((copy) => copy.state === "forked")).map((cell) => cell.app),
        usedIn: cells.filter((cell) => cell.copies.some((copy) => copy.use === "used")).map((cell) => cell.app),
        present: cells.length,
        used: cells.filter((cell) => cell.copies.some((copy) => copy.use === "used")).length,
        importingFiles: cells.reduce((sum, cell) => sum + Math.max(...cell.copies.map((copy) => copy.appImporters)), 0),
      }
    })

  const names = new Map()
  for (const app of counted) {
    for (const component of app.components) {
      if (!names.has(component.name)) names.set(component.name, [])
      names.get(component.name).push({ app: app.id, where: component.where })
    }
  }
  const shared = [...names]
    .map(([name, places]) => ({ name, apps: [...new Set(places.map((place) => place.app))], places }))
    .filter((entry) => entry.apps.length >= 2)
    .sort((a, b) => b.apps.length - a.apps.length || a.name.localeCompare(b.name))

  const suffixes = SUFFIXES.map((suffix) => {
    const places = []
    for (const app of counted) {
      for (const component of app.components) {
        if (component.name.endsWith(suffix) && component.name !== suffix) places.push({ app: app.id, name: component.name, where: component.where })
      }
    }
    return { suffix, components: places.length, apps: [...new Set(places.map((place) => place.app))], places }
  }).filter((entry) => entry.apps.length >= 2)

  return { usage, shared, suffixes }
}

const registry = loadRegistry()
const { apps: appList } = JSON.parse(readFileSync(join(HERE, "apps.json"), "utf8"))
const apps = appList.map((app) => measureApp(app, registry))
const baseline = (() => {
  const vars = cssVariables(registry.tokensByTag.get(registry.ref))
  const context = { scale: scaleFor(vars), semanticColours: registry.semanticColours, tokenNames: registry.tokenNames, vars }
  const totals = emptyCounts()
  for (const item of registry.items.filter((candidate) => candidate.type === "ui")) {
    for (const file of item.files) mergeCounts(totals, measureScript(registry.blobs.get(registry.history.get(basename(file)).get(registry.ref).sha), context))
  }
  return totals
})()

const data = {
  registry: {
    ref: registry.ref,
    sha: registry.sha,
    tags: registry.tags.length,
    ui: registry.items.filter((item) => item.type === "ui").map((item) => item.name),
    blocks: registry.items.filter((item) => item.type === "block").map((item) => item.name),
    dependsOn: Object.fromEntries(registry.items.map((item) => [item.name, item.dependsOn])),
    tokenNames: registry.tokenNames.size,
    baseline,
  },
  scale: SCALE,
  rawElementPrimitive: RAW_ELEMENTS,
  apps,
  cross: crossApp(apps, registry),
}

mkdirSync(join(HERE, "output"), { recursive: true })
writeFileSync(join(HERE, "output", "data.json"), JSON.stringify(data, null, 1) + "\n")
const report = renderReport(data)
writeFileSync(join(HERE, "output", "report.md"), report.markdown)
process.stdout.write(report.summary)
