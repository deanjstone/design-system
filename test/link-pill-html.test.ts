// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { renderLinkPill } from "../registry/lib/link-pill-html"

const links = {
  agent: { href: "mention:agent/tex", label: "Tex" },
  session: { href: "mention:session/abc-123", label: "Fix the build" },
  note: { href: "mention:note/CORTEX/PROJECTS/Stockade", label: "PROJECTS/Stockade" },
  memory: { href: "mention:memory/fact_bitwarden", label: "fact_bitwarden" },
  person: { href: "mention:person/Jane%20Citizen", label: "Jane Citizen" },
  file: { href: "https://example.com/survey-results.pdf", label: "survey-results.pdf" },
  location: { href: "geo:-37.8,144.97", label: "Fitzroy Town Hall" },
  url: { href: "https://example.com/post", label: "A blog post" },
}

describe("renderLinkPill", () => {
  describe.each(["inline", "chip"] as const)("%s variant", (variant) => {
    it.each(Object.entries(links))("renders a %s link", (_name, link) => {
      expect(renderLinkPill(link, { variant })).toMatchSnapshot()
    })
  })

  it("defaults to the inline variant", () => {
    expect(renderLinkPill(links.url)).toBe(renderLinkPill(links.url, { variant: "inline" }))
    expect(renderLinkPill(links.url)).toContain("link-pill--inline")
  })

  it("emits semantic classes and the real href on a real anchor", () => {
    const html = renderLinkPill(links.file, { variant: "chip" })
    expect(html).toMatch(/^<a class="link-pill link-pill--file link-pill--chip"/)
    expect(html).toContain('href="https://example.com/survey-results.pdf"')
    expect(html).not.toMatch(/class="[^"]*\b(?:flex|px-\d|bg-\w+)\b/)
  })

  it("adds the mention-target modifier", () => {
    expect(renderLinkPill(links.note, { variant: "chip" })).toContain(
      "link-pill link-pill--mention link-pill--note link-pill--chip",
    )
  })

  it("announces the kind in visually-hidden text and hides the icon", () => {
    const html = renderLinkPill(links.file)
    expect(html).toContain('<span class="link-pill__sr">PDF file: </span>')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('<span class="link-pill__label">survey-results.pdf</span>')
  })

  it("announces nothing extra for a URL link", () => {
    expect(renderLinkPill(links.url)).not.toContain("link-pill__sr")
  })

  it("keeps the full label as the title on a chip", () => {
    const label = "A very long label that will be cut by CSS at about twenty-four characters"
    const html = renderLinkPill({ href: "https://example.com/", label }, { variant: "chip" })
    expect(html).toContain(`title="${label}"`)
    expect(html).toContain(`<span class="link-pill__label">${label}</span>`)
  })

  it("follows a chip with a word joiner so punctuation cannot be stranded", () => {
    expect(renderLinkPill(links.url, { variant: "chip" }).endsWith("</a>⁠")).toBe(true)
    expect(renderLinkPill(links.url, { variant: "inline" }).endsWith("</a>")).toBe(true)
  })

  describe("escaping", () => {
    it("escapes a script tag in the label", () => {
      const html = renderLinkPill({ href: "https://example.com/", label: "<script>alert(1)</script>" })
      expect(html).not.toContain("<script>")
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    })

    it("escapes quotes and ampersands in the href", () => {
      const html = renderLinkPill({ href: 'https://example.com/?a=1&b="2"', label: "x" })
      expect(html).toContain('href="https://example.com/?a=1&amp;b=&quot;2&quot;"')
    })

    it("escapes an enrichment title and avatar url", () => {
      const html = renderLinkPill(links.agent, {
        variant: "chip",
        enrichment: { title: '"><img src=x onerror=1>', avatarUrl: 'https://cdn.example.com/a.png"onerror="1' },
      })
      expect(html).not.toContain("<img src=x")
      expect(html).not.toContain('"onerror="1')
    })

    it("escapes the label of a Plain Link", () => {
      const html = renderLinkPill({ href: "#top", label: "<b>x</b>" })
      expect(html).toBe('<a href="#top">&lt;b&gt;x&lt;/b&gt;</a>')
    })
  })

  describe("Plain Link", () => {
    it.each(["#section", "/docs/page", "mailto:a@example.com", "tel:+61400000000", "mention:robot/x"])(
      "renders %s as an ordinary anchor",
      (href) => {
        const html = renderLinkPill({ href, label: "text" })
        expect(html).toBe(`<a href="${href}">text</a>`)
        expect(html).not.toContain("link-pill")
      },
    )

    it("renders a script-scheme href as plain text, not a link", () => {
      expect(renderLinkPill({ href: "javascript:alert(1)", label: "click" })).toBe("click")
    })
  })

  describe("streaming placeholder", () => {
    it("renders the label as plain text with no anchor and no pill", () => {
      const html = renderLinkPill({ href: "streamdown:incomplete-link", label: "half & written" })
      expect(html).toBe("half &amp; written")
    })
  })

  describe("legacy: true", () => {
    it.each([
      [links.file, "PDF · survey-results.pdf"],
      [links.location, "Map · Fitzroy Town Hall"],
      [links.note, "Note · PROJECTS/Stockade"],
      [links.session, "Session · Fix the build"],
      [links.agent, "Agent · Tex"],
      [links.memory, "Memory · fact_bitwarden"],
      [links.person, "Person · Jane Citizen"],
    ])("prefixes a Kind Tag: %j", (link, text) => {
      expect(renderLinkPill(link, { legacy: true })).toBe(`<a href="${link.href}">${text}</a>`)
    })

    it("adds nothing for a URL link", () => {
      expect(renderLinkPill(links.url, { legacy: true })).toBe(
        '<a href="https://example.com/post">A blog post</a>',
      )
    })

    it("uses no pill classes, svg or non-ASCII glyphs other than the separator", () => {
      const html = renderLinkPill(links.file, { legacy: true, variant: "chip" })
      expect(html).not.toContain("link-pill")
      expect(html).not.toContain("<svg")
      expect(html).not.toContain("⁠")
      expect(html.replace("·", "")).toMatch(/^[\x20-\x7e]*$/)
    })

    it("still renders the placeholder as plain text", () => {
      expect(renderLinkPill({ href: "streamdown:incomplete-link", label: "x" }, { legacy: true })).toBe("x")
    })
  })

  describe("enrichment", () => {
    it("uses an enriched label", () => {
      const html = renderLinkPill(links.agent, { enrichment: { label: "Tex (manager)" } })
      expect(html).toContain('<span class="link-pill__label">Tex (manager)</span>')
    })

    it("swaps the icon for an avatar on a chip", () => {
      const html = renderLinkPill(links.person, {
        variant: "chip",
        enrichment: { avatarUrl: "https://cdn.example.com/jane.png" },
      })
      expect(html).toContain('<img class="link-pill__avatar" src="https://cdn.example.com/jane.png" alt="" aria-hidden="true">')
      expect(html).not.toContain("<svg")
    })

    it("refuses an avatar url that is not http(s) or root-relative", () => {
      const html = renderLinkPill(links.person, {
        variant: "chip",
        enrichment: { avatarUrl: "javascript:alert(1)" },
      })
      expect(html).not.toContain("<img")
      expect(html).toContain("<svg")
    })

    it("ignores a null enrichment", () => {
      expect(renderLinkPill(links.agent, { enrichment: null })).toBe(renderLinkPill(links.agent))
    })
  })

  it("imports only the core", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../registry/lib/link-pill-html.ts", import.meta.url)),
      "utf8",
    )
    const specifiers = [...source.matchAll(/(?:^|\s)(?:from|import)\s+["']([^"']+)["']/gm)].map(
      (match) => match[1],
    )
    expect(specifiers).toEqual(["./link-pill-core"])
  })
})
