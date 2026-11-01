import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CardDescription, CardTitle } from "../registry/base-nova/ui/card"

afterEach(cleanup)

// Past 200% text (design-system#150, #164): at 310% on 320px a single word such as
// "description" is wider than the card's text column, so it may break mid-word rather than
// push the card past the viewport. At 100% no word is wider than the column and nothing changes.
describe("Card text at large text", () => {
  it("lets a title break a word that is wider than the card", () => {
    render(<CardTitle>Title</CardTitle>)
    expect(screen.getByText("Title").getAttribute("class")).toContain("wrap-anywhere")
  })

  it("lets a description break a word that is wider than the card", () => {
    render(<CardDescription>Description</CardDescription>)
    expect(screen.getByText("Description").getAttribute("class")).toContain("wrap-anywhere")
  })
})
