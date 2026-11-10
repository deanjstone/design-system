"use client"

import * as React from "react"
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { cn } from "cn"

import { PageHeader } from "@/components/page-header"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FONTS, type Font } from "@/lib/font-preference"
import { THEMES, type ModePreference, type Theme, type ThemePreference } from "@/lib/theme-preference"

const THEME_LABELS: Record<(typeof THEMES)[number], string> = {
  default: "Default",
  "t3-chat": "T3 Chat",
  grove: "Grove",
  ocean: "Ocean",
  ember: "Ember",
  iris: "Iris",
}

// The six above plus the opt-in themes; an app lists the latter by passing `themes={ALL_THEMES}`.
const ALL_THEME_LABELS: Record<Theme, string> = { ...THEME_LABELS, ds: "DS" }

const FONT_LABELS: Record<Font, string> = {
  default: "Default",
  aspekta: "Aspekta + Azeret Mono",
}

const MODE_OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const

type SettingsPageProps = Omit<React.ComponentProps<"div">, "title"> & {
  title?: React.ReactNode
  description?: React.ReactNode
}

// A settings screen: a page header over a stack of sections.
function SettingsPage({ title = "Settings", description, className, children, ...props }: SettingsPageProps) {
  return (
    <div data-slot="settings-page" className={cn("flex flex-col gap-8", className)} {...props}>
      <PageHeader title={title} description={description} />
      {children}
    </div>
  )
}

type SettingsSectionProps = Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
}

function SettingsSection({ title, description, className, children, ...props }: SettingsSectionProps) {
  const headingId = React.useId()
  return (
    <section
      data-slot="settings-section"
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-4", className)}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="font-heading text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

// The theme's own light and dark colours, drawn by scoping data-theme (and the
// dark class) to the swatch: a theme rule answers on any element.
function ThemeSwatch({ theme }: { theme: Theme }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 overflow-hidden rounded-md border border-border">
      {[false, true].map((dark) => (
        <span
          key={String(dark)}
          data-theme={theme}
          className={cn("flex size-8 items-center justify-center bg-background", dark && "dark")}
        >
          <span className="size-3 rounded-full bg-primary" />
        </span>
      ))}
    </span>
  )
}

type AppearanceSectionProps = {
  preference: ThemePreference
  onThemeChange: (theme: Theme) => void
  onModeChange: (mode: ModePreference) => void
  /** The themes to list; the six T3 themes when omitted. Pass `ALL_THEMES` to offer DS (the `theme-ds` item). */
  themes?: readonly Theme[]
  /** With `onFontChange`, adds the Font group (Default, Aspekta + Azeret Mono; the `font-aspekta` item). */
  font?: Font
  onFontChange?: (font: Font) => void
}

// The settings page's Appearance section: pick the theme, Light / Dark / System and,
// where the app opts in, the font. Controlled; `useThemePreference` supplies the first
// three props and `useFontPreference` the font ones.
function AppearanceSection({
  preference,
  onThemeChange,
  onModeChange,
  themes = THEMES,
  font,
  onFontChange,
}: AppearanceSectionProps) {
  return (
    <SettingsSection
      title="Appearance"
      description="Saved on this device and shared by every app on it."
    >
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Theme</span>
        <ToggleGroup
          aria-label="Theme"
          orientation="vertical"
          spacing={1}
          className="w-full"
          value={[preference.theme]}
          onValueChange={(value) => {
            const next = value[0] as Theme | undefined
            if (next && next !== preference.theme) onThemeChange(next)
          }}
        >
          {themes.map((theme) => (
            <ToggleGroupItem
              key={theme}
              value={theme}
              className="min-h-11 w-full justify-start gap-3 px-3 data-[pressed]:bg-muted"
            >
              <ThemeSwatch theme={theme} />
              {ALL_THEME_LABELS[theme]}
              {theme === preference.theme ? <CheckIcon aria-hidden="true" className="ml-auto text-primary-text" /> : null}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Colour mode</span>
        <ToggleGroup
          aria-label="Colour mode"
          variant="outline"
          spacing={0}
          value={[preference.mode]}
          onValueChange={(value) => {
            const next = value[0] as ModePreference | undefined
            if (next && next !== preference.mode) onModeChange(next)
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
      {font && onFontChange ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Font</span>
          <ToggleGroup
            aria-label="Font"
            orientation="vertical"
            spacing={1}
            className="w-full"
            value={[font]}
            onValueChange={(value) => {
              const next = value[0] as Font | undefined
              if (next && next !== font) onFontChange(next)
            }}
          >
            {FONTS.map((option) => (
              <ToggleGroupItem
                key={option}
                value={option}
                className="min-h-11 w-full justify-start gap-3 px-3 data-[pressed]:bg-muted"
              >
                {/* Scoping data-font draws the label in its own face. */}
                <span {...(option === "default" ? {} : { "data-font": option })}>{FONT_LABELS[option]}</span>
                {option === font ? <CheckIcon aria-hidden="true" className="ml-auto text-primary-text" /> : null}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}
    </SettingsSection>
  )
}

export { ALL_THEME_LABELS, AppearanceSection, FONT_LABELS, SettingsPage, SettingsSection, THEME_LABELS }
export type { AppearanceSectionProps, SettingsPageProps, SettingsSectionProps }
