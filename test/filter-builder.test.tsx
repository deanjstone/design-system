import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import axe from "axe-core"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Filter, FilterField } from "../registry/lib/filter-core"
import { FilterBuilder } from "../registry/base-nova/blocks/filter-builder"

// jsdom has no matchMedia, which useIsMobile reads. Anything that is not a phone by default.
const stubMatchMedia = (matches: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({ matches, addEventListener: () => {}, removeEventListener: () => {} })),
  )

beforeEach(() => stubMatchMedia(false))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const fields: FilterField[] = [
  {
    id: "label",
    label: "Label",
    type: "option",
    options: [
      { value: "bug", label: "Bug" },
      { value: "design", label: "Design" },
    ],
  },
  {
    id: "wave",
    label: "Wave",
    type: "option",
    options: [
      { value: "w1", label: "Wave 1" },
      { value: "w2", label: "Wave 2" },
      { value: "later", label: "Later" },
    ],
  },
  {
    id: "mode",
    label: "Mode",
    type: "multiOption",
    options: [
      { value: "afk", label: "AFK" },
      { value: "hitl", label: "HITL" },
    ],
  },
  { id: "title", label: "Title", type: "text" },
  { id: "points", label: "Points", type: "number" },
]

// A host that owns the list, as an app (or useFilterState) does, and records every change.
function Host({ initial = [], layout = "inline", onChange }: { initial?: Filter[]; layout?: "auto" | "inline" | "sheet"; onChange?: (next: Filter[]) => void }) {
  const [value, setValue] = React.useState<Filter[]>(initial)
  return (
    <FilterBuilder
      fields={fields}
      value={value}
      layout={layout}
      onValueChange={(next) => {
        onChange?.(next)
        setValue(next)
      }}
    />
  )
}

const rows = () => screen.queryAllByRole("group")
const select = (row: HTMLElement, name: string) => within(row).getByLabelText(name) as HTMLSelectElement
const choose = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } })

describe("FilterBuilder: inline rows", () => {
  it("shows an Add filter button and no rows when the list is empty", () => {
    render(<Host />)
    expect(screen.getByRole("button", { name: "Add filter" })).toBeTruthy()
    expect(rows()).toHaveLength(0)
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull()
  })

  it("adds a row on the first field with its first operator and no value", () => {
    const onChange = vi.fn()
    render(<Host onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Add filter" }))

    expect(onChange).toHaveBeenLastCalledWith([{ field: "label", operator: "is", values: [] }])
    expect(rows()).toHaveLength(1)
  })

  it("starts the next row on a field not yet used", () => {
    const onChange = vi.fn()
    render(<Host initial={[{ field: "label", operator: "is", values: ["bug"] }]} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Add filter" }))

    expect(onChange.mock.lastCall![0][1].field).toBe("wave")
  })

  it("names each row by the sentence it says", () => {
    render(<Host initial={[{ field: "wave", operator: "is-any-of", values: ["w1", "later"] }]} />)
    expect(screen.getByRole("group", { name: "Wave is any of Wave 1, Later" })).toBeTruthy()
  })

  it("lists the fields and the operators of the row's type", () => {
    render(<Host initial={[{ field: "label", operator: "is", values: [] }]} />)
    const row = rows()[0]

    expect([...select(row, "Field").options].map((option) => option.text)).toEqual(["Label", "Wave", "Mode", "Title", "Points"])
    expect([...select(row, "Operator").options].map((option) => option.text)).toEqual(["is", "is not", "is any of", "is none of"])
  })

  it("lets a row exclude: label is not bug", () => {
    const onChange = vi.fn()
    render(<Host initial={[{ field: "label", operator: "is", values: ["bug"] }]} onChange={onChange} />)

    choose(select(rows()[0], "Operator"), "is-not")

    expect(onChange).toHaveBeenLastCalledWith([{ field: "label", operator: "is-not", values: ["bug"] }])
  })

  it("picks a single value from a native select, the phone's own picker", () => {
    const onChange = vi.fn()
    render(<Host initial={[{ field: "label", operator: "is", values: [] }]} onChange={onChange} />)

    choose(select(rows()[0], "Value"), "design")

    expect(onChange).toHaveBeenLastCalledWith([{ field: "label", operator: "is", values: ["design"] }])
  })

  it("changing the field resets the operator and the values for another type", () => {
    const onChange = vi.fn()
    render(<Host initial={[{ field: "label", operator: "is-not", values: ["bug"] }]} onChange={onChange} />)

    choose(select(rows()[0], "Field"), "title")

    expect(onChange).toHaveBeenLastCalledWith([{ field: "title", operator: "contains", values: [] }])
    expect(within(rows()[0]).getByRole("textbox", { name: "Value" })).toBeTruthy()
  })

  it("takes text in an input, and a number in a numeric input", () => {
    const onChange = vi.fn()
    render(
      <Host
        initial={[
          { field: "title", operator: "contains", values: [] },
          { field: "points", operator: "gt", values: [] },
        ]}
        onChange={onChange}
      />,
    )

    fireEvent.change(within(rows()[0]).getByRole("textbox", { name: "Value" }), { target: { value: "card" } })
    expect(onChange.mock.lastCall![0][0].values).toEqual(["card"])

    const number = within(rows()[1]).getByRole("spinbutton", { name: "Value" }) as HTMLInputElement
    expect(number.getAttribute("inputmode")).toBe("decimal")
    fireEvent.change(number, { target: { value: "3" } })
    expect(onChange.mock.lastCall![0][1].values).toEqual(["3"])
  })

  it("clears the value of a text row when the input is emptied", () => {
    const onChange = vi.fn()
    render(<Host initial={[{ field: "title", operator: "contains", values: ["card"] }]} onChange={onChange} />)

    fireEvent.change(within(rows()[0]).getByRole("textbox", { name: "Value" }), { target: { value: "" } })

    expect(onChange.mock.lastCall![0][0].values).toEqual([])
  })

  it("picks several values from a checklist behind a button for an any-of operator", () => {
    const onChange = vi.fn()
    render(<Host initial={[{ field: "wave", operator: "is-any-of", values: ["w1"] }]} onChange={onChange} />)

    const trigger = within(rows()[0]).getByRole("button", { name: /Value: Wave 1/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("checkbox", { name: "Wave 2" }))

    expect(onChange).toHaveBeenLastCalledWith([{ field: "wave", operator: "is-any-of", values: ["w1", "w2"] }])
    fireEvent.click(screen.getByRole("checkbox", { name: "Wave 1" }))
    expect(onChange).toHaveBeenLastCalledWith([{ field: "wave", operator: "is-any-of", values: ["w2"] }])
  })

  it("says Select… on the checklist button while nothing is picked, and counts past two values", () => {
    render(
      <Host
        initial={[
          { field: "wave", operator: "is-any-of", values: [] },
          { field: "wave", operator: "is-none-of", values: ["w1", "w2", "later"] },
        ]}
      />,
    )
    expect(within(rows()[0]).getByRole("button", { name: "Value: Select…" })).toBeTruthy()
    expect(within(rows()[1]).getByRole("button", { name: "Value: 3 selected" })).toBeTruthy()
  })

  it("uses the checklist for a multi-option field too", () => {
    render(<Host initial={[{ field: "mode", operator: "has-all-of", values: [] }]} />)
    expect(within(rows()[0]).getByRole("button", { name: "Value: Select…" })).toBeTruthy()
  })

  it("removes a row", () => {
    const onChange = vi.fn()
    render(
      <Host
        initial={[
          { field: "label", operator: "is", values: ["bug"] },
          { field: "wave", operator: "is", values: ["w1"] },
        ]}
        onChange={onChange}
      />,
    )

    fireEvent.click(within(rows()[0]).getByRole("button", { name: "Remove filter: Label is Bug" }))

    expect(onChange).toHaveBeenLastCalledWith([{ field: "wave", operator: "is", values: ["w1"] }])
    expect(rows()).toHaveLength(1)
  })

  it("clears every row with Clear all", () => {
    const onChange = vi.fn()
    render(<Host initial={[{ field: "label", operator: "is", values: ["bug"] }]} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }))

    expect(onChange).toHaveBeenLastCalledWith([])
    expect(rows()).toHaveLength(0)
  })

  it("stops offering Add filter once every field has a row", () => {
    render(<Host initial={fields.map((field) => ({ field: field.id, operator: "is", values: [] }) as Filter)} />)
    expect(screen.getByRole("button", { name: "Add filter" }).hasAttribute("disabled")).toBe(true)
  })

  it("leaves out a filter for a field it does not know rather than crashing", () => {
    render(<Host initial={[{ field: "ghost", operator: "is", values: ["x"] }]} />)
    expect(screen.queryAllByRole("group")).toHaveLength(0)
  })
})

describe("FilterBuilder: touch sizes", () => {
  it("floors the selects, the checklist rows and the controls at 44px under a coarse pointer", () => {
    render(<Host initial={[{ field: "wave", operator: "is-any-of", values: ["w1"] }]} />)
    const row = rows()[0]

    // iOS zooms the page into any text control under 16px, so the selects take text-base when coarse.
    for (const name of ["Field", "Operator"]) {
      const wrapper = select(row, name).parentElement!
      expect(wrapper.className).toContain("[&_select]:pointer-coarse:h-11")
      expect(wrapper.className).toContain("[&_select]:pointer-coarse:text-base")
    }

    fireEvent.click(within(row).getByRole("button", { name: /Value:/ }))
    const item = screen.getByRole("checkbox", { name: "Wave 2" }).closest("label")!
    expect(item.className).toContain("pointer-coarse:min-h-11")
  })

  it("makes the remove button a 44px square under a coarse pointer", () => {
    render(<Host initial={[{ field: "label", operator: "is", values: ["bug"] }]} />)
    const remove = screen.getByRole("button", { name: /Remove filter/ })
    expect(remove.className).toContain("pointer-coarse:size-11")
  })
})

describe("FilterBuilder: bottom sheet", () => {
  it("shows one Filters button with the count of filters, and no rows until it opens", () => {
    render(<Host layout="sheet" initial={[{ field: "label", operator: "is", values: ["bug"] }]} />)

    expect(screen.getByRole("button", { name: /Filters/ }).textContent).toContain("1")
    expect(rows()).toHaveLength(0)
  })

  it("opens the rows in a bottom sheet", () => {
    render(<Host layout="sheet" initial={[{ field: "label", operator: "is", values: ["bug"] }]} />)

    fireEvent.click(screen.getByRole("button", { name: /Filters/ }))

    const dialog = screen.getByRole("dialog", { name: "Filters" })
    expect(dialog.getAttribute("data-side")).toBe("bottom")
    expect(within(dialog).getAllByRole("group")).toHaveLength(1)
    expect(within(dialog).getByRole("button", { name: "Add filter" })).toBeTruthy()
  })

  it("lists a multi-value row's choices in the sheet itself, not behind a second popup", () => {
    const onChange = vi.fn()
    render(<Host layout="sheet" initial={[{ field: "wave", operator: "is-any-of", values: [] }]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }))

    fireEvent.click(screen.getByRole("checkbox", { name: "Later" }))

    expect(onChange).toHaveBeenLastCalledWith([{ field: "wave", operator: "is-any-of", values: ["later"] }])
  })

  it("shows each complete filter as a chip outside the sheet, and removes it from the chip", () => {
    const onChange = vi.fn()
    render(
      <Host
        layout="sheet"
        initial={[
          { field: "label", operator: "is-not", values: ["bug"] },
          { field: "wave", operator: "is", values: [] },
        ]}
        onChange={onChange}
      />,
    )

    const chips = screen.getByRole("list", { name: "Active filters" })
    expect(within(chips).getAllByRole("listitem")).toHaveLength(1)
    fireEvent.click(within(chips).getByRole("button", { name: "Remove filter: Label is not Bug" }))

    expect(onChange).toHaveBeenLastCalledWith([{ field: "wave", operator: "is", values: [] }])
  })

  it("drops the rows still empty when the sheet closes", () => {
    const onChange = vi.fn()
    render(<Host layout="sheet" initial={[{ field: "label", operator: "is", values: ["bug"] }]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }))
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }))
    expect(onChange).toHaveBeenLastCalledWith([
      { field: "label", operator: "is", values: ["bug"] },
      { field: "wave", operator: "is", values: [] },
    ])

    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    expect(onChange).toHaveBeenLastCalledWith([{ field: "label", operator: "is", values: ["bug"] }])
  })

  it("clears all from inside the sheet", () => {
    const onChange = vi.fn()
    render(<Host layout="sheet" initial={[{ field: "label", operator: "is", values: ["bug"] }]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }))

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }))

    expect(onChange).toHaveBeenLastCalledWith([])
  })
})

describe("FilterBuilder: layout auto", () => {
  const phone = stubMatchMedia

  it("uses the sheet on a phone", () => {
    phone(true)
    render(<Host layout="auto" initial={[{ field: "label", operator: "is", values: ["bug"] }]} />)
    act(() => {})
    expect(rows()).toHaveLength(0)
    expect(screen.getByRole("button", { name: /Filters/ })).toBeTruthy()
  })

  it("lays the rows out inline anywhere else", () => {
    phone(false)
    render(<Host layout="auto" initial={[{ field: "label", operator: "is", values: ["bug"] }]} />)
    act(() => {})
    expect(rows()).toHaveLength(1)
  })
})

describe("FilterBuilder: words", () => {
  it("takes every visible string from `labels`, for an app not in English", () => {
    render(
      <FilterBuilder
        fields={fields}
        value={[{ field: "label", operator: "is", values: ["bug"] }]}
        onValueChange={() => {}}
        layout="inline"
        labels={{ addFilter: "Filtro hinzufügen", clearAll: "Alle löschen", field: "Feld", operator: "Operator", value: "Wert", remove: "Entfernen" }}
      />,
    )
    expect(screen.getByRole("button", { name: "Filtro hinzufügen" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Alle löschen" })).toBeTruthy()
    expect(within(rows()[0]).getByLabelText("Feld")).toBeTruthy()
    expect(within(rows()[0]).getByLabelText("Wert")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Entfernen: Label is Bug" })).toBeTruthy()
  })
})

describe("FilterBuilder: accessibility", () => {
  it("has no axe violations inline", async () => {
    const { container } = render(
      <Host
        initial={[
          { field: "label", operator: "is-not", values: ["bug"] },
          { field: "wave", operator: "is-any-of", values: ["w1"] },
          { field: "title", operator: "contains", values: ["card"] },
        ]}
      />,
    )
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })

  it("has no axe violations in the open sheet", async () => {
    render(<Host layout="sheet" initial={[{ field: "wave", operator: "is-any-of", values: ["w1"] }]} />)
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }))
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
