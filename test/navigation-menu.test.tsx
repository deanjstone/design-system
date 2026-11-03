import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "../registry/base-nova/ui/navigation-menu"

afterEach(cleanup)

function SiteNav() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          <NavigationMenuContent>
            <NavigationMenuLink href="/argus">Argus</NavigationMenuLink>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="/about">About</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}

describe("NavigationMenu", () => {
  it("opens a trigger's panel with Enter from the keyboard", () => {
    render(<SiteNav />)

    const trigger = screen.getByRole("button", { name: "Products" })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(trigger)

    expect(screen.getByRole("link", { name: "Argus" }).getAttribute("href")).toBe("/argus")
  })

  it("exposes plain links alongside the triggers", () => {
    render(<SiteNav />)

    expect(screen.getByRole("link", { name: "About" }).getAttribute("href")).toBe("/about")
  })
})
