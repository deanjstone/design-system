import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { THEMES } from "../registry/lib/theme-preference"
import {
  AppearanceSection,
  SettingsPage,
  SettingsSection,
  THEME_LABELS,
} from "../registry/base-nova/blocks/settings-page"

afterEach(cleanup)

describe("SettingsPage", () => {
  it("titles the page Settings by default", () => {
    render(<SettingsPage>body</SettingsPage>)

    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy()
  })

  it("takes another title and a description", () => {
    render(
      <SettingsPage title="Preferences" description="Yours alone">
        body
      </SettingsPage>
    )

    expect(screen.getByRole("heading", { level: 1, name: "Preferences" })).toBeTruthy()
    expect(screen.getByText("Yours alone")).toBeTruthy()
  })

  it("stacks its sections", () => {
    render(
      <SettingsPage>
        <SettingsSection title="Account">Account body</SettingsSection>
        <SettingsSection title="Sync" description="When to sync">
          Sync body
        </SettingsSection>
      </SettingsPage>
    )

    expect(screen.getByRole("heading", { level: 2, name: "Account" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Sync" })).toBeTruthy()
    expect(screen.getByText("When to sync")).toBeTruthy()
    expect(screen.getByRole("region", { name: "Sync" }).textContent).toContain("Sync body")
  })
})

describe("AppearanceSection", () => {
  const props = {
    preference: { theme: "ocean", mode: "system" } as const,
    onThemeChange: vi.fn(),
    onModeChange: vi.fn(),
  }

  it("is a section headed Appearance", () => {
    render(<AppearanceSection {...props} />)

    expect(screen.getByRole("heading", { level: 2, name: "Appearance" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Appearance" })).toBeTruthy()
  })

  it("lists all six themes, labelled, in the registry's order", () => {
    render(<AppearanceSection {...props} />)

    const list = within(screen.getByRole("group", { name: "Theme" }))
    expect(list.getAllByRole("button").map((button) => button.textContent)).toEqual(
      THEMES.map((theme) => THEME_LABELS[theme])
    )
    expect(Object.values(THEME_LABELS)).toEqual(["Default", "T3 Chat", "Grove", "Ocean", "Ember", "Iris"])
  })

  it("marks the chosen theme", () => {
    render(<AppearanceSection {...props} preference={{ theme: "grove", mode: "dark" }} />)

    const list = within(screen.getByRole("group", { name: "Theme" }))
    expect(list.getByRole("button", { name: "Grove" }).getAttribute("aria-pressed")).toBe("true")
    expect(list.getByRole("button", { name: "Ocean" }).getAttribute("aria-pressed")).toBe("false")
  })

  it("reports a picked theme", () => {
    const onThemeChange = vi.fn()
    render(<AppearanceSection {...props} onThemeChange={onThemeChange} />)

    fireEvent.click(within(screen.getByRole("group", { name: "Theme" })).getByRole("button", { name: "Ember" }))

    expect(onThemeChange).toHaveBeenCalledWith("ember")
  })

  it("does not report the theme that is already chosen", () => {
    const onThemeChange = vi.fn()
    render(<AppearanceSection {...props} onThemeChange={onThemeChange} />)

    fireEvent.click(within(screen.getByRole("group", { name: "Theme" })).getByRole("button", { name: "Ocean" }))

    expect(onThemeChange).not.toHaveBeenCalled()
  })

  it("previews each theme in its own colours, light and dark, by scoping data-theme to the swatch", () => {
    render(<AppearanceSection {...props} />)

    const iris = within(screen.getByRole("group", { name: "Theme" })).getByRole("button", { name: "Iris" })
    const swatches = iris.querySelectorAll("[data-theme=iris]")
    expect(swatches).toHaveLength(2)
    expect([...swatches].map((swatch) => swatch.classList.contains("dark"))).toEqual([false, true])
  })

  it("offers Light / Dark / System and marks the chosen mode", () => {
    render(<AppearanceSection {...props} preference={{ theme: "ocean", mode: "dark" }} />)

    const modes = within(screen.getByRole("group", { name: "Colour mode" }))
    expect(modes.getAllByRole("button").map((button) => button.textContent)).toEqual(["Light", "Dark", "System"])
    expect(modes.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true")
  })

  it("reports a picked mode, and ignores the one already chosen", () => {
    const onModeChange = vi.fn()
    render(<AppearanceSection {...props} onModeChange={onModeChange} />)
    const modes = within(screen.getByRole("group", { name: "Colour mode" }))

    fireEvent.click(modes.getByRole("button", { name: "System" }))
    expect(onModeChange).not.toHaveBeenCalled()

    fireEvent.click(modes.getByRole("button", { name: "Light" }))
    expect(onModeChange).toHaveBeenCalledWith("light")
  })

  it("keeps every choice at least 44px tall", () => {
    render(<AppearanceSection {...props} />)

    for (const button of screen.getAllByRole("button")) expect(button.className).toContain("min-h-11")
  })
})
