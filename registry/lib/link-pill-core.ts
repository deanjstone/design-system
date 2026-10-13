// Framework-agnostic core of LinkPill: decides a link's kind from its href and
// describes how each kind is presented. No imports and no runtime APIs newer
// than ES5 (no URL, startsWith or includes), so slate-reader's Safari 9 legacy
// bundle can carry it. See docs/adr/0003-scheme-first-link-kind-detection.md.

export type MentionTarget = "agent" | "session" | "note" | "memory" | "person"

export type LinkKind = "mention" | "location" | "file" | "url"

export type Classification =
  | { kind: "mention"; target: MentionTarget; id: string }
  | { kind: "location"; latitude: number; longitude: number }
  | { kind: "file"; extension: string }
  | { kind: "url" }
  | { kind: "none"; pending?: boolean }

export type LinkPillVariant = "inline" | "chip"

// What a host app's Enricher is given and may hand back. The registry ships
// the shapes only; it never fetches anything itself.
export type LinkInfo = {
  href: string
  label: string
  classification: Classification
}

export type Enrichment = {
  label?: string
  avatarUrl?: string
  title?: string
}

export type Enricher = (link: LinkInfo) => Promise<Enrichment | null>

export type LinkDescription = {
  kind: LinkKind
  // Class names for the kind (and the mention target), without `link-pill`.
  modifiers: string[]
  // Text Kind Tag for clients that cannot draw a pill, e.g. "PDF" or "Map".
  kindTag: string
  // Visually-hidden announcement placed before the label, e.g. "PDF file: ".
  srPrefix: string
  icon: string
  // `d` attributes of a 24x24 stroked icon, so both shells draw the same glyph.
  iconPaths: string[]
}

export const PENDING_HREF = "streamdown:incomplete-link"

// Keeps a chip from stranding the punctuation that follows it on its own
// line: a word joiner forbids a line break on either side of itself.
export const TRAILING_JOINER = "⁠"

const MENTION_TARGETS: MentionTarget[] = ["agent", "session", "note", "memory", "person"]

const FILE_EXTENSIONS = (
  "pdf zip gz tgz tar 7z rar csv tsv xls xlsx ods doc docx odt rtf ppt pptx odp " +
  "txt json xml epub png jpg jpeg gif webp svg avif mp3 wav mp4 mov webm"
).split(" ")

const SCRIPT_SCHEME_PATTERN = /^\s*(?:javascript|data|vbscript):/i
const AVATAR_URL_PATTERN = /^(?:https?:\/\/|\/)/i
const MENTION_PATTERN = /^mention:([a-z]+)\/(.+)$/i
const GEO_PATTERN =
  /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,-?\d+(?:\.\d+)?)?(?:;[^\s]*)?$/i
const WEB_PATTERN = /^https?:\/\/([^\s\/?#]+)([^?#\s]*)(?:[?#]\S*)?$/i
const WHITESPACE_PATTERN = /\s/

function indexOfValue(values: string[], value: string) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return index
  }
  return -1
}

function classifyMention(href: string): Classification | null {
  const match = MENTION_PATTERN.exec(href)
  if (!match || indexOfValue(MENTION_TARGETS, match[1]) === -1) return null
  try {
    return { kind: "mention", target: match[1] as MentionTarget, id: decodeURIComponent(match[2]) }
  } catch (error) {
    // Malformed percent-encoding: an authoring mistake, so a Plain Link.
    return null
  }
}

function classifyLocation(href: string): Classification | null {
  const match = GEO_PATTERN.exec(href)
  if (!match) return null
  const latitude = parseFloat(match[1])
  const longitude = parseFloat(match[2])
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { kind: "location", latitude, longitude }
}

function classifyWeb(href: string): Classification | null {
  const match = WEB_PATTERN.exec(href)
  if (!match) return null
  const lastSegment = match[2].substring(match[2].lastIndexOf("/") + 1)
  const dot = lastSegment.lastIndexOf(".")
  const extension = dot === -1 ? "" : lastSegment.substring(dot + 1).toLowerCase()
  if (extension && indexOfValue(FILE_EXTENSIONS, extension) !== -1) {
    return { kind: "file", extension }
  }
  return { kind: "url" }
}

// A pure, synchronous function of the href. Order matters: mention, location,
// file, URL, then None (anchors, relative paths, mailto:, tel:, malformed
// hrefs and the streaming placeholder).
export function classify(href: string | null | undefined): Classification {
  if (typeof href !== "string") return { kind: "none" }
  const trimmed = href.replace(/^\s+|\s+$/g, "")
  if (trimmed === PENDING_HREF) return { kind: "none", pending: true }
  if (trimmed === "" || WHITESPACE_PATTERN.test(trimmed)) return { kind: "none" }

  return (
    classifyMention(trimmed) ||
    classifyLocation(trimmed) ||
    classifyWeb(trimmed) || { kind: "none" }
  )
}

// A href that can run script when followed. Shells render its label as text.
export function isScriptHref(href: string) {
  return SCRIPT_SCHEME_PATTERN.test(href)
}

// An avatar must come from the app's own proxy: an http(s) or root-relative
// url. Anything else is dropped and the kind icon stays.
export function isAvatarUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && AVATAR_URL_PATTERN.test(url)
}

const MENTION_LABELS: Record<MentionTarget, string> = {
  agent: "Agent",
  session: "Session",
  note: "Note",
  memory: "Memory",
  person: "Person",
}

const ICON_PATHS: Record<string, string[]> = {
  url: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
  file: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
  location: [
    "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z",
    "M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  ],
  agent: [
    "M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z",
    "M12 8V4",
    "M9 14v.01",
    "M15 14v.01",
  ],
  session: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  note: [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
    "M14 2v4a2 2 0 0 0 2 2h4",
    "M8 13h8",
    "M8 17h5",
  ],
  memory: ["m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"],
  person: [
    "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",
    "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  ],
}

// How a classified link is presented. `null` for None: a Plain Link is not a
// pill, so there is nothing to describe.
export function describeLink(classification: Classification): LinkDescription | null {
  if (classification.kind === "mention") {
    const label = MENTION_LABELS[classification.target]
    return {
      kind: "mention",
      modifiers: ["link-pill--mention", "link-pill--" + classification.target],
      kindTag: label,
      srPrefix: label + ": ",
      icon: classification.target,
      iconPaths: ICON_PATHS[classification.target],
    }
  }
  if (classification.kind === "file") {
    const tag = classification.extension.toUpperCase()
    return {
      kind: "file",
      modifiers: ["link-pill--file"],
      kindTag: tag,
      srPrefix: tag + " file: ",
      icon: "file",
      iconPaths: ICON_PATHS.file,
    }
  }
  if (classification.kind === "location") {
    return {
      kind: "location",
      modifiers: ["link-pill--location"],
      kindTag: "Map",
      srPrefix: "Map location: ",
      icon: "location",
      iconPaths: ICON_PATHS.location,
    }
  }
  if (classification.kind === "url") {
    return {
      kind: "url",
      modifiers: ["link-pill--url"],
      kindTag: "",
      srPrefix: "",
      icon: "url",
      iconPaths: ICON_PATHS.url,
    }
  }
  return null
}
