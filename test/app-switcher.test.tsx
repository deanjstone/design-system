import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppSwitcher, type SwitcherApp } from "../registry/base-nova/blocks/app-switcher"

afterEach(cleanup)

const apps: SwitcherApp[] = [
  { id: "shell", name: "Shell", href: "https://myargus.cc/", description: "Launcher" },
  { id: "reader", name: "Reader", href: "https://myargus.cc/reader/" },
  { id: "stockade", name: "Stockade", href: "https://stockade.myargus.cc/" },
]

const open = () => fireEvent.click(screen.getByRole("button", { name: /Reader/ }))

describe("AppSwitcher", () => {
  it("shows the app name on a trigger that opens a dialog", () => {
    render(<AppSwitcher appName="Reader" apps={apps} currentAppId="reader" />)

    const trigger = screen.getByRole("button", { name: /Reader/ })
    expect(trigger.getAttribute("data-slot")).toBe("app-switcher-trigger")
    expect(screen.queryByRole("dialog")).toBeNull()

    fireEvent.click(trigger)

    expect(screen.getByRole("dialog", { name: "Switch app" })).toBeTruthy()
  })

  it("lists every app as a link to its address", () => {
    render(<AppSwitcher appName="Reader" apps={apps} currentAppId="reader" />)
    open()

    const dialog = screen.getByRole("dialog")
    const links = within(dialog).getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual(apps.map((app) => app.href))
    expect(within(dialog).getByText("Launcher")).toBeTruthy()
  })

  it("marks the current app", () => {
    render(<AppSwitcher appName="Reader" apps={apps} currentAppId="reader" />)
    open()

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByRole("link", { name: /Reader/ }).getAttribute("aria-current")).toBe("true")
    expect(within(dialog).getByRole("link", { name: /Shell/ }).getAttribute("aria-current")).toBeNull()
  })

  it("draws links through renderLink so a router can own navigation", () => {
    const renderLink = vi.fn(({ href, children, ...rest }) => (
      <a data-router="yes" href={`#${href}`} {...rest}>
        {children}
      </a>
    ))
    render(<AppSwitcher appName="Reader" apps={apps} currentAppId="reader" renderLink={renderLink} />)
    open()

    expect(renderLink).toHaveBeenCalled()
    expect(within(screen.getByRole("dialog")).getAllByRole("link")[0].getAttribute("data-router")).toBe("yes")
  })

  it("offers a Light / Dark / System quick toggle when it can report a change", () => {
    const onModeChange = vi.fn()
    render(
      <AppSwitcher appName="Reader" apps={apps} currentAppId="reader" mode="system" onModeChange={onModeChange} />
    )
    open()

    const toggles = within(screen.getByRole("group", { name: "Colour mode" }))
    expect(toggles.getByRole("button", { name: "System" }).getAttribute("aria-pressed")).toBe("true")
    expect(toggles.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("false")

    fireEvent.click(toggles.getByRole("button", { name: "Dark" }))

    expect(onModeChange).toHaveBeenCalledWith("dark")
  })

  it("does not ask for the same mode again when the pressed one is clicked", () => {
    const onModeChange = vi.fn()
    render(
      <AppSwitcher appName="Reader" apps={apps} currentAppId="reader" mode="dark" onModeChange={onModeChange} />
    )
    open()

    fireEvent.click(within(screen.getByRole("group", { name: "Colour mode" })).getByRole("button", { name: "Dark" }))

    expect(onModeChange).not.toHaveBeenCalled()
  })

  it("leaves out the quick toggle without onModeChange", () => {
    render(<AppSwitcher appName="Reader" apps={apps} currentAppId="reader" />)
    open()

    expect(screen.queryByRole("group", { name: "Colour mode" })).toBeNull()
  })

  it("shows the name as plain text when there are no other apps to switch to", () => {
    render(<AppSwitcher appName="Reader" apps={[]} />)

    expect(screen.queryByRole("button", { name: /Reader/ })).toBeNull()
    expect(screen.getByText("Reader")).toBeTruthy()
  })

  it("keeps the 44px touch floor on the rows and the trigger", () => {
    render(<AppSwitcher appName="Reader" apps={apps} currentAppId="reader" />)
    expect(screen.getByRole("button", { name: /Reader/ }).className).toContain("min-h-11")
    open()

    expect(within(screen.getByRole("dialog")).getAllByRole("link")[0].className).toContain("min-h-11")
  })
})
