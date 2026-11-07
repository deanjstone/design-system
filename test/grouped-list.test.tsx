import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import axe from "axe-core"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { IssueRow } from "../registry/base-nova/blocks/issue-row"
import { DisplayMenu, GroupedList } from "../registry/base-nova/blocks/grouped-list"
import { useDisplaySettings } from "../registry/base-nova/hooks/use-display-settings"
import { groupItems, pickVisible, type DisplayConfig, type ListGrouping } from "../registry/lib/list-group-core"

// The grouped list and its display menu (design-system#194): collapsible group headers with a count, and
// a menu that turns row properties on and off. The settings model has its own tests.

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

type Issue = { id: string; title: string; status: string; labels: string[] }

const ISSUES: Issue[] = [
  { id: "DS-1", title: "Fix the promotion card", status: "todo", labels: ["bug"] },
  { id: "DS-2", title: "Dense issue row", status: "done", labels: ["design"] },
  { id: "DS-3", title: "Filter builder", status: "todo", labels: ["design", "bug"] },
]

const STATUS: ListGrouping<Issue> = {
  id: "status",
  label: "Status",
  keys: (issue) => issue.status,
  groupLabel: (key) => ({ todo: "Todo", done: "Done" })[key] ?? key,
  order: ["todo", "done"],
}
const LABEL: ListGrouping<Issue> = { id: "label", label: "Label", keys: (issue) => issue.labels }

const renderItem = (issue: Issue) => <li key={issue.id}>{issue.title}</li>

const header = (name: RegExp | string) => screen.getByRole("button", { name })

describe("GroupedList", () => {
  const groups = groupItems(ISSUES, STATUS)

  it("gives each group a heading with its name and count, and lists its items under it", () => {
    render(<GroupedList groups={groups} collapsed={[]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={renderItem} />)

    const headings = screen.getAllByRole("heading", { level: 3 })
    expect(headings.map((heading) => heading.textContent)).toEqual(["Todo2", "Done1"])
    const lists = screen.getAllByRole("list")
    expect(within(lists[0]).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Fix the promotion card", "Filter builder"])
    expect(within(lists[1]).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Dense issue row"])
  })

  it("takes the heading level", () => {
    render(<GroupedList groups={groups} collapsed={[]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={renderItem} headingLevel={2} />)
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2)
  })

  it("makes each header a 44px button that says whether its group is open", () => {
    render(<GroupedList groups={groups} collapsed={["done"]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={renderItem} />)

    const open = header(/^Todo/)
    const shut = header(/^Done/)
    expect(open.getAttribute("aria-expanded")).toBe("true")
    expect(shut.getAttribute("aria-expanded")).toBe("false")
    expect(open.className).toContain("h-11")
    expect(open.className).toContain("w-full")
  })

  it("calls onToggleGroup with the group's key when its header is pressed", () => {
    const onToggleGroup = vi.fn()
    render(<GroupedList groups={groups} collapsed={[]} onToggleGroup={onToggleGroup} getItemKey={(issue) => issue.id} renderItem={renderItem} />)

    fireEvent.click(header(/^Done/))
    expect(onToggleGroup).toHaveBeenCalledExactlyOnceWith("done")
  })

  it("hides the items of a collapsed group and keeps its header and count", () => {
    render(<GroupedList groups={groups} collapsed={["todo"]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={renderItem} />)

    expect(screen.queryByText("Fix the promotion card")).toBeNull()
    expect(screen.queryByText("Filter builder")).toBeNull()
    expect(screen.getByText("Dense issue row")).toBeTruthy()
    expect(header(/^Todo/).textContent).toContain("2")
  })

  it("shows the items again once the group is no longer collapsed", () => {
    const { rerender } = render(<GroupedList groups={groups} collapsed={["todo"]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={renderItem} />)
    rerender(<GroupedList groups={groups} collapsed={[]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={renderItem} />)
    expect(screen.getByText("Fix the promotion card")).toBeTruthy()
  })

  it("draws an item that sits in two groups under both, with no duplicate-key warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    render(<GroupedList groups={groupItems(ISSUES, LABEL)} collapsed={[]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={renderItem} />)

    expect(screen.getAllByText("Filter builder")).toHaveLength(2)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it("passes renderItem the group the item is drawn in", () => {
    render(<GroupedList groups={groupItems(ISSUES, LABEL)} collapsed={[]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={(issue, group) => <li key={issue.id}>{`${issue.id} in ${group.key}`}</li>} />)
    expect(screen.getByText("DS-3 in bug")).toBeTruthy()
    expect(screen.getByText("DS-3 in design")).toBeTruthy()
  })

  it("with grouping off, is one plain list with no header", () => {
    render(<GroupedList groups={groupItems(ISSUES, null)} collapsed={[]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={renderItem} />)

    expect(screen.queryByRole("heading")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(3)
  })

  it("shows `empty` when there are no groups", () => {
    render(<GroupedList groups={[]} collapsed={[]} onToggleGroup={vi.fn()} getItemKey={(issue: Issue) => issue.id} renderItem={renderItem} empty={<p>Nothing here</p>} />)
    expect(screen.getByText("Nothing here")).toBeTruthy()
  })

  it("cuts a long group name with an ellipsis instead of wrapping it, and keeps clear of the safe areas", () => {
    render(<GroupedList groups={groups} collapsed={[]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={renderItem} />)

    const button = header(/^Todo/)
    expect(button.querySelector("[data-slot=grouped-list-label]")!.className).toContain("truncate")
    expect(button.className).toContain("env(safe-area-inset-left)")
    expect(button.className).toContain("env(safe-area-inset-right)")
  })

  it("has no axe violations, open and collapsed", async () => {
    const { container } = render(<GroupedList groups={groups} collapsed={["done"]} onToggleGroup={vi.fn()} getItemKey={(issue) => issue.id} renderItem={renderItem} />)
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})

const CONFIG: DisplayConfig = {
  groupings: ["status", "label"],
  properties: [
    { id: "identifier", label: "ID" },
    { id: "labels", label: "Labels" },
    { id: "assignee", label: "Assignee", defaultVisible: false },
  ],
  defaultGroupBy: "status",
}

const defaultSettings = { groupBy: "status", properties: { identifier: true, labels: true, assignee: false }, collapsed: {} }

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Display" }))

describe("DisplayMenu", () => {
  const baseProps = {
    groupings: [STATUS, LABEL],
    properties: CONFIG.properties,
    settings: defaultSettings,
    onGroupByChange: vi.fn(),
    onPropertyChange: vi.fn(),
  }

  it("opens from a button named Display", () => {
    render(<DisplayMenu {...baseProps} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    openMenu()
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("lists the groupings and no grouping in a native select that shows the grouping in use", () => {
    render(<DisplayMenu {...baseProps} />)
    openMenu()

    const select = screen.getByRole("combobox", { name: "Group by" }) as HTMLSelectElement
    expect(select.tagName).toBe("SELECT")
    expect([...select.options].map((option) => option.textContent)).toEqual(["No grouping", "Status", "Label"])
    expect(select.value).toBe("status")
  })

  it("reports a new grouping, and null for no grouping", () => {
    const onGroupByChange = vi.fn()
    render(<DisplayMenu {...baseProps} onGroupByChange={onGroupByChange} />)
    openMenu()

    fireEvent.change(screen.getByRole("combobox", { name: "Group by" }), { target: { value: "label" } })
    expect(onGroupByChange).toHaveBeenLastCalledWith("label")
    fireEvent.change(screen.getByRole("combobox", { name: "Group by" }), { target: { value: "" } })
    expect(onGroupByChange).toHaveBeenLastCalledWith(null)
  })

  it("shows no grouping as selected while grouping is off", () => {
    render(<DisplayMenu {...baseProps} settings={{ ...defaultSettings, groupBy: null }} />)
    openMenu()
    expect((screen.getByRole("combobox", { name: "Group by" }) as HTMLSelectElement).value).toBe("")
  })

  it("lists each property as a checkbox that reflects the settings", () => {
    render(<DisplayMenu {...baseProps} />)
    openMenu()

    const group = screen.getByRole("group", { name: "Properties" })
    const boxes = within(group).getAllByRole("checkbox")
    expect(boxes.map((box) => [box.getAttribute("aria-label") ?? box.closest("label")?.textContent, box.getAttribute("aria-checked")])).toEqual([
      ["ID", "true"],
      ["Labels", "true"],
      ["Assignee", "false"],
    ])
  })

  it("reports a property turned off, and one turned on", () => {
    const onPropertyChange = vi.fn()
    render(<DisplayMenu {...baseProps} onPropertyChange={onPropertyChange} />)
    openMenu()

    fireEvent.click(screen.getByRole("checkbox", { name: "Labels" }))
    expect(onPropertyChange).toHaveBeenLastCalledWith("labels", false)
    fireEvent.click(screen.getByRole("checkbox", { name: "Assignee" }))
    expect(onPropertyChange).toHaveBeenLastCalledWith("assignee", true)
  })

  it("has a Reset button only when given onReset, and calls it", () => {
    const { rerender } = render(<DisplayMenu {...baseProps} />)
    openMenu()
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull()

    const onReset = vi.fn()
    rerender(<DisplayMenu {...baseProps} onReset={onReset} />)
    fireEvent.click(screen.getByRole("button", { name: "Reset" }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it("leaves out Group by when there is nothing to group by, and Properties when there are none", () => {
    render(<DisplayMenu {...baseProps} groupings={[]} />)
    openMenu()
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.getByRole("group", { name: "Properties" })).toBeTruthy()
    cleanup()

    render(<DisplayMenu {...baseProps} properties={[]} />)
    openMenu()
    expect(screen.queryByRole("group", { name: "Properties" })).toBeNull()
    expect(screen.getByRole("combobox", { name: "Group by" })).toBeTruthy()
  })

  it("takes every visible and spoken string, for an app not in English", () => {
    render(<DisplayMenu {...baseProps} onReset={vi.fn()} labels={{ display: "Anzeige", groupBy: "Gruppieren nach", noGrouping: "Keine", properties: "Eigenschaften", reset: "Zurücksetzen" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Anzeige" }))

    expect(screen.getByRole("combobox", { name: "Gruppieren nach" })).toBeTruthy()
    expect(screen.getByRole("option", { name: "Keine" })).toBeTruthy()
    expect(screen.getByRole("group", { name: "Eigenschaften" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Zurücksetzen" })).toBeTruthy()
  })

  it("makes the touch controls 44px, with 16px text on the select so iOS does not zoom", () => {
    render(<DisplayMenu {...baseProps} />)
    expect(screen.getByRole("button", { name: "Display" }).className).toContain("pointer-coarse:h-11")
    openMenu()

    expect(screen.getByRole("combobox", { name: "Group by" }).closest("[data-slot=native-select-wrapper]")!.className).toContain("[&_select]:pointer-coarse:h-11")
    expect(screen.getByRole("combobox", { name: "Group by" }).closest("[data-slot=native-select-wrapper]")!.className).toContain("[&_select]:pointer-coarse:text-base")
    for (const box of screen.getAllByRole("checkbox")) expect(box.closest("label")!.className).toContain("pointer-coarse:min-h-11")
  })

  it("has no axe violations open", async () => {
    render(<DisplayMenu {...baseProps} onReset={vi.fn()} />)
    openMenu()
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})

// The pieces together, as an app wires them: the hook keeps the settings, the model groups, the list
// draws, the menu edits, and IssueRow shows the properties that are on.
function View({ viewId }: { viewId: string }) {
  const display = useDisplaySettings(viewId, CONFIG)
  const { settings } = display
  const grouping = [STATUS, LABEL].find((candidate) => candidate.id === settings.groupBy) ?? null
  const groups = groupItems(ISSUES, grouping)

  return (
    <>
      <DisplayMenu
        groupings={[STATUS, LABEL]}
        properties={CONFIG.properties}
        settings={settings}
        onGroupByChange={display.setGroupBy}
        onPropertyChange={display.setPropertyVisible}
        onReset={display.reset}
      />
      <GroupedList
        groups={groups}
        collapsed={grouping ? (settings.collapsed[grouping.id] ?? []) : []}
        onToggleGroup={display.toggleCollapsed}
        getItemKey={(issue) => issue.id}
        renderItem={(issue) => (
          <IssueRow
            key={issue.id}
            title={issue.title}
            {...pickVisible({ identifier: issue.id, labels: issue.labels.join(", ") }, settings)}
          />
        )}
      />
    </>
  )
}

describe("grouped list with display settings, wired together", () => {
  it("groups by status to start, and regroups from the menu", () => {
    render(<View viewId="wired-1" />)
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Todo2", "Done1"])

    openMenu()
    fireEvent.change(screen.getByRole("combobox", { name: "Group by" }), { target: { value: "label" } })
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["bug2", "design2"])
  })

  it("turns a row property off and on from the menu", () => {
    const { container } = render(<View viewId="wired-2" />)
    expect(container.querySelectorAll("[data-slot=issue-row-labels]")).toHaveLength(3)
    expect(container.querySelectorAll("[data-slot=issue-row-assignee]")).toHaveLength(0)

    openMenu()
    fireEvent.click(screen.getByRole("checkbox", { name: "Labels" }))
    expect(container.querySelectorAll("[data-slot=issue-row-labels]")).toHaveLength(0)
    fireEvent.click(screen.getByRole("checkbox", { name: "Labels" }))
    expect(container.querySelectorAll("[data-slot=issue-row-labels]")).toHaveLength(3)
  })

  it("collapses a group, and remembers the grouping, the property and the collapsed group after a reload", () => {
    const first = render(<View viewId="wired-3" />)
    fireEvent.click(header(/^Todo/))
    expect(screen.queryByText("Fix the promotion card")).toBeNull()
    openMenu()
    fireEvent.click(screen.getByRole("checkbox", { name: "ID" }))
    first.unmount()

    const { container } = render(<View viewId="wired-3" />)
    expect(header(/^Todo/).getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText("Fix the promotion card")).toBeNull()
    expect(container.querySelectorAll("[data-slot=issue-row-identifier]")).toHaveLength(0)
  })

  it("keeps a collapsed group collapsed per grouping, not across groupings", () => {
    render(<View viewId="wired-4" />)
    fireEvent.click(header(/^Todo/))
    openMenu()
    fireEvent.change(screen.getByRole("combobox", { name: "Group by" }), { target: { value: "label" } })
    expect(screen.getAllByRole("button", { name: /^(bug|design)/ }).map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "true"])
  })

  it("Reset puts the grouping and the properties back", () => {
    render(<View viewId="wired-5" />)
    openMenu()
    fireEvent.change(screen.getByRole("combobox", { name: "Group by" }), { target: { value: "label" } })
    fireEvent.click(screen.getByRole("button", { name: "Reset" }))
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Todo2", "Done1"])
  })
})
