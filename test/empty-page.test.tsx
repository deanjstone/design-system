import { cleanup, render, screen } from "@testing-library/react"
import { InboxIcon } from "lucide-react"
import { afterEach, describe, expect, it } from "vitest"

import { EmptyPage } from "../registry/base-nova/blocks/empty-page"

afterEach(cleanup)

describe("EmptyPage", () => {
  it("shows the title and description", () => {
    render(<EmptyPage title="No messages" description="New mail lands here." />)

    expect(screen.getByText("No messages")).toBeTruthy()
    expect(screen.getByText("New mail lands here.")).toBeTruthy()
  })

  it("composes the registry Empty item", () => {
    const { container } = render(<EmptyPage title="No messages" />)

    expect(container.querySelector("[data-slot=empty]")).not.toBeNull()
    expect(container.querySelector("[data-slot=empty-title]")?.textContent).toBe("No messages")
  })

  it("puts the icon in the icon-variant media slot", () => {
    const { container } = render(<EmptyPage title="No messages" icon={<InboxIcon />} />)

    const media = container.querySelector("[data-slot=empty-icon]")
    expect(media?.getAttribute("data-variant")).toBe("icon")
    expect(media?.querySelector("svg")).not.toBeNull()
  })

  it("renders the action under the text", () => {
    render(<EmptyPage title="No messages" action={<button type="button">Compose</button>} />)

    expect(screen.getByRole("button", { name: "Compose" }).closest("[data-slot=empty-content]")).not.toBeNull()
  })

  it("leaves out the media, description and action when none are given", () => {
    const { container } = render(<EmptyPage title="No messages" />)

    expect(container.querySelector("[data-slot=empty-icon]")).toBeNull()
    expect(container.querySelector("[data-slot=empty-description]")).toBeNull()
    expect(container.querySelector("[data-slot=empty-content]")).toBeNull()
  })

  it("fills the room left by the shell instead of a fixed height", () => {
    const { container } = render(<EmptyPage title="No messages" />)

    expect(container.querySelector("[data-slot=empty]")?.className).toContain("flex-1")
  })
})
