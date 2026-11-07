"use client"

// A small URL-state helper: one search param as React state, with no nuqs and no router. Reads and writes
// `window.location` through the History API, so the page keeps working under any router that leaves the
// query string alone, and a filtered view can be bookmarked and shared. With a router of your own that
// owns the search params, skip the hook and pass its value and setter to the component instead.
//
// Pattern from circle's use of nuqs (https://github.com/ln-dev7/circle), MIT License, Copyright (c) 2025
// lndev-ui | Circle Template: the page's own URL is the store. This is a fresh, much smaller
// implementation of just that idea.

import * as React from "react"

const CHANGE_EVENT = "url-state:change"

/** One param from a search string, with or without the leading `?`. Null when it is missing or empty. */
export function readParam(search: string, key: string): string | null {
  const value = new URLSearchParams(search).get(key)
  return value === "" ? null : value
}

/** The search string with one param set, replaced or (for null or empty) removed. Other params keep their order. */
export function writeParam(search: string, key: string, value: string | null): string {
  const params = new URLSearchParams(search)
  if (value == null || value === "") params.delete(key)
  else params.set(key, value)
  const next = params.toString()
  return next === "" ? "" : `?${next}`
}

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify)
  window.addEventListener(CHANGE_EVENT, notify)
  return () => {
    window.removeEventListener("popstate", notify)
    window.removeEventListener(CHANGE_EVENT, notify)
  }
}

type UrlParamOptions = {
  /** `replace` (default) rewrites the current history entry, so typing in a filter does not fill the back button. `push` adds an entry per change. */
  history?: "replace" | "push"
}

/**
 * One search param as state: `[value, setValue]`. `setValue(null)` removes it. Every component using the
 * same key sees a change at once, and the browser's back and forward buttons are followed. The server
 * render reads null, so a page that reads the param renders without it first and fills in on hydration.
 */
export function useUrlParam(key: string, { history = "replace" }: UrlParamOptions = {}) {
  const value = React.useSyncExternalStore(
    subscribe,
    () => readParam(window.location.search, key),
    () => null,
  )

  const setValue = React.useCallback(
    (next: string | null) => {
      const search = writeParam(window.location.search, key, next)
      if (search === window.location.search) return
      const url = `${window.location.pathname}${search}${window.location.hash}`
      if (history === "push") window.history.pushState(window.history.state, "", url)
      else window.history.replaceState(window.history.state, "", url)
      window.dispatchEvent(new Event(CHANGE_EVENT))
    },
    [key, history],
  )

  return [value, setValue] as const
}
