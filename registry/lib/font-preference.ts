// The visitor's font choice: the registry's default face, or Aspekta (UI) with Azeret Mono (code).
//
// It is a separate choice from the theme, stored per device under its own name: a cookie
// that apps on one parent domain share, with localStorage as the fallback for a host
// outside that domain. It is applied to <html> as data-font="aspekta". The default font
// sets no attribute at all, so a page that never opts in is exactly the page it was.
// The faces and the rules that switch to them are the `font-aspekta` item.

import {
  readStoredValue,
  writeStoredValue,
  type PreferenceEnvironment,
  type WriteOptions,
} from "@/lib/theme-preference"

export const FONTS = ["default", "aspekta"] as const

export type Font = (typeof FONTS)[number]

export const DEFAULT_FONT: Font = "default"
export const FONT_COOKIE_NAME = "ds-font"

const isFont = (value: string): value is Font => (FONTS as readonly string[]).includes(value)

export const parseFont = (raw: string | null | undefined): Font => (raw && isFont(raw) ? raw : DEFAULT_FONT)

export const readFont = (environment: PreferenceEnvironment = {}) =>
  parseFont(readStoredValue(FONT_COOKIE_NAME, environment))

export const writeFont = (font: Font, options: WriteOptions = {}) => writeStoredValue(FONT_COOKIE_NAME, font, options)

export type ApplyFontOptions = {
  /** Defaults to `document.documentElement`. */
  root?: HTMLElement
}

export function applyFont(font: Font, { root = document.documentElement }: ApplyFontOptions = {}) {
  if (font === DEFAULT_FONT) root.removeAttribute("data-font")
  else root.setAttribute("data-font", font)
}

export function setFont(font: Font, { root, ...options }: WriteOptions & ApplyFontOptions = {}) {
  writeFont(font, options)
  applyFont(font, { root })
}

/**
 * Inline script for <head>, run before first paint so the page never flashes the wrong
 * font. Plain ES5 because the oldest consumers cannot parse more. Hosts under a strict
 * CSP serve it as a same-origin file instead of inlining it.
 */
export const fontInitScript = () =>
  `(function(){var d=document,r=d.documentElement,n=${JSON.stringify(FONT_COOKIE_NAME)},` +
  `fonts=${JSON.stringify(FONTS)},raw=null;` +
  `try{var m=d.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)"));if(m)raw=decodeURIComponent(m[1])}catch(e){raw=null}` +
  `if(raw===null){try{raw=localStorage.getItem(n)}catch(e){raw=null}}` +
  `if(raw&&raw!==${JSON.stringify(DEFAULT_FONT)}&&fonts.indexOf(raw)>-1){r.setAttribute("data-font",raw)}` +
  `})();`
