import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Enricher } from "../registry/lib/link-pill-core"
import { LinkPill, LinkPillEnricherProvider } from "../registry/base-nova/ui/link-pill"

// jsdom's name computation drops the space between the visually-hidden kind
// prefix and the label; real browsers keep it. Accept either.
function named(text: string) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^${escaped.replace(": ", ":\\s?")}$`)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("LinkPill", () => {
  it("renders immediately from the href and link text, with no Enricher", () => {
    render(<LinkPill href="https://example.com/survey-results.pdf">survey-results.pdf</LinkPill>)
    const link = screen.getByRole("link", { name: named("PDF file: survey-results.pdf") })
    expect(link.getAttribute("href")).toBe("https://example.com/survey-results.pdf")
    expect(link.className).toContain("link-pill link-pill--file link-pill--inline")
  })

  it("renders a real, focusable anchor with an aria-hidden icon", () => {
    render(<LinkPill href="mention:agent/tex">Tex</LinkPill>)
    const link = screen.getByRole("link", { name: named("Agent: Tex") })
    expect(link.tagName).toBe("A")
    expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    link.focus()
    expect(document.activeElement).toBe(link)
  })

  it("adds the mention-target modifier and the chip variant", () => {
    render(
      <LinkPill href="mention:note/CORTEX/PROJECTS/Stockade" variant="chip">
        PROJECTS/Stockade
      </LinkPill>,
    )
    expect(screen.getByRole("link").className).toBe(
      "link-pill link-pill--mention link-pill--note link-pill--chip",
    )
  })

  it("announces nothing extra for a URL link", () => {
    render(<LinkPill href="https://example.com/post">A blog post</LinkPill>)
    expect(screen.getByRole("link", { name: "A blog post" })).toBeTruthy()
  })

  it("keeps the full label as the accessible name and title on a truncated chip", () => {
    const label = "A very long label that will be cut by CSS at about twenty-four characters"
    render(
      <LinkPill href="https://example.com/" variant="chip">
        {label}
      </LinkPill>,
    )
    const link = screen.getByRole("link", { name: label })
    expect(link.getAttribute("title")).toBe(label)
    expect(link.textContent).toContain(label)
  })

  it("follows a chip with a word joiner, and an inline pill with nothing", () => {
    const { container, rerender } = render(
      <LinkPill href="https://example.com/" variant="chip">
        x
      </LinkPill>,
    )
    expect(container.textContent?.endsWith("⁠")).toBe(true)
    rerender(<LinkPill href="https://example.com/">x</LinkPill>)
    expect(container.textContent?.endsWith("⁠")).toBe(false)
  })

  it("renders a Plain Link for kind None, passing anchor props through", () => {
    render(
      <LinkPill href="#section" className="extra" target="_blank">
        jump
      </LinkPill>,
    )
    const link = screen.getByRole("link", { name: "jump" })
    expect(link.className).toBe("extra")
    expect(link.getAttribute("target")).toBe("_blank")
  })

  it("renders the streaming placeholder as plain text with no anchor", () => {
    const { container } = render(<LinkPill href="streamdown:incomplete-link">half written</LinkPill>)
    expect(screen.queryByRole("link")).toBeNull()
    expect(container.textContent).toBe("half written")
  })

  it("renders no anchor for a script-scheme href", () => {
    render(<LinkPill href="javascript:alert(1)">click</LinkPill>)
    expect(screen.queryByRole("link")).toBeNull()
  })

  describe("Enrichment", () => {
    it("upgrades the pill when the Enricher resolves", async () => {
      const enrich: Enricher = vi.fn(async () => ({
        label: "Tex (manager)",
        avatarUrl: "https://cdn.example.com/tex.png",
        title: "Tex, the vault manager",
      }))
      render(
        <LinkPillEnricherProvider enrich={enrich}>
          <LinkPill href="mention:agent/tex" variant="chip">
            Tex
          </LinkPill>
        </LinkPillEnricherProvider>,
      )
      expect(screen.getByRole("link", { name: named("Agent: Tex") })).toBeTruthy()

      const upgraded = await screen.findByRole("link", { name: named("Agent: Tex (manager)") })
      expect(upgraded.getAttribute("title")).toBe("Tex, the vault manager")
      expect(upgraded.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example.com/tex.png")
      expect(upgraded.querySelector("svg")).toBeNull()
      expect(enrich).toHaveBeenCalledWith({
        href: "mention:agent/tex",
        label: "Tex",
        classification: { kind: "mention", target: "agent", id: "tex" },
      })
    })

    it("leaves the pill as rendered when the Enricher resolves null", async () => {
      const enrich: Enricher = vi.fn(async () => null)
      const error = vi.spyOn(console, "error").mockImplementation(() => {})
      render(
        <LinkPillEnricherProvider enrich={enrich}>
          <LinkPill href="mention:agent/tex">Tex</LinkPill>
        </LinkPillEnricherProvider>,
      )
      await waitFor(() => expect(enrich).toHaveBeenCalledTimes(1))
      await act(async () => {})
      expect(screen.getByRole("link", { name: named("Agent: Tex") })).toBeTruthy()
      expect(error).not.toHaveBeenCalled()
    })

    it("leaves the pill as rendered and logs the error when the Enricher rejects", async () => {
      const failure = new Error("lookup failed")
      const enrich: Enricher = vi.fn(async () => {
        throw failure
      })
      const error = vi.spyOn(console, "error").mockImplementation(() => {})
      render(
        <LinkPillEnricherProvider enrich={enrich}>
          <LinkPill href="mention:person/Jane%20Citizen">Jane Citizen</LinkPill>
        </LinkPillEnricherProvider>,
      )
      await waitFor(() => expect(error).toHaveBeenCalledTimes(1))
      expect(error.mock.calls[0]).toContain(failure)
      expect(screen.getByRole("link", { name: named("Person: Jane Citizen") })).toBeTruthy()
    })

    it("only enriches Mentions and URL links", async () => {
      const enrich: Enricher = vi.fn(async () => ({ label: "enriched" }))
      render(
        <LinkPillEnricherProvider enrich={enrich}>
          <LinkPill href="https://example.com/a.pdf">a.pdf</LinkPill>
          <LinkPill href="geo:1,2">spot</LinkPill>
          <LinkPill href="#top">top</LinkPill>
          <LinkPill href="streamdown:incomplete-link">pending</LinkPill>
        </LinkPillEnricherProvider>,
      )
      await act(async () => {})
      expect(enrich).not.toHaveBeenCalled()
    })

    it("caches an Enrichment for the session, per href", async () => {
      const enrich: Enricher = vi.fn(async () => ({ label: "Cached" }))
      render(
        <LinkPillEnricherProvider enrich={enrich}>
          <LinkPill href="https://example.com/same">one</LinkPill>
          <LinkPill href="https://example.com/same">two</LinkPill>
          <LinkPill href="https://example.com/other">three</LinkPill>
        </LinkPillEnricherProvider>,
      )
      await waitFor(() => expect(screen.getAllByRole("link", { name: "Cached" })).toHaveLength(3))
      expect(enrich).toHaveBeenCalledTimes(2)
    })

    it("does not re-ask after a failure", async () => {
      const enrich: Enricher = vi.fn(async () => {
        throw new Error("down")
      })
      vi.spyOn(console, "error").mockImplementation(() => {})
      const { rerender } = render(
        <LinkPillEnricherProvider enrich={enrich}>
          <LinkPill href="https://example.com/x">x</LinkPill>
        </LinkPillEnricherProvider>,
      )
      await waitFor(() => expect(enrich).toHaveBeenCalledTimes(1))
      rerender(
        <LinkPillEnricherProvider enrich={enrich}>
          <LinkPill href="https://example.com/x">x again</LinkPill>
        </LinkPillEnricherProvider>,
      )
      await act(async () => {})
      expect(enrich).toHaveBeenCalledTimes(1)
    })
  })
})
