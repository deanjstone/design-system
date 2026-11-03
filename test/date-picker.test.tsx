import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DatePicker } from "../registry/base-nova/ui/date-picker"

afterEach(cleanup)

const NOVEMBER_1_2026 = new Date(2026, 10, 1)

describe("DatePicker", () => {
  it("shows the placeholder when no date is set", () => {
    render(<DatePicker placeholder="Pick a date" />)

    expect(screen.getByRole("button", { name: /Pick a date/ })).toBeTruthy()
  })

  it("formats the selected date with the en-AU locale", () => {
    render(<DatePicker value={NOVEMBER_1_2026} />)

    expect(screen.getByRole("button", { name: /1 November 2026/ })).toBeTruthy()
  })

  it("opens a Monday-first calendar and reports the picked day", () => {
    const onValueChange = vi.fn()
    render(<DatePicker value={NOVEMBER_1_2026} onValueChange={onValueChange} />)

    fireEvent.click(screen.getByRole("button", { name: /1 November 2026/ }))

    const firstWeekday = document.querySelector("th.rdp-weekday")?.getAttribute("aria-label")
    expect(firstWeekday).toBe("Monday")

    fireEvent.click(document.querySelector('button[data-day="15/11/2026"]') as HTMLButtonElement)

    expect(onValueChange).toHaveBeenCalledTimes(1)
    const picked = onValueChange.mock.calls[0][0] as Date
    expect(picked.getFullYear()).toBe(2026)
    expect(picked.getMonth()).toBe(10)
    expect(picked.getDate()).toBe(15)
  })
})
