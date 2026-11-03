import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Calendar } from "../registry/base-nova/ui/calendar"

afterEach(cleanup)

// November 2026 starts on a Sunday, so a Monday-first grid opens on Mon 26 Oct
// and a Sunday-first grid opens on Sun 1 Nov. Each day button carries its date
// as data-day, formatted with the locale code (en-AU gives dd/mm/yyyy).
const NOVEMBER_2026 = new Date(2026, 10, 1)

function firstDayOfGrid() {
  return document.querySelector<HTMLButtonElement>("button[data-day]")?.dataset.day
}

function firstWeekdayName() {
  return document.querySelector<HTMLTableCellElement>("th.rdp-weekday")?.getAttribute("aria-label")
}

describe("Calendar defaults", () => {
  it("starts weeks on Monday", () => {
    render(<Calendar mode="single" defaultMonth={NOVEMBER_2026} />)

    expect(firstDayOfGrid()).toBe("26/10/2026")
    expect(firstWeekdayName()).toBe("Monday")
  })

  it("formats dates with the en-AU locale", () => {
    render(<Calendar mode="single" defaultMonth={NOVEMBER_2026} />)

    expect(document.querySelector('button[data-day="01/11/2026"]')).not.toBeNull()
  })

  it("lets a consumer start weeks on Sunday", () => {
    render(<Calendar mode="single" defaultMonth={NOVEMBER_2026} weekStartsOn={0} />)

    expect(firstDayOfGrid()).toBe("01/11/2026")
    expect(firstWeekdayName()).toBe("Sunday")
  })
})
