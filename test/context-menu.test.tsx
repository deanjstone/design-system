import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../registry/base-nova/ui/context-menu"

afterEach(cleanup)

function Surface({ onSelect }: { onSelect?: () => void }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>Canvas area</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onSelect}>Copy</ContextMenuItem>
        <ContextMenuItem>Paste</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

describe("ContextMenu", () => {
  it("opens on the context-menu gesture and moves focus through items with the arrow keys", () => {
    render(<Surface />)

    fireEvent.contextMenu(screen.getByText("Canvas area"))
    const menu = screen.getByRole("menu")

    fireEvent.keyDown(menu, { key: "ArrowDown" })
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Copy" }))

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" })
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Paste" }))
  })

  it("runs an item's action on Enter and closes on Escape", () => {
    const onSelect = vi.fn()
    render(<Surface onSelect={onSelect} />)

    fireEvent.contextMenu(screen.getByText("Canvas area"))
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" })
    fireEvent.keyDown(document.activeElement as Element, { key: "Enter" })
    expect(onSelect).toHaveBeenCalledTimes(1)

    fireEvent.contextMenu(screen.getByText("Canvas area"))
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
