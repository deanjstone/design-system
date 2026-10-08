import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../registry/base-nova/ui/select"

afterEach(cleanup)

const items = [
  { value: "idea", label: "Idea" },
  { value: "task", label: "Task" },
]

function renderSelect() {
  render(
    <Select items={items} defaultValue="idea">
      <SelectTrigger aria-label="Type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
  return screen.getByRole("combobox", { name: "Type" })
}

describe("SelectTrigger", () => {
  // Base UI's Select.Icon defaults its children to "▼", and `render` swaps
  // only the element, so the glyph used to land inside the lucide svg (#50).
  it("has the selected label as its text content, with no default ▼ glyph", () => {
    const trigger = renderSelect()

    expect(trigger.textContent).toBe("Idea")
  })

  it("still renders the chevron icon", () => {
    const trigger = renderSelect()
    const icon = trigger.querySelector("svg.lucide-chevron-down")

    expect(icon).not.toBeNull()
    expect(icon?.getAttribute("aria-hidden")).toBe("true")
    expect(icon?.textContent).toBe("")
  })
})
