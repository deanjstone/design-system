import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppSwitcher, type SwitcherApp } from "../registry/base-nova/blocks/app-switcher"

// jsdom has no layout and no matchMedia. A test that wants a desktop width
// installs one that answers the switcher's min-width query.
const viewport = (width: number) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
      return {
        matches: width >= min,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }
    },
  })
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, "matchMedia")
})

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

  describe("below md (a phone)", () => {
    it("opens a bottom sheet", () => {
      viewport(390)
      render(<AppSwitcher appName="Reader" apps={apps} currentAppId="reader" />)
      open()

      const dialog = screen.getByRole("dialog", { name: "Switch app" })
      expect(dialog.getAttribute("data-slot")).toBe("sheet-content")
      expect(dialog.getAttribute("data-side")).toBe("bottom")
    })

    it("opens a bottom sheet when the browser cannot answer a media query", () => {
      render(<AppSwitcher appName="Reader" apps={apps} currentAppId="reader" />)
      open()

      expect(screen.getByRole("dialog", { name: "Switch app" }).getAttribute("data-slot")).toBe("sheet-content")
    })
  })

  describe("from md up (a desktop)", () => {
    const openOnDesktop = (props: Partial<React.ComponentProps<typeof AppSwitcher>> = {}) => {
      viewport(1280)
      render(<AppSwitcher appName="Reader" apps={apps} currentAppId="reader" {...props} />)
      open()
    }

    it("opens a popover anchored to the trigger, with no overlay", () => {
      openOnDesktop()

      const dialog = screen.getByRole("dialog", { name: "Switch app" })
      expect(dialog.getAttribute("data-slot")).toBe("popover-content")
      expect(dialog.className).not.toContain("w-screen")
      expect(document.querySelector("[data-slot=sheet-overlay]")).toBeNull()
    })

    it("opens at md, 768px", () => {
      viewport(768)
      render(<AppSwitcher appName="Reader" apps={apps} currentAppId="reader" />)
      open()

      expect(screen.getByRole("dialog", { name: "Switch app" }).getAttribute("data-slot")).toBe("popover-content")
    })

    it("lists every app and marks the current one", () => {
      openOnDesktop()

      const dialog = screen.getByRole("dialog")
      expect(within(dialog).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
        apps.map((app) => app.href)
      )
      expect(within(dialog).getByRole("link", { name: /Reader/ }).getAttribute("aria-current")).toBe("true")
      expect(within(dialog).getByText("Launcher")).toBeTruthy()
    })

    it("carries the colour-mode quick toggle", () => {
      const onModeChange = vi.fn()
      openOnDesktop({ mode: "system", onModeChange })

      const toggles = within(screen.getByRole("group", { name: "Colour mode" }))
      expect(toggles.getByRole("button", { name: "System" }).getAttribute("aria-pressed")).toBe("true")

      fireEvent.click(toggles.getByRole("button", { name: "Dark" }))

      expect(onModeChange).toHaveBeenCalledWith("dark")
    })

    it("moves focus into the popover and keeps it reachable by keyboard", async () => {
      openOnDesktop()

      const dialog = screen.getByRole("dialog")
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    })

    it("closes on Escape", async () => {
      openOnDesktop()

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("closes when an app is chosen", async () => {
      const onClick = vi.fn((event: MouseEvent) => event.preventDefault())
      document.addEventListener("click", onClick)
      try {
        openOnDesktop()

        fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: /Stockade/ }))

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
      } finally {
        document.removeEventListener("click", onClick)
      }
    })

    it("keeps the 44px touch floor on the rows", () => {
      openOnDesktop()

      expect(within(screen.getByRole("dialog")).getAllByRole("link")[0].className).toContain("min-h-11")
    })
  })
})
