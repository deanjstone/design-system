"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { renderAnchor, type RenderLink } from "@/lib/nav-link"
import type { ModePreference } from "@/lib/theme-preference"

type SwitcherApp = {
  id: string
  name: string
  href: string
  description?: string
  icon?: React.ReactNode
}

type AppSwitcherProps = {
  /** The current app's name, shown on the trigger. */
  appName: string
  /** Every app, the current one included. */
  apps: SwitcherApp[]
  currentAppId?: string
  /** The chosen Light / Dark / System. The quick toggle appears when `onModeChange` is given. */
  mode?: ModePreference
  onModeChange?: (mode: ModePreference) => void
  renderLink?: RenderLink
  className?: string
}

const MODE_OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const

// The app name in the shell's header; tapping it opens a sheet with every app
// and the colour-mode quick toggle. The full theme list lives in the settings
// page's Appearance section.
function AppSwitcher({
  appName,
  apps,
  currentAppId,
  mode,
  onModeChange,
  renderLink = renderAnchor,
  className,
}: AppSwitcherProps) {
  if (apps.length === 0) {
    return (
      <span data-slot="app-switcher-name" className={cn("font-heading text-base font-semibold", className)}>
        {appName}
      </span>
    )
  }

  return (
    <Sheet>
      <SheetTrigger
        data-slot="app-switcher-trigger"
        render={
          <Button
            variant="ghost"
            className={cn("min-h-11 gap-1 px-2 font-heading text-base font-semibold", className)}
          />
        }
      >
        {appName}
        <ChevronDownIcon aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-xl pb-safe">
        <SheetHeader>
          <SheetTitle>Switch app</SheetTitle>
          <SheetDescription className="sr-only">Open another app, or change the colour mode.</SheetDescription>
        </SheetHeader>
        <ul data-slot="app-switcher-list" className="flex flex-col gap-1 px-2">
          {apps.map((app) => {
            const current = app.id === currentAppId
            return (
              <li key={app.id}>
                {renderLink({
                  href: app.href,
                  "aria-current": current ? "true" : undefined,
                  className: cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    current && "bg-muted"
                  ),
                  children: (
                    <>
                      {app.icon ? (
                        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg]:size-4">
                          {app.icon}
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{app.name}</span>
                        {app.description ? (
                          <span className="truncate text-xs text-muted-foreground">{app.description}</span>
                        ) : null}
                      </span>
                      {current ? <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
                    </>
                  ),
                })}
              </li>
            )
          })}
        </ul>
        {onModeChange ? (
          <div data-slot="app-switcher-mode" className="flex flex-col gap-2 border-t px-4 py-3">
            <span className="text-xs font-medium text-muted-foreground">Colour mode</span>
            <ToggleGroup
              aria-label="Colour mode"
              variant="outline"
              spacing={0}
              value={mode ? [mode] : []}
              onValueChange={(value) => {
                const next = value[0] as ModePreference | undefined
                if (next && next !== mode) onModeChange(next)
              }}
              className="w-full"
            >
              {MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
                <ToggleGroupItem key={value} value={value} className="min-h-11 flex-1 gap-1.5">
                  <Icon aria-hidden="true" />
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

export { AppSwitcher }
export type { AppSwitcherProps, SwitcherApp }
