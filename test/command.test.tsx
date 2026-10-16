import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../registry/base-nova/ui/command"

// cmdk measures its list and scrolls the selected item into view; jsdom has
// neither API.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(cleanup)

function renderMenu(onSelect = vi.fn()) {
  render(
    <Command>
      <CommandInput placeholder="Search commands" />
      <CommandList>
        <CommandEmpty>No commands</CommandEmpty>
        <CommandGroup heading="Commands">
          <CommandItem onSelect={onSelect}>/compact</CommandItem>
          <CommandItem onSelect={onSelect}>/clear</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
  return onSelect
}

describe("Command", () => {
  it("lists every item and selects the first", () => {
    renderMenu()
    const options = screen.getAllByRole("option")

    expect(options.map((option) => option.textContent)).toEqual(["/compact", "/clear"])
    expect(options[0].getAttribute("data-selected")).toBe("true")
  })

  it("filters items by the input and shows CommandEmpty when nothing matches", () => {
    renderMenu()
    const input = screen.getByPlaceholderText("Search commands")

    fireEvent.change(input, { target: { value: "cle" } })
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["/clear"])

    fireEvent.change(input, { target: { value: "zzz" } })
    expect(screen.queryAllByRole("option")).toEqual([])
    expect(screen.getByText("No commands")).toBeTruthy()
  })

  it("calls onSelect with the item value on click", () => {
    const onSelect = renderMenu()

    fireEvent.click(screen.getByRole("option", { name: "/clear" }))
    expect(onSelect).toHaveBeenCalledWith("/clear")
  })

  it("renders the search icon inside the input group", () => {
    renderMenu()
    const wrapper = screen.getByPlaceholderText("Search commands").closest("[data-slot=input-group]")

    expect(wrapper?.querySelector("svg.lucide-search")).not.toBeNull()
  })
})

describe("CommandDialog", () => {
  it("renders the command inside an accessible dialog when open", () => {
    render(
      <CommandDialog open title="Go to">
        <Command>
          <CommandList>
            <CommandItem>Settings</CommandItem>
          </CommandList>
        </Command>
      </CommandDialog>
    )

    expect(screen.getByRole("dialog", { name: "Go to" })).toBeTruthy()
    expect(screen.getByRole("option", { name: "Settings" })).toBeTruthy()
  })
})
