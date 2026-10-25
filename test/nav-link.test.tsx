import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { renderAnchor } from "../registry/lib/nav-link"

afterEach(cleanup)

describe("renderAnchor", () => {
  it("renders a plain anchor carrying every prop", () => {
    render(
      renderAnchor({ href: "/inbox", className: "tab", "aria-current": "page", children: "Inbox" })
    )

    const link = screen.getByRole("link", { name: "Inbox" })
    expect(link.getAttribute("href")).toBe("/inbox")
    expect(link.className).toBe("tab")
    expect(link.getAttribute("aria-current")).toBe("page")
  })
})
