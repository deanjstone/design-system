import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Item, ItemContent, ItemDescription, ItemTitle } from "../registry/base-nova/ui/item"

// Item text wraps by default (design-system#205): the title and description no longer cut at one and two
// lines, and break a token with no spaces so it cannot widen the item.

afterEach(cleanup)

const LONG = "A very long item title that keeps going well past the width of a 320 pixel phone screen"

describe("Item text", () => {
  it("wraps the title instead of clamping it to one line", () => {
    render(
      <Item>
        <ItemContent>
          <ItemTitle>{LONG}</ItemTitle>
        </ItemContent>
      </Item>,
    )

    const title = screen.getByText(LONG)
    expect(title.className).toContain("wrap-anywhere")
    expect(title.className).not.toMatch(/line-clamp|\btruncate\b/)
  })

  it("wraps the description instead of clamping it to two lines", () => {
    render(<ItemDescription>{LONG}</ItemDescription>)

    const description = screen.getByText(LONG)
    expect(description.className).toContain("wrap-anywhere")
    expect(description.className).not.toMatch(/line-clamp|\btruncate\b/)
  })

  it("lets a consumer clamp the title again with a class", () => {
    render(<ItemTitle className="line-clamp-1">{LONG}</ItemTitle>)

    expect(screen.getByText(LONG).className).toContain("line-clamp-1")
  })
})
