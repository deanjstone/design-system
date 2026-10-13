// HTML-string shell of LinkPill, for server-side Markdown renderers (marked's
// renderer.link) and DOMPurify hooks. Depends on the core only; no React, no
// Tailwind. Every label and attribute is escaped here, but the output should
// still be sanitised by the consumer afterwards.

import {
  TRAILING_JOINER,
  classify,
  describeLink,
  isAvatarUrl,
  isScriptHref,
  type Enrichment,
  type LinkPillVariant,
} from "./link-pill-core"

export type RenderLinkPillOptions = {
  variant?: LinkPillVariant
  // Safari 9: a Plain Link prefixed with a text Kind Tag, no pill and no glyphs.
  legacy?: boolean
  // Already-resolved Enrichment. This shell is synchronous, so the host looks
  // it up (and caches it) before rendering.
  enrichment?: Enrichment | null
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character])
}

function iconSvg(iconPaths: string[]) {
  const paths = iconPaths.map((d) => '<path d="' + d + '"/>').join("")
  return (
    '<svg class="link-pill__icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" focusable="false">' +
    paths +
    "</svg>"
  )
}

export function renderLinkPill(
  link: { href: string; label: string },
  options: RenderLinkPillOptions = {},
): string {
  const variant = options.variant === "chip" ? "chip" : "inline"
  const enrichment = options.enrichment || null
  const label = (enrichment && enrichment.label) || link.label
  const classification = classify(link.href)

  if (classification.kind === "none") {
    if (classification.pending || isScriptHref(link.href)) return escapeHtml(label)
    return '<a href="' + escapeHtml(link.href) + '">' + escapeHtml(label) + "</a>"
  }

  const description = describeLink(classification)!
  const href = escapeHtml(link.href)

  if (options.legacy) {
    const tag = description.kindTag ? description.kindTag + " · " : ""
    return '<a href="' + href + '">' + escapeHtml(tag + label) + "</a>"
  }

  const className = ["link-pill"].concat(description.modifiers, "link-pill--" + variant).join(" ")
  const title = variant === "chip" ? (enrichment && enrichment.title) || label : enrichment && enrichment.title
  const avatarUrl = variant === "chip" && enrichment ? enrichment.avatarUrl : null
  const lead = isAvatarUrl(avatarUrl)
    ? '<img class="link-pill__avatar" src="' + escapeHtml(avatarUrl) + '" alt="" aria-hidden="true">'
    : iconSvg(description.iconPaths)
  const announcement = description.srPrefix
    ? '<span class="link-pill__sr">' + escapeHtml(description.srPrefix) + "</span>"
    : ""

  return (
    '<a class="' + className + '" href="' + href + '"' +
    (title ? ' title="' + escapeHtml(title) + '"' : "") +
    ">" + lead + announcement +
    '<span class="link-pill__label">' + escapeHtml(label) + "</span></a>" +
    (variant === "chip" ? TRAILING_JOINER : "")
  )
}
