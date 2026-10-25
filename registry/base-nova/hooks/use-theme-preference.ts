import * as React from "react"

import {
  applyPreference,
  DEFAULT_MODE,
  DEFAULT_THEME,
  readPreference,
  resolveMode,
  setPreference,
  systemPrefersDark,
  watchSystemMode,
  type ModePreference,
  type Theme,
  type ThemePreference,
} from "@/lib/theme-preference"

type Options = {
  /** Parent domain the cookie is shared across, e.g. ".myargus.cc". Host-only when omitted. */
  cookieDomain?: string
}

// The visitor's theme and Light / Dark / System choice as React state. The stored
// choice is read after mount, so the first render matches the server's.
export function useThemePreference({ cookieDomain }: Options = {}) {
  const [preference, setStored] = React.useState<ThemePreference>({ theme: DEFAULT_THEME, mode: DEFAULT_MODE })
  const [prefersDark, setPrefersDark] = React.useState(false)
  const latest = React.useRef(preference)
  latest.current = preference

  React.useEffect(() => {
    setStored(readPreference())
    setPrefersDark(systemPrefersDark())
    return watchSystemMode((dark) => {
      setPrefersDark(dark)
      if (latest.current.mode === "system") applyPreference(latest.current, { prefersDark: dark })
    })
  }, [])

  const update = React.useCallback(
    (next: ThemePreference) => {
      setStored(next)
      setPreference(next, { cookieDomain, prefersDark: systemPrefersDark() })
    },
    [cookieDomain],
  )

  const setTheme = React.useCallback(
    (theme: Theme) => update({ ...latest.current, theme }),
    [update],
  )
  const setMode = React.useCallback(
    (mode: ModePreference) => update({ ...latest.current, mode }),
    [update],
  )

  return { preference, resolvedMode: resolveMode(preference.mode, prefersDark), setTheme, setMode }
}
