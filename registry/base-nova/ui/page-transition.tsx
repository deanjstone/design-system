"use client"

import { accentChain } from "glimm"
import { GlimmProvider, useGlimm, type GlimmDefaults, type SweepOptions } from "glimm/react"
import * as React from "react"

import { DEFAULT_TOKENS, isDarkMode, resolveSweepLook } from "@/lib/page-transition-core"

// A WebGL sweep between views: a band in the theme's colours crosses the screen and the new view
// appears behind it (glimm, https://glimm.dev). Opt-in: nothing changes in an app until it renders
// PageTransitionProvider and calls transition() around a navigation or state change.
//
// Every failure path is a plain cut, so the visitor always reaches the new view:
//   - prefers-reduced-motion: reduce
//   - no WebGL (glimm cannot create a context)
//   - the WebGL context is lost after the first sweep (glimm's own sweep path has no handler for it)
//   - the theme tokens are not on the page

type Navigate = () => void | Promise<void>
type Transition = (navigate: Navigate, options?: SweepOptions) => Promise<void>

type ContextValue = { tokens: readonly string[]; contextLost: React.RefObject<boolean> }

const PageTransitionContext = React.createContext<ContextValue | null>(null)

type ProviderProps = Omit<GlimmDefaults, "reducedMotion" | "palette" | "brightness" | "onController"> & {
  children: React.ReactNode
  /** CSS custom properties the band runs through, in order. Defaults to --primary, --chart-5, --chart-4. */
  tokens?: readonly string[]
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
}

export function PageTransitionProvider({ children, tokens = DEFAULT_TOKENS, ...defaults }: ProviderProps) {
  const contextLost = React.useRef(false)
  const value = React.useMemo(() => ({ tokens, contextLost }), [tokens])

  const watchContext = React.useCallback<NonNullable<GlimmDefaults["onController"]>>((controller) => {
    controller.canvas.addEventListener(
      "webglcontextlost",
      () => {
        contextLost.current = true
      },
      { once: true },
    )
  }, [])

  return (
    <PageTransitionContext.Provider value={value}>
      <GlimmProvider {...defaults} reducedMotion="instant" onController={watchContext}>
        {children}
      </GlimmProvider>
    </PageTransitionContext.Provider>
  )
}

/**
 * `transition(navigate, options?)` runs `navigate` behind the sweep and resolves when the sweep has
 * finished (or, on a plain cut, when `navigate` has). The colours are read from the theme when the
 * transition starts, so a theme or light/dark change between navigations shows. An error thrown by
 * `navigate` reaches the caller on the cut path.
 */
export function usePageTransition(): { transition: Transition } {
  const context = React.useContext(PageTransitionContext)
  if (!context) throw new Error("usePageTransition must be used inside <PageTransitionProvider>")
  const { sweep } = useGlimm()
  const { tokens, contextLost } = context

  const transition = React.useCallback<Transition>(
    async (navigate, options) => {
      const look = resolveSweepLook(getComputedStyle(document.documentElement), {
        dark: isDarkMode(document.documentElement),
        tokens,
      })
      if (!look || contextLost.current || prefersReducedMotion()) {
        await navigate()
        return
      }
      await sweep(navigate, { palette: accentChain(look.colors), brightness: look.brightness, ...options }).done
    },
    [sweep, tokens, contextLost],
  )

  return { transition }
}
