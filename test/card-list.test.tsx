import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CardList, CardListGroup, CardListItem } from "../registry/base-nova/blocks/card-list"

afterEach(cleanup)

const LONG_TITLE =
  "A very long card title that keeps going well past the width of a 320 pixel phone screen and must wrap, never be cut, never widening the page"

describe("CardList", () => {
  it("is a plain container that keeps its children inside the page width", () => {
    const { container } = render(
      <CardList className="extra">
        <CardListGroup heading="argus" />
      </CardList>,
    )

    const root = container.querySelector("[data-slot=card-list]")!
    expect(root.className).toContain("min-w-0")
    expect(root.className).toContain("extra")
  })
})

describe("CardListGroup", () => {
  it("labels its region with the group heading", () => {
    render(<CardListGroup heading="argus" />)

    const region = screen.getByRole("region", { name: "argus" })
    expect(region.getAttribute("data-slot")).toBe("card-list-group")
    expect(screen.getByRole("heading", { level: 2, name: "argus" })).toBeTruthy()
  })

  it("uses the heading level it is given", () => {
    render(<CardListGroup heading="argus" headingLevel={3} />)

    expect(screen.getByRole("heading", { level: 3, name: "argus" })).toBeTruthy()
  })

  it("shows the item count beside the heading when given", () => {
    render(<CardListGroup heading="argus" count={12} />)

    const count = screen.getByText("12")
    expect(count.getAttribute("data-slot")).toBe("card-list-group-count")
  })

  it("lists its cards, one list item each", () => {
    render(
      <CardListGroup heading="argus">
        <CardListItem title="First" />
        <CardListItem title="Second" />
      </CardListGroup>,
    )

    const list = screen.getByRole("list")
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
  })

  describe("empty group", () => {
    it("keeps the heading and says the group is empty, with no list", () => {
      render(<CardListGroup heading="homelab" />)

      expect(screen.getByRole("heading", { name: "homelab" })).toBeTruthy()
      expect(screen.getByText("Nothing here")).toBeTruthy()
      expect(screen.queryByRole("list")).toBeNull()
    })

    it("takes its own empty message", () => {
      render(<CardListGroup heading="homelab" empty="No open items" />)

      expect(screen.getByText("No open items")).toBeTruthy()
    })

    it("counts null and false children as empty", () => {
      render(
        <CardListGroup heading="homelab">
          {null}
          {false}
        </CardListGroup>,
      )

      expect(screen.queryByRole("list")).toBeNull()
      expect(screen.getByText("Nothing here")).toBeTruthy()
    })
  })
})

describe("CardListItem", () => {
  it("puts the title on the first row and the details on the second", () => {
    const { container } = render(
      <CardListItem
        title="Fix the promotion card"
        status="Active"
        branch="fix/promotion-card"
        check="Passing"
        time="2m ago"
      />,
    )

    const rows = container.querySelectorAll("[data-slot=card-list-item-row]")
    expect(rows).toHaveLength(2)
    expect(within(rows[0] as HTMLElement).getByText("Fix the promotion card")).toBeTruthy()

    const second = rows[1] as HTMLElement
    const order = ["Active", "fix/promotion-card", "Passing", "2m ago"].map((text) =>
      within(second).getByText(text),
    )
    order.forEach((node, index) => {
      if (index === 0) return
      expect(order[index - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  it("renders no second row, and no empty slots, when it has no details", () => {
    const { container } = render(<CardListItem title="Only a title" />)

    expect(container.querySelectorAll("[data-slot=card-list-item-row]")).toHaveLength(1)
    expect(container.querySelector("[data-slot=card-list-item-branch]")).toBeNull()
    expect(container.querySelector("[data-slot=card-list-item-time]")).toBeNull()
  })

  it("sets the branch in monospace and lets it shrink and wrap", () => {
    render(<CardListItem title="T" branch="feat/188-grouped-two-row-card" />)

    const branch = screen.getByText("feat/188-grouped-two-row-card")
    expect(branch.className).toContain("font-mono")
    expect(branch.className).toContain("wrap-anywhere")
    expect(branch.className).not.toMatch(/\btruncate\b/)
    expect(branch.className).toContain("min-w-0")
  })

  it("keeps the status, check and time at full width and pushes the time to the right edge", () => {
    render(<CardListItem title="T" status="Working" check="Running" time="now" />)

    expect(screen.getByText("Working").className).toContain("shrink-0")
    expect(screen.getByText("Running").className).toContain("shrink-0")
    const time = screen.getByText("now")
    expect(time.className).toContain("shrink-0")
    expect(time.className).toContain("ml-auto")
  })

  describe("wrapping (design-system#205)", () => {
    it("wraps a long title in full, and breaks a token with no spaces, without widening its card", () => {
      render(<CardListItem title={LONG_TITLE} />)

      const title = screen.getByText(LONG_TITLE)
      expect(title.className).toContain("wrap-anywhere")
      expect(title.className).toContain("min-w-0")
      expect(title.className).not.toMatch(/\btruncate\b|line-clamp/)
    })

    it("sets no tooltip on the title, because nothing is cut off", () => {
      render(<CardListItem title={LONG_TITLE} />)

      expect(screen.getByText(LONG_TITLE).getAttribute("title")).toBeNull()
    })

    it("wraps a long group heading", () => {
      render(<CardListGroup heading={LONG_TITLE} />)

      const heading = screen.getByText(LONG_TITLE)
      expect(heading.className).toContain("wrap-anywhere")
      expect(heading.className).not.toMatch(/\btruncate\b/)
    })

    it("clips the card itself, so nothing inside can push the page wider", () => {
      const { container } = render(<CardListItem title={LONG_TITLE} branch={LONG_TITLE} />)

      const card = container.querySelector("[data-slot=card-list-item]")!
      expect(card.className).toContain("min-w-0")
      expect(card.className).toContain("overflow-hidden")
      // A button sizes to its content, not to its container, so a long title would widen the page
      // unless the card is told to fill the list item (found in WebKit at 390 px, design-system#188).
      expect(card.className).toMatch(/(^|\s)w-full(\s|$)/)
      expect(container.querySelector("li")!.className).toContain("min-w-0")
    })
  })

  describe("touch size", () => {
    it("is at least 44px tall, whatever it holds", () => {
      const { container } = render(<CardListItem title="Short" />)

      expect(container.querySelector("[data-slot=card-list-item]")!.className).toContain("min-h-11")
    })
  })

  describe("active card", () => {
    it("marks the active card for assistive tech and styling, and raises it", () => {
      const { container } = render(<CardListItem title="Open one" active />)

      const card = container.querySelector("[data-slot=card-list-item]")!
      expect(card.getAttribute("aria-current")).toBe("true")
      expect(card.getAttribute("data-active")).toBe("true")
      expect(card.className).toContain("shadow-md")
    })

    it("leaves a card that is not active flat and unmarked", () => {
      const { container } = render(<CardListItem title="Other one" />)

      const card = container.querySelector("[data-slot=card-list-item]")!
      expect(card.getAttribute("aria-current")).toBeNull()
      expect(card.getAttribute("data-active")).toBeNull()
      expect(card.className).not.toContain("shadow-md")
    })
  })

  describe("render", () => {
    it("is a div until it is told what to be", () => {
      const { container } = render(<CardListItem title="Static" />)

      expect(container.querySelector("[data-slot=card-list-item]")!.tagName).toBe("DIV")
    })

    it("becomes the link or button it is given, keeping its layout and its label", () => {
      render(
        <CardList>
          <CardListGroup heading="argus">
            <CardListItem title="Go" render={<a href="/items/1" />} />
            <CardListItem title="Act" render={<button type="button" />} />
          </CardListGroup>
        </CardList>,
      )

      const link = screen.getByRole("link", { name: /Go/ })
      expect(link.getAttribute("href")).toBe("/items/1")
      expect(link.getAttribute("data-slot")).toBe("card-list-item")
      expect(screen.getByRole("button", { name: /Act/ })).toBeTruthy()
    })

    it("shows a focus ring on an interactive card", () => {
      render(<CardListItem title="Go" render={<a href="/x" />} />)

      expect(screen.getByRole("link").className).toContain("focus-visible:ring-")
    })
  })
})
