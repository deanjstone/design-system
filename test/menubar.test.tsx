import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "../registry/base-nova/ui/menubar"

afterEach(cleanup)

function AppMenubar() {
  return (
    <Menubar>
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>New tab</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>Undo</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

describe("Menubar", () => {
  it("renders a menubar whose triggers are menu items", () => {
    render(<AppMenubar />)

    expect(screen.getByRole("menubar")).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "File" }).getAttribute("aria-haspopup")).toBe("menu")
  })

  it("opens a menu when its trigger is clicked and lists its items", () => {
    render(<AppMenubar />)

    fireEvent.click(screen.getByRole("menuitem", { name: "File" }))

    expect(screen.getByRole("menuitem", { name: "New tab" })).toBeTruthy()
  })
})
