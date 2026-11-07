// The model behind the grouped list: group items by a key, and keep the per-view display settings (which
// grouping, which row properties are on, which groups are collapsed) as a value that serialises to one
// string. Pure TypeScript, no React and no storage, so a server, a test or any framework can use it.
//
// Pattern from circle's `group-issues.tsx`, `grouped-issues-view.tsx` and `store/display-settings-store.ts`
// (https://github.com/ln-dev7/circle), MIT License, Copyright (c) 2025 lndev-ui | Circle Template.
// What is circle's: grouping by a property with a count per group, collapsible groups, and a display menu
// of row properties. What is new: keys that may be a list (an item with two labels sits in both groups),
// settings that parse defensively and drop what the config no longer has, and no zustand or mock data.

/** The key of the group that holds items with no key for the grouping. Always last. */
export const NONE_GROUP_KEY = "__none__"

/** The key of the one group `groupItems` returns while grouping is off. */
export const ALL_GROUP_KEY = "__all__"

export type ListGrouping<Item = unknown> = {
  /** The grouping's id. It is stored in the display settings, so keep it short and stable. */
  id: string
  /** What the person reads in the Group by menu. */
  label: string
  /** The group key or keys of an item: a string, or a list when an item belongs to several groups. Missing or empty puts it in the none group. */
  keys: (item: Item) => string | readonly string[] | null | undefined
  /** What the person reads on a group header for a key. Default the key itself. */
  groupLabel?: (key: string) => string
  /** The keys that go first, in this order. Other keys follow in the order they are first seen. */
  order?: readonly string[]
}

export type ListGroup<Item> = { key: string; label: string; items: Item[] }

type GroupItemsOptions = {
  /** The none group's header. Default "None". */
  noneLabel?: string
}

const keysOf = <Item>(grouping: ListGrouping<Item>, item: Item): string[] => {
  const raw = grouping.keys(item)
  const list = raw == null ? [] : typeof raw === "string" ? [raw] : raw
  return [...new Set(list.filter((key) => key.trim() !== ""))]
}

/**
 * Group `items` by `grouping`, keeping each group's items in their given order. A group nobody belongs to
 * is not returned. With `null` there is one group of everything, so a list can switch grouping off
 * without a second code path.
 */
export function groupItems<Item>(items: readonly Item[], grouping: ListGrouping<Item> | null, { noneLabel = "None" }: GroupItemsOptions = {}): ListGroup<Item>[] {
  if (grouping === null) return [{ key: ALL_GROUP_KEY, label: "", items: [...items] }]

  const byKey = new Map<string, Item[]>()
  const none: Item[] = []
  for (const item of items) {
    const keys = keysOf(grouping, item)
    if (keys.length === 0) none.push(item)
    for (const key of keys) {
      const group = byKey.get(key)
      if (group) group.push(item)
      else byKey.set(key, [item])
    }
  }

  const ordered = [...(grouping.order ?? []).filter((key) => byKey.has(key)), ...[...byKey.keys()].filter((key) => !grouping.order?.includes(key))]
  const groups: ListGroup<Item>[] = ordered.map((key) => ({ key, label: grouping.groupLabel?.(key) ?? key, items: byKey.get(key)! }))
  if (none.length > 0) groups.push({ key: NONE_GROUP_KEY, label: noneLabel, items: none })
  return groups
}

export type DisplayProperty = {
  /** The property's id, for example `labels`. It is stored in the display settings. */
  id: string
  /** What the person reads in the display menu. */
  label: string
  /** Default true. */
  defaultVisible?: boolean
}

export type DisplayConfig = {
  /** The ids of the groupings the view offers. */
  groupings: readonly string[]
  /** The row properties the display menu can turn on and off. */
  properties: readonly DisplayProperty[]
  /** The grouping a view starts on. Leave out to start ungrouped. */
  defaultGroupBy?: string
}

export type DisplaySettings = {
  /** The id of the grouping in use, or null for no grouping. */
  groupBy: string | null
  /** Every property of the config, on or off. */
  properties: Record<string, boolean>
  /** The collapsed group keys, kept per grouping so switching grouping does not carry them over. */
  collapsed: Record<string, string[]>
}

const VERSION = 1

const startingGroupBy = (config: DisplayConfig) => (config.defaultGroupBy !== undefined && config.groupings.includes(config.defaultGroupBy) ? config.defaultGroupBy : null)

export function defaultDisplaySettings(config: DisplayConfig): DisplaySettings {
  return {
    groupBy: startingGroupBy(config),
    properties: Object.fromEntries(config.properties.map((property) => [property.id, property.defaultVisible ?? true])),
    collapsed: {},
  }
}

export function setGroupBy(settings: DisplaySettings, groupBy: string | null, config: DisplayConfig): DisplaySettings {
  if (groupBy !== null && !config.groupings.includes(groupBy)) return settings
  return { ...settings, groupBy }
}

export function setPropertyVisible(settings: DisplaySettings, id: string, visible: boolean, config: DisplayConfig): DisplaySettings {
  if (!config.properties.some((property) => property.id === id)) return settings
  return { ...settings, properties: { ...settings.properties, [id]: visible } }
}

/** Collapses a group, or expands it again. Nothing to collapse while grouping is off. */
export function toggleCollapsed(settings: DisplaySettings, key: string): DisplaySettings {
  const { groupBy } = settings
  if (groupBy === null) return settings
  const current = settings.collapsed[groupBy] ?? []
  const next = current.includes(key) ? current.filter((existing) => existing !== key) : [...current, key]
  const { [groupBy]: _dropped, ...rest } = settings.collapsed
  return { ...settings, collapsed: next.length > 0 ? { ...rest, [groupBy]: next } : rest }
}

export function serializeDisplaySettings(settings: DisplaySettings): string {
  return JSON.stringify({ v: VERSION, ...settings })
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Read settings back. Never throws: anything it cannot trust falls back to the config's default for that
 * field, a grouping, property or group the config no longer has is dropped, and a property added since
 * the settings were stored takes its default.
 */
export function parseDisplaySettings(raw: string | null, config: DisplayConfig): DisplaySettings {
  const defaults = defaultDisplaySettings(config)
  if (raw === null || raw === "") return defaults

  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return defaults
  }
  if (!isRecord(stored) || stored.v !== VERSION) return defaults

  const groupBy = stored.groupBy === null ? null : typeof stored.groupBy === "string" && config.groupings.includes(stored.groupBy) ? stored.groupBy : defaults.groupBy

  const properties = { ...defaults.properties }
  if (isRecord(stored.properties)) {
    for (const id of Object.keys(properties)) {
      const value = stored.properties[id]
      if (typeof value === "boolean") properties[id] = value
    }
  }

  const collapsed: Record<string, string[]> = {}
  if (isRecord(stored.collapsed)) {
    for (const id of config.groupings) {
      const keys = stored.collapsed[id]
      if (!Array.isArray(keys)) continue
      const valid = keys.filter((key): key is string => typeof key === "string")
      if (valid.length > 0) collapsed[id] = valid
    }
  }

  return { groupBy, properties, collapsed }
}

/** Where a view's settings are kept in storage. */
export const displaySettingsKey = (viewId: string) => `display-settings:${viewId}`

/**
 * The cells whose property is switched on. Pass the row's togglable cells, for example
 * `<IssueRow title={…} {...pickVisible({ priority, identifier, labels }, settings)} />`. A cell the
 * settings do not list is dropped, so a cell the menu cannot switch back on is never left half shown.
 */
export function pickVisible<Cells extends Record<string, unknown>>(cells: Cells, settings: DisplaySettings): Partial<Cells> {
  return Object.fromEntries(Object.entries(cells).filter(([id]) => settings.properties[id] === true)) as Partial<Cells>
}
