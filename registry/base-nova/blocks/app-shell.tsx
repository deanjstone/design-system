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
  /** Set on a drill-down page: the header gets a back button to the parent. */
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
const workspaceFallback = (showTabBar: boolean) =>
  cn(
    "[--shell-top:calc(var(--safe-t)_+_4rem)] [--shell-workspace:calc(100dvh_-_var(--shell-top)_-_var(--shell-bottom))] lg:[--shell-bottom:0px]",
    showTabBar ? "[--shell-bottom:calc(var(--edge-b)_+_3.75rem)]" : "[--shell-bottom:var(--edge-b)]"
  )

const useShellMetrics = (
  rootRef: React.RefObject<HTMLElement | null>,
  topRef: React.RefObject<HTMLElement | null>,
  barRef: React.RefObject<HTMLElement | null>,
  showTabBar: boolean
) => {
  React.useLayoutEffect(() => {
    const root = rootRef.current
    const top = topRef.current
    if (!root || !top) return
    const page = document.documentElement

    const publish = (name: string, scrollPadName: string, pixels: number) => {
      if (pixels > 0) {
        root.style.setProperty(name, `${pixels}px`)
        page.style.setProperty(scrollPadName, `${pixels}px`)
      } else {
        root.style.removeProperty(name)
        page.style.removeProperty(scrollPadName)
      }
    }
    const measure = () => {
      const bar = barRef.current
      publish("--shell-top", "--scroll-pad-top", top.offsetHeight)
      // A bar hidden from lg has no height; the CSS fallback (0 there) applies.
      const barHeight = bar ? bar.offsetHeight : 0
      const barOffset = bar && barHeight > 0 ? Number.parseFloat(getComputedStyle(bar).bottom) || 0 : 0
      publish("--shell-bottom", "--scroll-pad-bottom", barHeight > 0 ? barHeight + barOffset : 0)
    }

    measure()
    if (typeof ResizeObserver === "undefined") return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(top)
    if (barRef.current) observer.observe(barRef.current)
    return () => {
      observer.disconnect()
      publish("--shell-top", "--scroll-pad-top", 0)
      publish("--shell-bottom", "--scroll-pad-bottom", 0)
    }
  }, [rootRef, topRef, barRef, showTabBar])
}

const glassBar = "surface-glass border border-border/60 shadow-lg"

const tabClass = (active: boolean) =>
  cn(
    "flex min-h-12.5 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-2xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring max-[15rem]:[&>span]:sr-only [&_svg]:size-5 [&_svg]:shrink-0",
    active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
  )

const sidebarLinkClass = (active: boolean) =>
  cn(
    "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring [&_svg]:size-4 [&_svg]:shrink-0",
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
  useShellMetrics(rootRef, topRef, barRef, showTabBar)
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
          <span className="truncate">{entry.label}</span>
        </>
      ),
    })
  }

  return (
    <div
      ref={rootRef}
      data-slot="app-shell"
      className={cn("min-h-dvh bg-background text-foreground", workspaceFallback(showTabBar), className)}
    >
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

      <div data-slot="app-shell-column" className="flex min-h-dvh flex-col lg:pl-64">
        <div
          data-slot="app-shell-status-fill"
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[calc(env(safe-area-inset-top)+0.5rem)] bg-background lg:left-64"
        />
        <div
          ref={topRef}
          data-slot="app-shell-top"
          className="pointer-events-none sticky top-0 z-30 pr-[max(0.5rem,var(--safe-r))] pl-[max(0.5rem,var(--safe-l))] pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2"
        >
          <header
            data-slot="app-shell-header"
            className={cn(glassBar, "pointer-events-auto flex min-h-12 items-center gap-1 rounded-xl px-2")}
          >
            {back
              ? renderLink({
                  href: back.href,
                  "aria-label": back.label ?? "Back",
                  className: cn(buttonVariants({ variant: "ghost", size: "icon" }), "min-h-11 min-w-11"),
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
            {headerActions ? <div className="ml-auto flex items-center gap-1">{headerActions}</div> : null}
          </header>
        </div>

        <main
          data-slot="app-shell-main"
          className={cn("mx-auto flex w-full max-w-5xl flex-1 flex-col px-edge pt-2 lg:px-6 lg:pb-6", showTabBar ? "pb-[calc(6rem+var(--edge-b))]" : "pb-edge")}
        >
          {children}
        </main>
      </div>

      {showTabBar ? (
        <div
          data-slot="app-shell-bottom-fill"
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-(--edge-b) bg-background lg:hidden"
        />
      ) : null}
      {showTabBar ? (
        <nav
          ref={barRef}
          data-slot="app-shell-tabbar"
          aria-label="Sections"
          className={cn(
            glassBar,
            "fixed right-[max(1.3rem,env(safe-area-inset-right))] bottom-[max(0.5rem,calc(env(safe-area-inset-bottom)-12px))] left-[max(1.3rem,env(safe-area-inset-left))] z-30 flex items-stretch gap-1 rounded-[2rem] p-1 lg:hidden"
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
                More
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-xl pb-safe">
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
