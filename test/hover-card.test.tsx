import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { HoverCard, HoverCardContent, HoverCardTrigger } from "../registry/base-nova/ui/hover-card"

afterEach(cleanup)

describe("HoverCard", () => {
  it("shows its content when open and links the trigger to it", () => {
    render(
      <HoverCard open>
        <HoverCardTrigger render={<a href="/profile" />}>@dean</HoverCardTrigger>
        <HoverCardContent>Profile preview</HoverCardContent>
      </HoverCard>,
    )

    expect(screen.getByText("Profile preview")).toBeTruthy()
    expect(screen.getByRole("link", { name: "@dean" }).getAttribute("href")).toBe("/profile")
  })
})
