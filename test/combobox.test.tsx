import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "../registry/base-nova/ui/combobox"

afterEach(cleanup)

const FRUITS = ["Apple", "Banana", "Cherry"]

function Fruit({ onValueChange }: { onValueChange?: (value: string | null) => void }) {
  return (
    <Combobox items={FRUITS} onValueChange={onValueChange}>
      <ComboboxInput placeholder="Search fruit" aria-label="Fruit" />
      <ComboboxContent>
        <ComboboxEmpty>No fruit found.</ComboboxEmpty>
        <ComboboxList>
          {(fruit: string) => (
            <ComboboxItem key={fruit} value={fruit}>
              {fruit}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

describe("Combobox", () => {
  it("renders a labelled input and a trigger that opens the list", () => {
    render(<Fruit />)

    expect(screen.getByRole("combobox", { name: "Fruit" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button"))

    expect(screen.getByRole("option", { name: "Banana" })).toBeTruthy()
  })

  it("reports the chosen item", () => {
    const onValueChange = vi.fn()
    render(<Fruit onValueChange={onValueChange} />)

    fireEvent.click(screen.getByRole("button"))
    fireEvent.click(screen.getByRole("option", { name: "Cherry" }))

    expect(onValueChange).toHaveBeenLastCalledWith("Cherry", expect.anything())
  })
})
