// The visitor's theme choice: which of the six themes, and Light / Dark / System.
//
// It is stored per device, as a cookie that apps on one parent domain share, with
// localStorage as the fallback for a host outside that domain. It is applied to
// <html> as data-theme="<theme>" plus the `dark` class (see the Themes block in
// the theme item's tokens.css). Ocean following the system is the default.

export const THEMES = ["default", "t3-chat", "grove", "ocean", "ember", "iris"] as const
export const MODES = ["light", "dark", "system"] as const

export type Theme = (typeof THEMES)[number]
export type ModePreference = (typeof MODES)[number]
export type ThemePreference = { theme: Theme; mode: ModePreference }

export const DEFAULT_THEME: Theme = "ocean"
export const DEFAULT_MODE: ModePreference = "system"
export const COOKIE_NAME = "ds-theme"

// Browsers cap a cookie's lifetime at 400 days.
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60
const DARK_QUERY = "(prefers-color-scheme: dark)"

export type CookieJar = { cookie: string }
export type StorageLike = Pick<Storage, "getItem" | "setItem">

export type PreferenceEnvironment = {
  /** Defaults to `document`. */
  cookies?: CookieJar
  /** Defaults to `localStorage`; null where the browser blocks it. */
  storage?: StorageLike | null
}

export type WriteOptions = PreferenceEnvironment & {
  /** Parent domain the cookie is shared across, e.g. ".myargus.cc". Host-only when omitted. */
  cookieDomain?: string
  /** Defaults to whether the page is on https. */
  secure?: boolean
}

export type ApplyOptions = {
  /** Defaults to `document.documentElement`. */
  root?: HTMLElement
  prefersDark: boolean
}

const isTheme = (value: string): value is Theme => (THEMES as readonly string[]).includes(value)
const isMode = (value: string): value is ModePreference => (MODES as readonly string[]).includes(value)

export const serializePreference = ({ theme, mode }: ThemePreference) => `${theme}.${mode}`

// Falls back per field: a stale theme name keeps the stored mode and the other way round.
export function parsePreference(raw: string | null | undefined): ThemePreference {
  const [theme = "", mode = "", ...rest] = (raw ?? "").split(".")
  const parts = rest.length === 0 ? { theme, mode } : { theme: "", mode: "" }
  return {
    theme: isTheme(parts.theme) ? parts.theme : DEFAULT_THEME,
    mode: isMode(parts.mode) ? parts.mode : DEFAULT_MODE,
  }
}

const defaultCookies = (): CookieJar | undefined => (typeof document === "undefined" ? undefined : document)

// Reading `localStorage` itself throws when the browser blocks storage.
function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

function readStored(storage: StorageLike | null): string | null {
  if (!storage) return null
  try {
    return storage.getItem(COOKIE_NAME)
  } catch {
    return null
  }
}

function readCookie(cookies: CookieJar | undefined): string | null {
  if (!cookies) return null
  const prefix = `${COOKIE_NAME}=`
  const entry = cookies.cookie.split("; ").find((candidate) => candidate.startsWith(prefix))
  if (!entry) return null
  try {
    return decodeURIComponent(entry.slice(prefix.length))
  } catch {
    return null
  }
}

export function readPreference({ cookies = defaultCookies(), storage = defaultStorage() }: PreferenceEnvironment = {}) {
  return parsePreference(readCookie(cookies) ?? readStored(storage))
}

// The cookie is the shared copy; localStorage is written too, so a host outside
// the cookie domain (where the browser drops the cookie) still remembers the choice.
export function writePreference(
  preference: ThemePreference,
  {
    cookies = defaultCookies(),
    storage = defaultStorage(),
    cookieDomain,
    secure = typeof location !== "undefined" && location.protocol === "https:",
  }: WriteOptions = {},
) {
  const value = serializePreference(preference)
  if (cookies) {
    const attributes = [
      `${COOKIE_NAME}=${encodeURIComponent(value)}`,
      ...(cookieDomain ? [`Domain=${cookieDomain}`] : []),
      "Path=/",
      `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
      "SameSite=Lax",
      ...(secure ? ["Secure"] : []),
    ]
    cookies.cookie = attributes.join("; ")
  }
  if (storage) {
    try {
      storage.setItem(COOKIE_NAME, value)
    } catch {
      // Storage full or blocked: the cookie above still carries the choice.
    }
  }
}

export const resolveMode = (mode: ModePreference, prefersDark: boolean): "light" | "dark" =>
  mode === "system" ? (prefersDark ? "dark" : "light") : mode

export function applyPreference(
  { theme, mode }: ThemePreference,
  { root = document.documentElement, prefersDark }: ApplyOptions,
) {
  root.setAttribute("data-theme", theme)
  root.classList.toggle("dark", resolveMode(mode, prefersDark) === "dark")
}

export const systemPrefersDark = (matchMedia: typeof window.matchMedia | undefined = globalThis.matchMedia) =>
  matchMedia ? matchMedia(DARK_QUERY).matches : false

export function setPreference(
  preference: ThemePreference,
  { root, prefersDark = systemPrefersDark(), ...environment }: WriteOptions & Partial<ApplyOptions>,
) {
  writePreference(preference, environment)
  applyPreference(preference, { root, prefersDark })
}

/** Calls `onChange` when the system switches between light and dark. Returns the unsubscribe. */
export function watchSystemMode(
  onChange: (prefersDark: boolean) => void,
  matchMedia: typeof window.matchMedia | undefined = globalThis.matchMedia,
) {
  if (!matchMedia) return () => undefined
  const query = matchMedia(DARK_QUERY)
  const listener = (event: { matches: boolean }) => onChange(event.matches)
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}

/**
 * Inline script for <head>, run before first paint so the page never flashes the
 * wrong theme. Plain ES5 because the oldest consumers cannot parse more. Hosts
 * under a strict CSP serve it as a same-origin file instead of inlining it.
 */
export const themeInitScript = () =>
  `(function(){var d=document,r=d.documentElement,n=${JSON.stringify(COOKIE_NAME)},` +
  `themes=${JSON.stringify(THEMES)},modes=${JSON.stringify(MODES)},raw=null;` +
  `try{var m=d.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)"));if(m)raw=decodeURIComponent(m[1])}catch(e){raw=null}` +
  `if(raw===null){try{raw=localStorage.getItem(n)}catch(e){raw=null}}` +
  `var p=(raw||"").split("."),t=p.length===2&&themes.indexOf(p[0])>-1?p[0]:${JSON.stringify(DEFAULT_THEME)},` +
  `o=p.length===2&&modes.indexOf(p[1])>-1?p[1]:${JSON.stringify(DEFAULT_MODE)},` +
  `s=false;try{s=!!(window.matchMedia&&window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches)}catch(e){s=false}` +
  `var dark=o==="dark"||(o==="system"&&s);` +
  `r.setAttribute("data-theme",t);` +
  `if(dark){r.classList.add("dark")}else{r.classList.remove("dark")}` +
  `})();`
