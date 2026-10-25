import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PageHeader } from "../registry/base-nova/blocks/page-header"

afterEach(cleanup)

describe("PageHeader", () => {
  it("titles the page with an h1", () => {
    render(<PageHeader title="Inbox" />)

    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeTruthy()
  })

  it("shows the description under the title in muted text", () => {
    render(<PageHeader title="Inbox" description="Unread first" />)

    const description = screen.getByText("Unread first")
    expect(description.className).toContain("text-muted-foreground")
  })

  it("renders actions beside the title", () => {
    render(<PageHeader title="Inbox" actions={<button type="button">Compose</button>} />)

    const actions = screen.getByRole("button", { name: "Compose" }).closest("[data-slot=page-header-actions]")
    expect(actions).not.toBeNull()
  })

  it("renders no empty description or actions container", () => {
    const { container } = render(<PageHeader title="Inbox" />)

    expect(container.querySelector("[data-slot=page-header-description]")).toBeNull()
    expect(container.querySelector("[data-slot=page-header-actions]")).toBeNull()
  })

  it("stacks on a phone and puts the actions beside the title from sm", () => {
    const { container } = render(<PageHeader title="Inbox" actions={<span>x</span>} />)

    expect(container.querySelector("header")?.className).toMatch(/flex-col.*sm:flex-row/)
  })

  it("passes className through", () => {
    const { container } = render(<PageHeader title="Inbox" className="custom" />)

    expect(container.querySelector("header")?.className).toContain("custom")
  })
})
