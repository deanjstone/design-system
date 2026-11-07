import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { displaySettingsKey, serializeDisplaySettings, defaultDisplaySettings, type DisplayConfig } from "../registry/lib/list-group-core"
import { useDisplaySettings } from "../registry/base-nova/hooks/use-display-settings"

// A view's display settings, kept per view in localStorage (design-system#194). Storage is wrapped in
// try/catch: where it throws (a private window, blocked site data) the settings still work for the page.

const config: DisplayConfig = {
  groupings: ["status", "repo"],
  properties: [
    { id: "priority", label: "Priority" },
    { id: "labels", label: "Labels" },
  ],
  defaultGroupBy: "status",
}

// The settings are module-level state shared by every hook on a view, so each test names its own view.
let view = 0
let id = ""
beforeEach(() => {
  view += 1
  id = `view-${view}`
  window.localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const stored = () => window.localStorage.getItem(displaySettingsKey(id))

describe("useDisplaySettings", () => {
  it("starts at the config's defaults when nothing is stored", () => {
    const { result } = renderHook(() => useDisplaySettings(id, config))
    expect(result.current.settings).toEqual(defaultDisplaySettings(config))
    expect(result.current.persisted).toBe(true)
  })

  it("starts from what is stored for the view, on the first render", () => {
    window.localStorage.setItem(displaySettingsKey(id), serializeDisplaySettings({ groupBy: "repo", properties: { priority: false, labels: true }, collapsed: { repo: ["argus"] } }))
    const { result } = renderHook(() => useDisplaySettings(id, config))
    expect(result.current.settings).toEqual({ groupBy: "repo", properties: { priority: false, labels: true }, collapsed: { repo: ["argus"] } })
  })

  it("falls back to the defaults for stored text it cannot read", () => {
    window.localStorage.setItem(displaySettingsKey(id), "{not json")
    const { result } = renderHook(() => useDisplaySettings(id, config))
    expect(result.current.settings).toEqual(defaultDisplaySettings(config))
  })

  it("changes the grouping, a property and a collapsed group, and writes each to storage", () => {
    const { result } = renderHook(() => useDisplaySettings(id, config))

    act(() => result.current.setGroupBy("repo"))
    expect(result.current.settings.groupBy).toBe("repo")
    act(() => result.current.setPropertyVisible("labels", false))
    expect(result.current.settings.properties.labels).toBe(false)
    act(() => result.current.toggleCollapsed("argus"))
    expect(result.current.settings.collapsed).toEqual({ repo: ["argus"] })

    expect(JSON.parse(stored()!)).toEqual({ v: 1, groupBy: "repo", properties: { priority: true, labels: false }, collapsed: { repo: ["argus"] } })
  })

  it("keeps the choices for the next visit", () => {
    const first = renderHook(() => useDisplaySettings(id, config))
    act(() => first.result.current.setPropertyVisible("priority", false))
    first.unmount()

    const second = renderHook(() => useDisplaySettings(id, config))
    expect(second.result.current.settings.properties.priority).toBe(false)
  })

  it("keeps views apart", () => {
    const one = renderHook(() => useDisplaySettings(id, config))
    const other = renderHook(() => useDisplaySettings(`${id}-other`, config))
    act(() => one.result.current.setGroupBy("repo"))
    expect(other.result.current.settings.groupBy).toBe("status")
  })

  it("keeps two lists on the same view in step", () => {
    const one = renderHook(() => useDisplaySettings(id, config))
    const two = renderHook(() => useDisplaySettings(id, config))
    act(() => one.result.current.setGroupBy("repo"))
    expect(two.result.current.settings.groupBy).toBe("repo")
  })

  it("follows a change made in another tab", () => {
    const { result } = renderHook(() => useDisplaySettings(id, config))
    const next = serializeDisplaySettings({ groupBy: "repo", properties: { priority: true, labels: false }, collapsed: {} })

    act(() => {
      window.localStorage.setItem(displaySettingsKey(id), next)
      window.dispatchEvent(new StorageEvent("storage", { key: displaySettingsKey(id), newValue: next, storageArea: window.localStorage }))
    })

    expect(result.current.settings.groupBy).toBe("repo")
    expect(result.current.settings.properties.labels).toBe(false)
  })

  it("reset goes back to the defaults and clears what is stored", () => {
    const { result } = renderHook(() => useDisplaySettings(id, config))
    act(() => result.current.setGroupBy("repo"))
    act(() => result.current.reset())
    expect(result.current.settings).toEqual(defaultDisplaySettings(config))
    expect(stored()).toBeNull()
  })

  it("keeps the same settings object while nothing changed, even when the config is written inline", () => {
    const { result, rerender } = renderHook(() => useDisplaySettings(id, { ...config, properties: [...config.properties] }))
    const before = result.current.settings
    rerender()
    expect(result.current.settings).toBe(before)
  })

  it("still works when storage throws, and says it is not persisted", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked")
    })

    const { result } = renderHook(() => useDisplaySettings(id, config))
    expect(result.current.settings).toEqual(defaultDisplaySettings(config))
    expect(result.current.persisted).toBe(true)

    act(() => result.current.setGroupBy("repo"))
    expect(result.current.settings.groupBy).toBe("repo")
    expect(result.current.persisted).toBe(false)

    act(() => result.current.reset())
    expect(result.current.settings.groupBy).toBe("status")
  })
})
