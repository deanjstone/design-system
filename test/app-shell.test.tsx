import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { BookOpenIcon, HomeIcon, InboxIcon, SearchIcon, SettingsIcon, StarIcon } from "lucide-react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppShell, type ShellSection } from "../registry/base-nova/blocks/app-shell"

afterEach(cleanup)

const section = (id: string, label: string, icon: React.ReactNode): ShellSection => ({
  id,
  label,
  href: `/${id}`,
  icon,
})

const four: ShellSection[] = [
  section("home", "Home", <HomeIcon />),
  section("inbox", "Inbox", <InboxIcon />),
  section("search", "Search", <SearchIcon />),
  section("library", "Library", <BookOpenIcon />),
]
const six: ShellSection[] = [...four, section("starred", "Starred", <StarIcon />), section("settings", "Settings", <SettingsIcon />)]

const apps = [
  { id: "shell", name: "Shell", href: "https://myargus.cc/" },
  { id: "reader", name: "Reader", href: "https://myargus.cc/reader/" },
]

const tabBar = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-slot=app-shell-tabbar]")!
const sidebar = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-slot=app-shell-sidebar]")!
const header = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-slot=app-shell-header]")!

describe("AppShell", () => {
  it("renders the page inside a main landmark", () => {
    render(
      <AppShell appName="Reader" sections={four}>
        <p>Page body</p>
      </AppShell>
    )

    expect(within(screen.getByRole("main")).getByText("Page body")).toBeTruthy()
  })

  describe("header", () => {
    it("is a floating glass bar with xl corners", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const bar = header(container)
      expect(bar.className).toContain("surface-glass")
      expect(bar.className).toContain("rounded-xl")
    })

    it("opens the app switcher from the app name", () => {
      const { container } = render(
        <AppShell appName="Reader" sections={four} apps={apps} currentAppId="reader">
          x
        </AppShell>
      )

      fireEvent.click(within(header(container)).getByRole("button", { name: /Reader/ }))

      expect(within(screen.getByRole("dialog", { name: "Switch app" })).getAllByRole("link")).toHaveLength(2)
    })

    it("hands the colour mode to the switcher", () => {
      const onModeChange = vi.fn()
      const { container } = render(
        <AppShell appName="Reader" sections={four} apps={apps} mode="system" onModeChange={onModeChange}>
          x
        </AppShell>
      )

      fireEvent.click(within(header(container)).getByRole("button", { name: /Reader/ }))
      fireEvent.click(within(screen.getByRole("group", { name: "Colour mode" })).getByRole("button", { name: "Light" }))

      expect(onModeChange).toHaveBeenCalledWith("light")
    })

    it("has no back button on a top-level page", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(within(header(container)).queryByRole("link", { name: "Back" })).toBeNull()
    })

    it("shows a back button to the parent on a drill-down page", () => {
      const { container } = render(
        <AppShell appName="Reader" sections={four} back={{ href: "/inbox" }}>
          x
        </AppShell>
      )

      const back = within(header(container)).getByRole("link", { name: "Back" })
      expect(back.getAttribute("href")).toBe("/inbox")
      expect(back.className).toContain("min-h-11")
    })

    it("names the back button after the parent when given a label", () => {
      const { container } = render(
        <AppShell appName="Reader" sections={four} back={{ href: "/inbox", label: "Back to Inbox" }}>
          x
        </AppShell>
      )

      expect(within(header(container)).getByRole("link", { name: "Back to Inbox" })).toBeTruthy()
    })

    it("renders header actions at the end", () => {
      const { container } = render(
        <AppShell appName="Reader" sections={four} headerActions={<button type="button">Sync</button>}>
          x
        </AppShell>
      )

      expect(within(header(container)).getByRole("button", { name: "Sync" })).toBeTruthy()
    })
  })

  describe("bottom tab bar", () => {
    it("is a floating glass bar with xl corners, shown only below lg", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const bar = tabBar(container)
      expect(bar.className).toContain("surface-glass")
      expect(bar.className).toContain("rounded-xl")
      expect(bar.className).toContain("lg:hidden")
      expect(bar.className).toContain("fixed")
    })

    it("shows every section as a tab, with no More, when there are four or fewer", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const bar = within(tabBar(container))
      expect(bar.getAllByRole("link").map((link) => link.textContent)).toEqual(["Home", "Inbox", "Search", "Library"])
      expect(bar.queryByRole("button", { name: "More" })).toBeNull()
    })

    it("shows four tabs and More when there are more sections", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      const bar = within(tabBar(container))
      expect(bar.getAllByRole("link").map((link) => link.textContent)).toEqual(["Home", "Inbox", "Search", "Library"])
      expect(bar.getByRole("button", { name: "More" })).toBeTruthy()
    })

    it("puts a fifth section under More", () => {
      const { container } = render(<AppShell appName="Reader" sections={six.slice(0, 5)}>x</AppShell>)

      fireEvent.click(within(tabBar(container)).getByRole("button", { name: "More" }))

      const links = within(screen.getByRole("dialog", { name: "More" })).getAllByRole("link")
      expect(links.map((link) => link.textContent)).toEqual(["Starred"])
    })

    it("lists the remaining sections in the More sheet", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      fireEvent.click(within(tabBar(container)).getByRole("button", { name: "More" }))

      const links = within(screen.getByRole("dialog", { name: "More" })).getAllByRole("link")
      expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
        ["Starred", "/starred"],
        ["Settings", "/settings"],
      ])
    })

    it("marks the active tab", () => {
      const { container } = render(<AppShell appName="Reader" sections={six} activeSectionId="inbox">x</AppShell>)

      const bar = within(tabBar(container))
      expect(bar.getByRole("link", { name: "Inbox" }).getAttribute("aria-current")).toBe("page")
      expect(bar.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull()
      expect(bar.getByRole("button", { name: "More" }).getAttribute("data-active")).toBeNull()
    })

    it("marks More active, and the section inside it, when the active section is under More", () => {
      const { container } = render(<AppShell appName="Reader" sections={six} activeSectionId="settings">x</AppShell>)

      const more = within(tabBar(container)).getByRole("button", { name: "More" })
      expect(more.getAttribute("data-active")).toBe("true")

      fireEvent.click(more)

      expect(
        within(screen.getByRole("dialog", { name: "More" })).getByRole("link", { name: "Settings" }).getAttribute("aria-current")
      ).toBe("page")
    })

    it("keeps every tab at least 44px tall", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      const bar = within(tabBar(container))
      for (const control of [...bar.getAllByRole("link"), bar.getByRole("button", { name: "More" })]) {
        expect(control.className).toContain("min-h-14")
      }
    })

    it("draws tabs through renderLink", () => {
      const renderLink = vi.fn(({ href, children, ...rest }) => (
        <a data-router="yes" href={`#${href}`} {...rest}>
          {children}
        </a>
      ))
      const { container } = render(
        <AppShell appName="Reader" sections={four} renderLink={renderLink}>
          x
        </AppShell>
      )

      expect(within(tabBar(container)).getAllByRole("link")[0].getAttribute("data-router")).toBe("yes")
      expect(within(sidebar(container)).getAllByRole("link")[0].getAttribute("data-router")).toBe("yes")
    })
  })

  describe("sidebar", () => {
    it("is shown from lg", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const className = sidebar(container).className
      expect(className).toContain("hidden")
      expect(className).toContain("lg:flex")
    })

    it("lists every section, More included, in order", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      expect(within(sidebar(container)).getAllByRole("link").map((link) => link.textContent)).toEqual([
        "Home",
        "Inbox",
        "Search",
        "Library",
        "Starred",
        "Settings",
      ])
    })

    it("marks the active section", () => {
      const { container } = render(<AppShell appName="Reader" sections={six} activeSectionId="settings">x</AppShell>)

      const bar = within(sidebar(container))
      expect(bar.getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe("page")
      expect(bar.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull()
    })

    it("offsets the content column by the sidebar width from lg", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(container.querySelector("[data-slot=app-shell-column]")?.className).toContain("lg:pl-64")
    })
  })

  it("keeps the page clear of the floating tab bar, and releases that room from lg", () => {
    render(<AppShell appName="Reader" sections={four}>x</AppShell>)

    const className = screen.getByRole("main").className
    expect(className).toMatch(/pb-\[/)
    expect(className).toContain("lg:pb-6")
  })
})
