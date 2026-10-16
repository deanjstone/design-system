import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../registry/base-nova/ui/breadcrumb"

afterEach(cleanup)

describe("Breadcrumb", () => {
  it("renders a labelled nav with an ordered list and the current page", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/docs">Docs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Button</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )

    const nav = screen.getByRole("navigation", { name: "breadcrumb" })
    expect(nav.querySelector("ol[data-slot=breadcrumb-list]")).not.toBeNull()
    expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toBe("/docs")
    expect(screen.getByText("Button").getAttribute("aria-current")).toBe("page")
  })

  it("defaults the separator to a hidden chevron, and keeps custom children", () => {
    const { container } = render(
      <ol>
        <BreadcrumbSeparator />
        <BreadcrumbSeparator>/</BreadcrumbSeparator>
      </ol>
    )
    const [chevron, slash] = container.querySelectorAll("[data-slot=breadcrumb-separator]")

    expect(chevron.getAttribute("aria-hidden")).toBe("true")
    expect(chevron.querySelector("svg.lucide-chevron-right")).not.toBeNull()
    expect(slash.textContent).toBe("/")
    expect(slash.querySelector("svg")).toBeNull()
  })

  it("keeps an sr-only label on the ellipsis", () => {
    render(<BreadcrumbEllipsis />)

    expect(screen.getByText("More").className).toContain("sr-only")
  })
})

describe("BreadcrumbLink", () => {
  // argusde's file browser renders each path segment as a button.
  it("renders the element passed to render, merging className and handlers", () => {
    const onClick = vi.fn()
    render(
      <BreadcrumbLink className="font-mono" render={<button type="button" />} onClick={onClick}>
        src
      </BreadcrumbLink>
    )
    const button = screen.getByRole("button", { name: "src" })

    expect(button.className).toContain("hover:text-foreground")
    expect(button.className).toContain("font-mono")
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
