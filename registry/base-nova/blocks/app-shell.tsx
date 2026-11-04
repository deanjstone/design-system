"use client"

import * as React from "react"
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react"
import { cn } from "cn"

import { AppSwitcher, type AppSwitcherProps } from "@/components/app-switcher"
import { buttonVariants } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { renderAnchor, type RenderLink } from "@/lib/nav-link"

type ShellSection = {
  id: string
  label: string
  href: string
  /** An icon element, e.g. `<InboxIcon />`. */
  icon: React.ReactNode
}

type AppShellProps = Pick<AppSwitcherProps, "mode" | "onModeChange" | "currentAppId"> & {
  appName: string
  /** The app's top-level sections, in order. The first four become tabs; any more go under More. */
  sections: ShellSection[]
  activeSectionId?: string
  /** Every app, for the switcher the app name opens. Without it the name is plain text. */
  apps?: AppSwitcherProps["apps"]
  /**
   * "full" (default) draws the header, tab bar and sidebar. "none" is focus mode for an immersive view
   * (mail thread, article, graph, scanner): no chrome, the whole screen to the page, and just the back
   * control (if `back` is set) in the top-left corner, clear of the display curve.
   */
  chrome?: "full" | "none"
  /**
   * Slide the header away on scroll down and back on scroll up, to give the page the room (about 64px).
   * Off by default, and always off under `prefers-reduced-motion`. A control inside the header that has
   * focus keeps it in place (WCAG 2.4.11).
   */
  autoHideHeader?: boolean
  /** Set on a drill-down page: the header gets a back button to the parent (in focus mode, a floating one). */
  back?: { href: string; label?: string }
  /** Controls at the end of the header. */
  headerActions?: React.ReactNode
  renderLink?: RenderLink
  className?: string
  children: React.ReactNode
}

// A phone shows four tabs; a fifth section means the fourth slot is not enough,
// so every section past the fourth waits under More.
const TAB_COUNT = 4

// The shell's chrome is fixed or sticky, so a page can't know its height. The shell measures the
// header zone and the tab bar and publishes them as --shell-top, --shell-bottom and --shell-workspace
// (the viewport between the two), plus the page's scroll padding so a focused control is never hidden
// behind either (WCAG 2.4.11). The class fallbacks below hold until the first measurement, on the
// server, and where ResizeObserver is missing; they are the same heights the chrome is built to.
const workspaceFallback = (showTabBar: boolean, focus: boolean) =>
  focus
    ? "[--shell-top:0px] [--shell-bottom:var(--edge-b)] [--shell-workspace:calc(100dvh_-_var(--shell-top)_-_var(--shell-bottom))]"
    : cn(
        "[--shell-top:calc(var(--safe-t)_+_min(4rem,96px))] [--shell-workspace:calc(100dvh_-_var(--shell-top)_-_var(--shell-bottom))] lg:[--shell-bottom:0px]",
        showTabBar
          ? "[--shell-bottom:calc(var(--edge-b)_+_min(3.75rem,90px))] [@media(orientation:landscape)_and_(max-height:500px)]:[--shell-bottom:var(--edge-b)]"
          : "[--shell-bottom:var(--edge-b)]"
      )

// A phone turned on its side: short enough that a bottom bar and a sticky header cost too much of it.
// The rail classes below spell this query out in full (Tailwind needs whole class names).
const RAIL_QUERY = "(orientation: landscape) and (max-height: 500px)"

// In focus mode the only thing over the page is the back control; a focused control scrolls clear of it.
const BACK_CLEARANCE = 8

const setPixels = (target: HTMLElement, name: string, pixels: number) => {
  if (pixels > 0) target.style.setProperty(name, `${pixels}px`)
  else target.style.removeProperty(name)
}

const useShellMetrics = (
  rootRef: React.RefObject<HTMLElement | null>,
  topRef: React.RefObject<HTMLElement | null>,
  barRef: React.RefObject<HTMLElement | null>,
  backRef: React.RefObject<HTMLElement | null>,
  showTabBar: boolean,
  focus: boolean,
  rail: boolean
) => {
  React.useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const top = topRef.current
    if (!focus && !top) return
    const page = document.documentElement

    const publish = (name: string, scrollPadName: string, pixels: number) => {
      setPixels(root, name, pixels)
      setPixels(page, scrollPadName, pixels)
    }
    const measure = () => {
      if (focus) {
        const back = backRef.current
        const backBottom = back ? (Number.parseFloat(getComputedStyle(back).top) || 0) + back.offsetHeight : 0
        setPixels(page, "--scroll-pad-top", backBottom > 0 ? backBottom + BACK_CLEARANCE : 0)
        return
      }
      const bar = barRef.current
      const topHeight = top ? top.offsetHeight : 0
      setPixels(root, "--shell-top", topHeight)
      // In the rail the header scrolls away, so nothing sticks over the page to scroll clear of.
      setPixels(page, "--scroll-pad-top", rail ? 0 : topHeight)
      // A bar hidden from lg has no height; the CSS fallback (0 there) applies. The rail runs up the
      // side, so it has no bottom height either; the fallback (the bottom edge alone) applies.
      const barHeight = bar && !rail ? bar.offsetHeight : 0
      const barOffset = bar && barHeight > 0 ? Number.parseFloat(getComputedStyle(bar).bottom) || 0 : 0
      publish("--shell-bottom", "--scroll-pad-bottom", barHeight > 0 ? barHeight + barOffset : 0)
    }

    measure()
    const release = () => {
      publish("--shell-top", "--scroll-pad-top", 0)
      publish("--shell-bottom", "--scroll-pad-bottom", 0)
    }
    if (typeof ResizeObserver === "undefined") return release
    const observer = new ResizeObserver(measure)
    if (top) observer.observe(top)
    if (barRef.current) observer.observe(barRef.current)
    if (backRef.current) observer.observe(backRef.current)
    return () => {
      observer.disconnect()
      release()
    }
  }, [rootRef, topRef, barRef, backRef, showTabBar, focus, rail])
}

// WebKit on iOS can match :focus-visible after a tap (focus handed back to the More tab when its sheet
// closes), leaving a ring on a control nobody tabbed to. The shell marks its root while the last input
// was a pointer or a touch and clears the mark on a key press; the controls hold their ring off under
// the mark (`group-data-[pointer]/shell:focus-visible:ring-0!`, important so it wins whatever order the
// two sort in). Modifier keys alone don't count as a key press, as in the browsers' own heuristic.
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"])

const usePointerModality = (rootRef: React.RefObject<HTMLElement | null>) => {
  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const onPointer = () => root.setAttribute("data-pointer", "")
    const onKey = (event: KeyboardEvent) => {
      if (!MODIFIER_KEYS.has(event.key)) root.removeAttribute("data-pointer")
    }
    document.addEventListener("pointerdown", onPointer, true)
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", onPointer, true)
      document.removeEventListener("keydown", onKey, true)
      root.removeAttribute("data-pointer")
    }
  }, [rootRef])
}

// The scroll that must build up in one direction before the header moves, so a finger's jitter doesn't.
const HIDE_THRESHOLD = 8

const useMediaQuery = (query: string) =>
  React.useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== "function") return () => {}
      const list = window.matchMedia(query)
      list.addEventListener("change", notify)
      return () => list.removeEventListener("change", notify)
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false
  )

// True while the header is slid away: scrolled down past its own height. Scrolling up, reaching the top
// of the page, or focus arriving in the header brings it back, and focus already inside it stops it
// leaving. Off under reduced motion.
const useAutoHideHeader = (topRef: React.RefObject<HTMLElement | null>, enabled: boolean) => {
  const [hidden, setHidden] = React.useState(false)
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const active = enabled && !reducedMotion

  React.useEffect(() => {
    const top = topRef.current
    if (!active || !top) {
      setHidden(false)
      return undefined
    }
    let last = Math.max(window.scrollY, 0)
    const onScroll = () => {
      const y = Math.max(window.scrollY, 0)
      if (y <= 0) {
        last = y
        setHidden(false)
        return
      }
      const delta = y - last
      if (Math.abs(delta) < HIDE_THRESHOLD) return
      last = y
      if (delta < 0) setHidden(false)
      else if (y > top.offsetHeight && !top.contains(document.activeElement)) setHidden(true)
    }
    const onFocusIn = () => setHidden(false)
    window.addEventListener("scroll", onScroll, { passive: true })
    top.addEventListener("focusin", onFocusIn)
    return () => {
      window.removeEventListener("scroll", onScroll)
      top.removeEventListener("focusin", onFocusIn)
      setHidden(false)
    }
  }, [topRef, active])

  return active && hidden
}

const glassBar = "surface-glass border border-border/60 shadow-lg"

const tabClass = (active: boolean) =>
  cn(
    "flex min-h-[clamp(44px,3.125rem,75px)] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[min(0.75rem,18px)] leading-[min(1rem,24px)] font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring group-data-[pointer]/shell:focus-visible:ring-0! max-[15rem]:[&>span]:sr-only @max-[16rem]/tabbar:[&>span]:sr-only @max-[16rem]/tabbar:min-h-[44px] [@media(orientation:landscape)_and_(max-height:500px)]:min-h-11 [@media(orientation:landscape)_and_(max-height:500px)]:min-w-11 [@media(orientation:landscape)_and_(max-height:500px)]:flex-none [@media(orientation:landscape)_and_(max-height:500px)]:[&>span]:sr-only [&_svg]:size-[min(1.25rem,30px)] [&_svg]:shrink-0",
    active ? "bg-muted text-foreground" : "text-foreground/80 hover:text-foreground"
  )

const sidebarLinkClass = (active: boolean) =>
  cn(
    "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring group-data-[pointer]/shell:focus-visible:ring-0! [&_svg]:size-4 [&_svg]:shrink-0",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
  )

// The frame every app shares: a floating glass header (the app name opens the app
// switcher; a drill-down page adds a back button), a floating glass tab bar on a
// phone, and from 1024px the same sections as a left sidebar. See DESIGN.md § Layout blocks.
function AppShell({
  appName,
  sections,
  activeSectionId,
  apps = [],
  currentAppId,
  mode,
  onModeChange,
  chrome = "full",
  autoHideHeader = false,
  back,
  headerActions,
  renderLink = renderAnchor,
  className,
  children,
}: AppShellProps) {
  const tabs = sections.length > TAB_COUNT ? sections.slice(0, TAB_COUNT) : sections
  const overflow = sections.slice(tabs.length)
  // One section has nothing to switch to, so the bar would cost its height for a single tab.
  const showTabBar = sections.length >= 2
  const rootRef = React.useRef<HTMLDivElement>(null)
  const topRef = React.useRef<HTMLDivElement>(null)
  const barRef = React.useRef<HTMLElement>(null)
  const backRef = React.useRef<HTMLDivElement>(null)
  const focus = chrome === "none"
  const rail = useMediaQuery(RAIL_QUERY)
  useShellMetrics(rootRef, topRef, barRef, backRef, showTabBar, focus, rail)
  usePointerModality(rootRef)
  // In the rail the header is not sticky: it scrolls away by itself.
  const headerHidden = useAutoHideHeader(topRef, autoHideHeader && !focus && !rail)
  const overflowActive = overflow.some((entry) => entry.id === activeSectionId)

  const link = (entry: ShellSection, className: (active: boolean) => string) => {
    const active = entry.id === activeSectionId
    return renderLink({
      href: entry.href,
      "aria-current": active ? "page" : undefined,
      className: className(active),
      children: (
        <>
          {entry.icon}
          <span className="max-w-full truncate">{entry.label}</span>
        </>
      ),
    })
  }

  return (
    <div
      ref={rootRef}
      data-slot="app-shell"
      className={cn("group/shell min-h-dvh bg-background text-foreground", workspaceFallback(showTabBar, focus), className)}
    >
      {focus ? null : (
        <aside
          data-slot="app-shell-sidebar"
          className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3 pt-safe lg:flex"
        >
          <nav aria-label="Sections" className="flex flex-col gap-1">
            {sections.map((entry) => (
              <React.Fragment key={entry.id}>{link(entry, sidebarLinkClass)}</React.Fragment>
            ))}
          </nav>
        </aside>
      )}

      <div data-slot="app-shell-column" className={cn("flex min-h-dvh flex-col", !focus && "lg:pl-64")}>
        <div
          data-slot="app-shell-status-fill"
          aria-hidden="true"
          className={cn(
            "pointer-events-none fixed inset-x-0 top-0 z-40 h-[calc(env(safe-area-inset-top)+0.5rem)] bg-background",
            !focus && "lg:left-64"
          )}
        />
        {focus ? (
          back ? (
            <div
              ref={backRef}
              data-slot="app-shell-focus-back"
              className="fixed top-[max(1rem,var(--safe-t))] left-[max(1rem,var(--safe-l))] z-50"
            >
              {renderLink({
                href: back.href,
                "aria-label": back.label ?? "Back",
                className: cn(
                  glassBar,
                  "flex min-h-[clamp(44px,2.75rem,66px)] min-w-[clamp(44px,2.75rem,66px)] items-center justify-center rounded-full text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring [&_svg]:size-5 [&_svg]:shrink-0"
                ),
                children: <ChevronLeftIcon aria-hidden="true" />,
              })}
            </div>
          ) : null
        ) : (
          <div
            ref={topRef}
            data-slot="app-shell-top"
            data-hidden={headerHidden ? "true" : undefined}
            className={cn(
              "pointer-events-none sticky top-0 z-30 [@media(orientation:landscape)_and_(max-height:500px)]:static transition-transform duration-200 data-[hidden=true]:-translate-y-full focus-within:translate-y-0 motion-reduce:transition-none pr-[max(0.5rem,var(--safe-r))] pl-[max(0.5rem,var(--safe-l))] pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2",
              showTabBar && "[@media(orientation:landscape)_and_(max-height:500px)]:pl-[calc(var(--edge-x)+4rem)]"
            )}
          >
            <header
              data-slot="app-shell-header"
              className={cn(glassBar, "pointer-events-auto flex min-h-[min(3rem,72px)] items-center gap-1 rounded-xl px-2")}
            >
              {back
                ? renderLink({
                    href: back.href,
                    "aria-label": back.label ?? "Back",
                    className: cn(buttonVariants({ variant: "ghost", size: "icon" }), "max-h-[66px] max-w-[66px] min-h-[clamp(44px,2.75rem,66px)] min-w-[clamp(44px,2.75rem,66px)] shrink-0"),
                    children: <ChevronLeftIcon aria-hidden="true" />,
                  })
                : null}
              <AppSwitcher
                appName={appName}
                apps={apps}
                currentAppId={currentAppId}
                mode={mode}
                onModeChange={onModeChange}
                renderLink={renderLink}
              />
              {headerActions ? <div className="ml-auto flex shrink-0 items-center gap-1 [&_.size-8]:max-h-[66px] [&_.size-8]:max-w-[66px] [&_.size-9]:max-h-[66px] [&_.size-9]:max-w-[66px]">{headerActions}</div> : null}
            </header>
          </div>
        )}

        <main
          data-slot="app-shell-main"
          className={cn(
            "mx-auto flex w-full max-w-5xl flex-1 flex-col px-edge lg:px-6",
            focus
              ? cn("pb-edge", back ? "pt-[calc(max(1rem,var(--safe-t))+min(3.25rem,78px))]" : "pt-[max(1rem,var(--safe-t))]")
              : cn("pt-2 lg:pb-6 [@media(orientation:landscape)_and_(max-height:500px)]:pb-edge", showTabBar ? "pb-[calc(6rem+var(--edge-b))] [@media(orientation:landscape)_and_(max-height:500px)]:pl-[calc(var(--edge-x)+4.5rem)]" : "pb-edge")
          )}
        >
          {children}
        </main>
      </div>

      {showTabBar && !focus ? (
        <div
          data-slot="app-shell-bottom-fill"
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-(--edge-b) bg-background lg:hidden"
        />
      ) : null}
      {showTabBar && !focus ? (
        <nav
          ref={barRef}
          data-slot="app-shell-tabbar"
          aria-label="Sections"
          className={cn(
            glassBar,
            "@container/tabbar fixed right-[max(1.3rem,env(safe-area-inset-right))] bottom-[max(0.5rem,calc(env(safe-area-inset-bottom)-12px))] left-[max(1.3rem,env(safe-area-inset-left))] z-30 flex items-stretch gap-1 rounded-[2rem] p-1 lg:hidden [@media(orientation:landscape)_and_(max-height:500px)]:top-[max(0.5rem,var(--safe-t))] [@media(orientation:landscape)_and_(max-height:500px)]:right-auto [@media(orientation:landscape)_and_(max-height:500px)]:bottom-[var(--edge-b)] [@media(orientation:landscape)_and_(max-height:500px)]:left-[var(--edge-x)] [@media(orientation:landscape)_and_(max-height:500px)]:w-14 [@media(orientation:landscape)_and_(max-height:500px)]:flex-col [@media(orientation:landscape)_and_(max-height:500px)]:overflow-y-auto [@media(orientation:landscape)_and_(max-height:500px)]:rounded-2xl"
          )}
        >
          {tabs.map((entry) => (
            <React.Fragment key={entry.id}>{link(entry, tabClass)}</React.Fragment>
          ))}
          {overflow.length > 0 ? (
            <Sheet>
              <SheetTrigger
                data-slot="app-shell-more"
                data-active={overflowActive ? "true" : undefined}
                className={tabClass(overflowActive)}
              >
                <EllipsisIcon aria-hidden="true" />
                <span className="truncate">More</span>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-xl">
                <SheetHeader>
                  <SheetTitle>More</SheetTitle>
                  <SheetDescription className="sr-only">The rest of this app&apos;s sections.</SheetDescription>
                </SheetHeader>
                <ul className="flex flex-col gap-1 px-2 pb-2">
                  {overflow.map((entry) => (
                    <li key={entry.id}>
                      {link(entry, (active) =>
                        cn(
                          "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0",
                          active && "bg-muted"
                        )
                      )}
                    </li>
                  ))}
                </ul>
              </SheetContent>
            </Sheet>
          ) : null}
        </nav>
      ) : null}
    </div>
  )
}

export { AppShell }
export type { AppShellProps, ShellSection }
