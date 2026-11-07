// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  ALL_GROUP_KEY,
  NONE_GROUP_KEY,
  defaultDisplaySettings,
  displaySettingsKey,
  groupItems,
  parseDisplaySettings,
  pickVisible,
  serializeDisplaySettings,
  setGroupBy,
  setPropertyVisible,
  toggleCollapsed,
  type DisplayConfig,
  type ListGrouping,
} from "../registry/lib/list-group-core"

type Issue = { id: string; status: string; wave?: string; labels: string[]; repo: string }

const ISSUES: Issue[] = [
  { id: "1", status: "todo", wave: "w1", labels: ["bug", "ops"], repo: "argus" },
  { id: "2", status: "done", wave: "w2", labels: ["design"], repo: "design-system" },
  { id: "3", status: "todo", wave: "w1", labels: [], repo: "argus" },
  { id: "4", status: "doing", labels: ["bug"], repo: "homelab" },
  { id: "5", status: "todo", wave: "later", labels: ["bug", "bug"], repo: "argus" },
]

const status: ListGrouping<Issue> = {
  id: "status",
  label: "Status",
  keys: (issue) => issue.status,
  groupLabel: (key) => ({ todo: "Todo", doing: "In progress", done: "Done" })[key] ?? key,
  order: ["todo", "doing", "done"],
}
const wave: ListGrouping<Issue> = { id: "wave", label: "Wave", keys: (issue) => issue.wave, order: ["w1", "w2"] }
const label: ListGrouping<Issue> = { id: "label", label: "Label", keys: (issue) => issue.labels }
const repo: ListGrouping<Issue> = { id: "repo", label: "Repo", keys: (issue) => issue.repo }

const ids = (items: Issue[]) => items.map((issue) => issue.id)

describe("groupItems", () => {
  it("groups by a key, keeping each group's items in their given order", () => {
    const groups = groupItems(ISSUES, status)
    expect(groups.map((group) => [group.key, ids(group.items)])).toEqual([
      ["todo", ["1", "3", "5"]],
      ["doing", ["4"]],
      ["done", ["2"]],
    ])
  })

  it("labels a group with groupLabel, or with the key", () => {
    expect(groupItems(ISSUES, status).map((group) => group.label)).toEqual(["Todo", "In progress", "Done"])
    expect(groupItems(ISSUES, repo).map((group) => group.label)).toEqual(["argus", "design-system", "homelab"])
  })

  it("orders by `order`, then the keys it does not list in first-seen order", () => {
    expect(groupItems(ISSUES, wave).map((group) => group.key)).toEqual(["w1", "w2", "later", NONE_GROUP_KEY])
  })

  it("puts items with no key in a last group, labelled by noneLabel", () => {
    const groups = groupItems(ISSUES, wave, { noneLabel: "No wave" })
    const none = groups[groups.length - 1]
    expect(none).toMatchObject({ key: NONE_GROUP_KEY, label: "No wave" })
    expect(ids(none.items)).toEqual(["4"])
  })

  it("treats an empty list and an empty or blank key as no key", () => {
    const groups = groupItems(ISSUES, label)
    const none = groups.find((group) => group.key === NONE_GROUP_KEY)!
    expect(ids(none.items)).toEqual(["3"])
    const blank = groupItems([{ ...ISSUES[0], wave: "" }, { ...ISSUES[1], wave: "  " }], wave)
    expect(blank.map((group) => group.key)).toEqual([NONE_GROUP_KEY])
  })

  it("puts an item with several keys in each of its groups, once per group", () => {
    const groups = groupItems(ISSUES, label)
    expect(groups.map((group) => [group.key, ids(group.items)])).toEqual([
      ["bug", ["1", "4", "5"]],
      ["ops", ["1"]],
      ["design", ["2"]],
      [NONE_GROUP_KEY, ["3"]],
    ])
  })

  it("leaves out a group with no items, so an ordered status that nobody has is not shown", () => {
    const groups = groupItems(ISSUES.filter((issue) => issue.status !== "doing"), status)
    expect(groups.map((group) => group.key)).toEqual(["todo", "done"])
  })

  it("returns no groups for no items", () => {
    expect(groupItems([], status)).toEqual([])
  })

  it("with no grouping, returns one group that holds everything", () => {
    const groups = groupItems(ISSUES, null)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ key: ALL_GROUP_KEY, label: "" })
    expect(ids(groups[0].items)).toEqual(["1", "2", "3", "4", "5"])
  })

  it("does not change the items it was given", () => {
    const before = JSON.stringify(ISSUES)
    groupItems(ISSUES, label)
    expect(JSON.stringify(ISSUES)).toBe(before)
  })
})

const CONFIG: DisplayConfig = {
  groupings: ["status", "wave", "repo", "label"],
  properties: [
    { id: "priority", label: "Priority" },
    { id: "identifier", label: "ID" },
    { id: "labels", label: "Labels" },
    { id: "assignee", label: "Assignee", defaultVisible: false },
  ],
  defaultGroupBy: "status",
}

describe("defaultDisplaySettings", () => {
  it("starts on the default grouping, with every property on except those that default off, and nothing collapsed", () => {
    expect(defaultDisplaySettings(CONFIG)).toEqual({
      groupBy: "status",
      properties: { priority: true, identifier: true, labels: true, assignee: false },
      collapsed: {},
    })
  })

  it("starts ungrouped when the config names no default", () => {
    expect(defaultDisplaySettings({ ...CONFIG, defaultGroupBy: undefined }).groupBy).toBeNull()
  })

  it("ignores a default grouping that is not one of the groupings", () => {
    expect(defaultDisplaySettings({ ...CONFIG, defaultGroupBy: "nope" }).groupBy).toBeNull()
  })
})

describe("the reducers", () => {
  const start = defaultDisplaySettings(CONFIG)

  it("setGroupBy changes the grouping, and null turns grouping off", () => {
    expect(setGroupBy(start, "repo", CONFIG).groupBy).toBe("repo")
    expect(setGroupBy(start, null, CONFIG).groupBy).toBeNull()
  })

  it("setGroupBy ignores a grouping the config does not know", () => {
    expect(setGroupBy(start, "nope", CONFIG)).toBe(start)
  })

  it("setPropertyVisible turns one property on or off and leaves the rest", () => {
    const next = setPropertyVisible(start, "labels", false, CONFIG)
    expect(next.properties).toEqual({ priority: true, identifier: true, labels: false, assignee: false })
    expect(start.properties.labels).toBe(true)
  })

  it("setPropertyVisible ignores a property the config does not know", () => {
    expect(setPropertyVisible(start, "nope", true, CONFIG)).toBe(start)
  })

  it("toggleCollapsed collapses and expands a group, kept per grouping", () => {
    const collapsed = toggleCollapsed(start, "todo")
    expect(collapsed.collapsed).toEqual({ status: ["todo"] })
    expect(toggleCollapsed(collapsed, "done").collapsed).toEqual({ status: ["todo", "done"] })
    expect(toggleCollapsed(collapsed, "todo").collapsed).toEqual({})
    expect(toggleCollapsed(setGroupBy(collapsed, "repo", CONFIG), "argus").collapsed).toEqual({ status: ["todo"], repo: ["argus"] })
  })

  it("toggleCollapsed does nothing while grouping is off", () => {
    const off = setGroupBy(start, null, CONFIG)
    expect(toggleCollapsed(off, "todo")).toBe(off)
  })
})

describe("serializing and parsing display settings", () => {
  const changed = toggleCollapsed(setPropertyVisible(setGroupBy(defaultDisplaySettings(CONFIG), "repo", CONFIG), "labels", false, CONFIG), "argus")

  it("round-trips", () => {
    expect(parseDisplaySettings(serializeDisplaySettings(changed), CONFIG)).toEqual(changed)
  })

  it("returns the defaults for nothing stored", () => {
    expect(parseDisplaySettings(null, CONFIG)).toEqual(defaultDisplaySettings(CONFIG))
    expect(parseDisplaySettings("", CONFIG)).toEqual(defaultDisplaySettings(CONFIG))
  })

  it.each(["{not json", "null", "[]", "42", '"text"', "{}"])("returns the defaults for %s, and does not throw", (raw) => {
    expect(parseDisplaySettings(raw, CONFIG)).toEqual(defaultDisplaySettings(CONFIG))
  })

  it("keeps a stored grouping of null (grouping turned off)", () => {
    const off = setGroupBy(defaultDisplaySettings(CONFIG), null, CONFIG)
    expect(parseDisplaySettings(serializeDisplaySettings(off), CONFIG).groupBy).toBeNull()
  })

  it("drops a grouping, property or collapsed group the config no longer has", () => {
    const stored = JSON.stringify({
      v: 1,
      groupBy: "gone",
      properties: { priority: false, gone: true },
      collapsed: { status: ["todo"], gone: ["x"] },
    })
    expect(parseDisplaySettings(stored, CONFIG)).toEqual({
      groupBy: "status",
      properties: { priority: false, identifier: true, labels: true, assignee: false },
      collapsed: { status: ["todo"] },
    })
  })

  it("takes a property added since the settings were stored at its default", () => {
    const stored = JSON.stringify({ v: 1, groupBy: "wave", properties: { priority: false }, collapsed: {} })
    expect(parseDisplaySettings(stored, CONFIG).properties).toEqual({ priority: false, identifier: true, labels: true, assignee: false })
  })

  it("keeps what it can when one field is the wrong type", () => {
    const stored = JSON.stringify({ v: 1, groupBy: 7, properties: { priority: "no", labels: false }, collapsed: { status: "todo", repo: ["argus", 3] } })
    expect(parseDisplaySettings(stored, CONFIG)).toEqual({
      groupBy: "status",
      properties: { priority: true, identifier: true, labels: false, assignee: false },
      collapsed: { repo: ["argus"] },
    })
  })

  it("returns the defaults for a version it does not know", () => {
    expect(parseDisplaySettings(JSON.stringify({ ...JSON.parse(serializeDisplaySettings(changed)), v: 99 }), CONFIG)).toEqual(defaultDisplaySettings(CONFIG))
  })
})

describe("displaySettingsKey", () => {
  it("keeps each view's settings apart", () => {
    expect(displaySettingsKey("pr-queue")).not.toBe(displaySettingsKey("waves"))
    expect(displaySettingsKey("pr-queue")).toContain("pr-queue")
  })
})

describe("pickVisible", () => {
  const cells = { priority: "P", identifier: "DS-1", labels: "bug", assignee: "me" }

  it("keeps the cells whose property is on and drops the rest", () => {
    const settings = setPropertyVisible(defaultDisplaySettings(CONFIG), "labels", false, CONFIG)
    expect(pickVisible(cells, settings)).toEqual({ priority: "P", identifier: "DS-1" })
  })

  it("drops a property that is not in the settings, so a cell the menu cannot switch on stays off", () => {
    expect(pickVisible({ ...cells, extra: "x" }, defaultDisplaySettings(CONFIG))).toEqual({ priority: "P", identifier: "DS-1", labels: "bug" })
  })
})
