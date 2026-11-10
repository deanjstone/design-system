import * as React from "react"

import {
  DEFAULT_FONT,
  applyFont,
  readFont,
  setFont as storeFont,
  type Font,
} from "@/lib/font-preference"

type Options = {
  /** Parent domain the cookie is shared across: pass COOKIE_DOMAIN from the links registry. Host-only when omitted. */
  cookieDomain?: string
}

// The visitor's font choice as React state. The stored choice is read after mount, so the
// first render matches the server's; `fontInitScript()` in <head> has already applied it.
export function useFontPreference({ cookieDomain }: Options = {}) {
  const [font, setStored] = React.useState<Font>(DEFAULT_FONT)

  React.useEffect(() => {
    const stored = readFont()
    setStored(stored)
    applyFont(stored)
  }, [])

  const setFont = React.useCallback(
    (next: Font) => {
      setStored(next)
      storeFont(next, { cookieDomain })
    },
    [cookieDomain],
  )

  return { font, setFont }
}
