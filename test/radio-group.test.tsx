import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RadioGroup, RadioGroupItem } from "../registry/base-nova/ui/radio-group"

afterEach(cleanup)

function Plans({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <RadioGroup defaultValue="monthly" onValueChange={onValueChange} aria-label="Plan">
      <RadioGroupItem value="monthly" aria-label="Monthly" />
      <RadioGroupItem value="yearly" aria-label="Yearly" />
    </RadioGroup>
  )
}

describe("RadioGroup", () => {
  it("renders one radio per item and checks the default value", () => {
    render(<Plans />)

    expect(screen.getAllByRole("radio")).toHaveLength(2)
    expect(screen.getByRole("radio", { name: "Monthly" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: "Yearly" }).getAttribute("aria-checked")).toBe("false")
  })

  it("reports the newly chosen value when a different radio is clicked", () => {
    const onValueChange = vi.fn()
    render(<Plans onValueChange={onValueChange} />)

    fireEvent.click(screen.getByRole("radio", { name: "Yearly" }))

    expect(onValueChange).toHaveBeenCalledWith("yearly", expect.anything())
  })
})
