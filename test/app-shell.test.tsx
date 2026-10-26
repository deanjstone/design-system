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

    // The status-bar region and the gutter under it are solid, so scrolling content never shows through
    // and the header's blur has no seam against it (#122).
    it("sits on a solid fill over the status-bar safe area and its gutter", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const fill = container.querySelector<HTMLElement>("[data-slot=app-shell-status-fill]")!
      expect(fill).toBeTruthy()
      expect(fill.getAttribute("aria-hidden")).toBe("true")
      expect(fill.className).toContain("fixed")
      expect(fill.className).toContain("top-0")
      expect(fill.className).toContain("bg-background")
      expect(fill.className).toContain("h-[calc(env(safe-area-inset-top)+0.5rem)]")
      expect(fill.className).toContain("pointer-events-none")
    })

    it("keeps the header one gutter below the safe-area inset", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(header(container).parentElement!.className).toContain("pt-[calc(env(safe-area-inset-top)+0.5rem)]")
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
    it("is a floating glass bar, shown only below lg", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const bar = tabBar(container)
      expect(bar.className).toContain("surface-glass")
      expect(bar.className).toContain("lg:hidden")
      expect(bar.className).toContain("fixed")
    })

    // An iPhone's display corners have a radius of roughly 47 to 55pt. A 12px bar
    // sitting 8px in from the side is cut by them, so the bar takes a pill radius
    // and a wider side gutter, and its tabs follow the radius inward (#122).
    it("keeps its corners clear of the display corners", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const bar = tabBar(container)
      expect(bar.className).toContain("rounded-[2rem]")
      expect(bar.className).not.toContain("rounded-xl")
      expect(bar.className).toContain("left-[max(1.3rem,env(safe-area-inset-left))]")
      expect(bar.className).toContain("right-[max(1.3rem,env(safe-area-inset-right))]")
    })

    // Native iOS floating tab bars (GitHub, WhatsApp) sit about 22pt above the screen bottom on a
    // Face ID iPhone, so the pill overlaps the home-indicator zone instead of clearing all 34pt (#125).
    it("sits 12px lower than the bottom safe-area inset, and 0.5rem up where there is none", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const bar = tabBar(container)
      expect(bar.className).toContain("bottom-[max(0.5rem,calc(env(safe-area-inset-bottom)-12px))]")
      expect(bar.className).not.toContain("bottom-[max(0.75rem")
    })

    it("rounds the tabs to sit inside the bar's radius", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      const bar = within(tabBar(container))
      for (const control of [...bar.getAllByRole("link"), bar.getByRole("button", { name: "More" })]) {
        expect(control.className).toContain("rounded-full")
      }
    })

    it("leaves the page clear of the bar plus its bottom offset", () => {
      render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(screen.getByRole("main").className).toContain("pb-[calc(6rem+max(0.5rem,calc(env(safe-area-inset-bottom)-12px)))]")
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

    // Native iOS floating tab bars (GitHub, WhatsApp) are about 60pt tall; 50px tabs plus the bar's
    // 4px padding and 1px borders make 60px, still above the 44px touch floor (#125).
    it("keeps every tab 50px tall, above the 44px touch floor", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      const bar = within(tabBar(container))
      for (const control of [...bar.getAllByRole("link"), bar.getByRole("button", { name: "More" })]) {
        expect(control.className).toContain("min-h-12.5")
        expect(control.className).not.toContain("min-h-14")
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

  it("lays the page out as a column, so an EmptyPage can fill what is left", () => {
    render(<AppShell appName="Reader" sections={four}>x</AppShell>)

    const className = screen.getByRole("main").className
    expect(className).toContain("flex")
    expect(className).toContain("flex-col")
  })

  it("keeps the page clear of the floating tab bar, and releases that room from lg", () => {
    render(<AppShell appName="Reader" sections={four}>x</AppShell>)

    const className = screen.getByRole("main").className
    expect(className).toMatch(/pb-\[/)
    expect(className).toContain("lg:pb-6")
  })
})
