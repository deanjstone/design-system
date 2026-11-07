"use client"

// Pattern from circle's `store/display-settings-store.ts` (https://github.com/ln-dev7/circle), MIT License,
// Copyright (c) 2025 lndev-ui | Circle Template: display choices kept per view and remembered. Re-written
// without zustand: localStorage is the store, read through useSyncExternalStore, and every access is
// wrapped in try/catch because storage throws in a private window or with site data blocked.

import * as React from "react"

import {
  displaySettingsKey,
  parseDisplaySettings,
  serializeDisplaySettings,
  setGroupBy as withGroupBy,
  setPropertyVisible as withPropertyVisible,
  toggleCollapsed as withCollapsed,
  type DisplayConfig,
  type DisplaySettings,
} from "@/lib/list-group-core"

// Settings the page could not write to storage. They are used from here for the rest of the page's life,
// so the menu still works when storage is blocked; it just forgets on reload.
const unsaved = new Map<string, string>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

const read = (key: string): string | null => {
  const fallback = unsaved.get(key)
  if (fallback !== undefined) return fallback
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Storage is blocked: nothing was ever saved, so there is nothing to read.
    return null
  }
}

const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
    unsaved.delete(key)
  } catch {
    // Storage is blocked or full: keep the value for this page and report it through `persisted`.
    unsaved.set(key, value)
  }
}

const clear = (key: string) => {
  unsaved.delete(key)
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Blocked: there is nothing stored to remove.
  }
}

const subscribe = (key: string) => (listener: () => void) => {
  const onStorage = (event: StorageEvent) => {
    // Another tab changed it (or cleared everything): what this page kept in memory is stale.
    if (event.key !== null && event.key !== key) return
    unsaved.delete(key)
    listener()
  }
  listeners.add(listener)
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/**
 * A view's display settings: `const display = useDisplaySettings("pr-queue", config)`. Read
 * `display.settings`; change them with `setGroupBy`, `setPropertyVisible`, `toggleCollapsed` and `reset`.
 * They are kept in localStorage under the view's id, shared by every list on that view and by its other
 * tabs. The server render and first paint on a server use the defaults; the client reads storage on
 * hydration. `persisted` is false once a write failed.
 */
export function useDisplaySettings(viewId: string, config: DisplayConfig) {
  const key = displaySettingsKey(viewId)

  // `config` is often written inline and is a new object every render; what it holds decides how stored
  // settings parse, so key on that and keep the same settings object while the stored text is unchanged.
  const shape = JSON.stringify([config.groupings, config.properties, config.defaultGroupBy])
  const configRef = React.useRef(config)
  configRef.current = config

  const raw = React.useSyncExternalStore(
    React.useMemo(() => subscribe(key), [key]),
    () => read(key),
    () => null,
  )
  const settings = React.useMemo(() => parseDisplaySettings(raw, configRef.current), [raw, shape])

  const update = React.useCallback(
    (change: (current: DisplaySettings, config: DisplayConfig) => DisplaySettings) => {
      const current = parseDisplaySettings(read(key), configRef.current)
      write(key, serializeDisplaySettings(change(current, configRef.current)))
      notify()
    },
    [key],
  )

  const setGroupBy = React.useCallback((groupBy: string | null) => update((current, cfg) => withGroupBy(current, groupBy, cfg)), [update])
  const setPropertyVisible = React.useCallback((id: string, visible: boolean) => update((current, cfg) => withPropertyVisible(current, id, visible, cfg)), [update])
  const toggleCollapsed = React.useCallback((groupKey: string) => update((current) => withCollapsed(current, groupKey)), [update])
  const reset = React.useCallback(() => {
    clear(key)
    notify()
  }, [key])

  return { settings, setGroupBy, setPropertyVisible, toggleCollapsed, reset, persisted: !unsaved.has(key) }
}
