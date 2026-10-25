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

const glassBar = "surface-glass rounded-xl border border-border/60 shadow-lg"

const tabClass = (active: boolean) =>
  cn(
    "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-2xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-5 [&_svg]:shrink-0",
    active ? "bg-muted text-foreground [&_svg]:text-primary" : "text-muted-foreground hover:text-foreground"
  )

const sidebarLinkClass = (active: boolean) =>
  cn(
    "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
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
    <div data-slot="app-shell" className={cn("min-h-dvh bg-background text-foreground", className)}>
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
        <div className="pointer-events-none sticky top-0 z-30 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <header
            data-slot="app-shell-header"
            className={cn(glassBar, "pointer-events-auto flex min-h-14 items-center gap-1 px-2")}
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
          className="mx-auto w-full max-w-5xl flex-1 px-4 pt-2 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:px-6 lg:pb-6"
        >
          {children}
        </main>
      </div>

      <nav
        data-slot="app-shell-tabbar"
        aria-label="Sections"
        className={cn(
          glassBar,
          "fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 flex items-stretch gap-1 p-1 lg:hidden"
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
                        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
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
    </div>
  )
}

export { AppShell }
export type { AppShellProps, ShellSection }
