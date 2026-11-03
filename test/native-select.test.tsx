import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "../registry/base-nova/ui/native-select"

afterEach(cleanup)

describe("NativeSelect", () => {
  it("renders a real select with its options and the chevron hidden from assistive tech", () => {
    const { container } = render(
      <NativeSelect aria-label="Currency" defaultValue="aud">
        <NativeSelectOption value="aud">AUD</NativeSelectOption>
        <NativeSelectOptGroup label="Other">
          <NativeSelectOption value="nzd">NZD</NativeSelectOption>
        </NativeSelectOptGroup>
      </NativeSelect>,
    )

    const select = screen.getByRole("combobox", { name: "Currency" }) as HTMLSelectElement
    expect(select.value).toBe("aud")
    expect(screen.getByRole("option", { name: "NZD" })).toBeTruthy()
    expect(container.querySelector('[data-slot="native-select-icon"]')?.getAttribute("aria-hidden")).toBe("true")
  })

  it("carries the size onto the wrapper and the select", () => {
    const { container } = render(
      <NativeSelect aria-label="Size" size="sm">
        <NativeSelectOption value="a">A</NativeSelectOption>
      </NativeSelect>,
    )

    expect(container.querySelector('[data-slot="native-select-wrapper"]')?.getAttribute("data-size")).toBe("sm")
    expect(container.querySelector('[data-slot="native-select"]')?.getAttribute("data-size")).toBe("sm")
  })
})
