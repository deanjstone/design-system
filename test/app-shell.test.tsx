import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { BookOpenIcon, HomeIcon, InboxIcon, SearchIcon, SettingsIcon, StarIcon } from "lucide-react"
import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppShell, type ShellSection } from "../registry/base-nova/blocks/app-shell"

afterEach(cleanup)

// jsdom does no layout, so a test stands in for it: the header wrapper is 72px tall, the tab bar 60px.
const observed: Element[] = []
let observerCallback: (() => void) | undefined
class FakeResizeObserver {
  constructor(callback: () => void) {
    observerCallback = callback
  }
  observe(element: Element) {
    observed.push(element)
  }
  unobserve() {}
  disconnect() {
    observed.length = 0
  }
}
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")

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

const shellSource = readFileSync("registry/base-nova/blocks/app-shell.tsx", "utf8")

describe("AppShell", () => {
  // The curve rule (#136, #142): a background may bleed into the display's rounded corners, but text and
  // controls never do. In landscape the side insets are the curve, so every side edge needs an inset
  // behind a max() floor. The status fill and the bottom scrim are backgrounds and are exempt.
  describe("side edges in landscape", () => {
    it("pads the header wrapper by max(0.5rem, inset) on both sides", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const className = header(container).parentElement!.className
      expect(className).toContain("pl-[max(0.5rem,var(--safe-l))]")
      expect(className).toContain("pr-[max(0.5rem,var(--safe-r))]")
      expect(className).not.toMatch(/(^|\s)px-2(\s|$)/)
    })

    it("pads the main column with px-edge, which clears the insets", () => {
      render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const className = screen.getByRole("main").className
      expect(className).toMatch(/(^|\s)px-edge(\s|$)/)
      expect(className).not.toMatch(/(^|\s)px-4(\s|$)/)
    })

    it("never reads a side inset without a max() floor", () => {
      const use = /(env\(safe-area-inset-(?:left|right)\)|var\(--safe-[lr]\))/g
      const lines = shellSource.split("\n").filter((line) => line.match(use))

      expect(lines.length).toBeGreaterThan(0)
      for (const line of lines) {
        for (const [, inset] of line.matchAll(use)) {
          expect(line.slice(0, line.indexOf(inset)), inset).toMatch(/max\([^()]*$/)
        }
      }
    })
  })

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

  describe("workspace variables", () => {
    const withLayout = (sizes: { top: number; bar: number }) => {
      vi.stubGlobal("ResizeObserver", FakeResizeObserver)
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          const slot = (this as HTMLElement).dataset.slot
          if (slot === "app-shell-tabbar") return sizes.bar
          return slot === "app-shell-top" ? sizes.top : 0
        },
      })
    }
    afterEach(() => {
      vi.unstubAllGlobals()
      if (offsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight)
      document.documentElement.removeAttribute("style")
      observed.length = 0
    })

    const root = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-slot=app-shell]")!

    it("measures --shell-top from the sticky header wrapper", () => {
      withLayout({ top: 72, bar: 60 })
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(root(container).style.getPropertyValue("--shell-top")).toBe("72px")
    })

    it("measures --shell-bottom from the tab bar", () => {
      withLayout({ top: 72, bar: 60 })
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(root(container).style.getPropertyValue("--shell-bottom")).toBe("60px")
    })

    it("re-measures when the header or the bar changes size", () => {
      withLayout({ top: 72, bar: 60 })
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)
      expect(observed).toHaveLength(2)

      withLayout({ top: 96, bar: 84 })
      observerCallback?.()

      expect(root(container).style.getPropertyValue("--shell-top")).toBe("96px")
      expect(root(container).style.getPropertyValue("--shell-bottom")).toBe("84px")
    })

    it("leaves the CSS fallback in place when the bar is not drawn (hidden from lg, or one section)", () => {
      withLayout({ top: 72, bar: 0 })
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(root(container).style.getPropertyValue("--shell-bottom")).toBe("")
      expect(root(container).className).toContain("lg:[--shell-bottom:0px]")
    })

    it("falls back to CSS values before it has measured, and with no ResizeObserver", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const className = root(container).className
      expect(className).toContain("[--shell-top:calc(var(--safe-t)_+_4.5rem)]")
      expect(className).toContain("[--shell-bottom:calc(var(--edge-b)_+_3.75rem)]")
      expect(root(container).style.getPropertyValue("--shell-top")).toBe("")
    })

    it("falls back to the bottom edge alone with one section", () => {
      const { container } = render(<AppShell appName="Reader" sections={four.slice(0, 1)}>x</AppShell>)

      expect(root(container).className).toContain("[--shell-bottom:var(--edge-b)]")
    })

    it("defines --shell-workspace as the viewport between the two", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(root(container).className).toContain(
        "[--shell-workspace:calc(100dvh_-_var(--shell-top)_-_var(--shell-bottom))]"
      )
    })

    // The page scrolls, so scroll-padding lives on <html>: a focused control stays clear of the
    // sticky header and the fixed bar (WCAG 2.4.11, #144 F2).
    it("sets the page's scroll padding from the same measurements", () => {
      withLayout({ top: 72, bar: 60 })
      render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(document.documentElement.style.getPropertyValue("--scroll-pad-top")).toBe("72px")
      expect(document.documentElement.style.getPropertyValue("--scroll-pad-bottom")).toBe("60px")
    })

    it("hands the scroll padding back on unmount", () => {
      withLayout({ top: 72, bar: 60 })
      render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      cleanup()

      expect(document.documentElement.style.getPropertyValue("--scroll-pad-top")).toBe("")
      expect(document.documentElement.style.getPropertyValue("--scroll-pad-bottom")).toBe("")
    })
  })

  describe("bottom scrim", () => {
    // The strip under the floating bar is where the display curve clips; without a fill, scrolling text
    // shows in it. It mirrors the top status fill (#138).
    it("fills the strip under the tab bar with a solid, non-interactive background", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const scrim = container.querySelector<HTMLElement>("[data-slot=app-shell-bottom-fill]")!
      expect(scrim).toBeTruthy()
      expect(scrim.getAttribute("aria-hidden")).toBe("true")
      expect(scrim.className).toContain("fixed")
      expect(scrim.className).toContain("bottom-0")
      expect(scrim.className).toContain("bg-background")
      expect(scrim.className).toContain("h-(--edge-b)")
      expect(scrim.className).toContain("pointer-events-none")
      expect(scrim.className).toContain("lg:hidden")
    })

    it("sits under the tab bar and over the page", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const scrim = container.querySelector<HTMLElement>("[data-slot=app-shell-bottom-fill]")!
      expect(scrim.className).toContain("z-20")
      expect(tabBar(container).className).toContain("z-30")
    })

    it("is absent when there is no tab bar", () => {
      const { container } = render(<AppShell appName="Reader" sections={four.slice(0, 1)}>x</AppShell>)

      expect(container.querySelector("[data-slot=app-shell-bottom-fill]")).toBeNull()
    })
  })

  describe("with fewer than two sections", () => {
    // A single section has nothing to switch to: the bar costs about 82px for one tab (watchtower, jobs).
    it("draws no tab bar for one section", () => {
      const { container } = render(<AppShell appName="Watchtower" sections={four.slice(0, 1)}>x</AppShell>)

      expect(container.querySelector("[data-slot=app-shell-tabbar]")).toBeNull()
    })

    it("draws no tab bar for none", () => {
      const { container } = render(<AppShell appName="Watchtower" sections={[]}>x</AppShell>)

      expect(container.querySelector("[data-slot=app-shell-tabbar]")).toBeNull()
    })

    it("draws a tab bar from two sections", () => {
      const { container } = render(<AppShell appName="Reader" sections={four.slice(0, 2)}>x</AppShell>)

      expect(tabBar(container)).toBeTruthy()
    })

    it("hands the room back: main clears only the bottom edge", () => {
      render(<AppShell appName="Watchtower" sections={four.slice(0, 1)}>x</AppShell>)

      const className = screen.getByRole("main").className
      expect(className).toMatch(/(^|\s)pb-edge(\s|$)/)
      expect(className).not.toContain("6rem")
    })

    it("keeps the sidebar, so the section is still named from lg", () => {
      const { container } = render(<AppShell appName="Watchtower" sections={four.slice(0, 1)}>x</AppShell>)

      expect(within(sidebar(container)).getAllByRole("link")).toHaveLength(1)
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

      expect(screen.getByRole("main").className).toContain("pb-[calc(6rem+var(--edge-b))]")
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

  describe("focus and large text", () => {
    it("draws a solid focus ring on every tab, the More tab and sidebar link, never ring/50", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      const bar = within(tabBar(container))
      for (const control of [...bar.getAllByRole("link"), bar.getByRole("button", { name: "More" })]) {
        expect(control.className).toContain("focus-visible:ring-ring")
        expect(control.className).not.toContain("ring-ring/50")
      }
      for (const link of within(sidebar(container)).getAllByRole("link")) {
        expect(link.className).toContain("focus-visible:ring-sidebar-ring")
        expect(link.className).not.toContain("/50")
      }
    })

    it("draws a solid focus ring on the links in the More sheet", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      fireEvent.click(within(tabBar(container)).getByRole("button", { name: "More" }))

      for (const link of within(screen.getByRole("dialog", { name: "More" })).getAllByRole("link")) {
        expect(link.className).toContain("focus-visible:ring-ring")
        expect(link.className).not.toContain("ring-ring/50")
      }
    })

    it("has no translucent focus ring anywhere in the source", () => {
      expect(shellSource).not.toMatch(/ring-(?:ring|sidebar-ring)\/\d/)
    })

    it("keeps the active tab's icon in the foreground colour, not the primary", () => {
      const { container } = render(<AppShell appName="Reader" sections={four} activeSectionId="home">x</AppShell>)

      const active = within(tabBar(container)).getByRole("link", { name: "Home" })
      expect(active.className).toContain("text-foreground")
      expect(active.className).not.toContain("text-primary")
    })

    // At 200% text a 320px screen is 10rem wide. A rem-based query matches only then, never at 100%.
    // The label stays in the DOM, so the tab keeps its name.
    it("drops the tab labels to icons only on a screen under 15rem wide", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      const bar = within(tabBar(container))
      for (const control of [...bar.getAllByRole("link"), bar.getByRole("button", { name: "More" })]) {
        expect(control.className).toContain("max-[15rem]:[&>span]:sr-only")
      }
      expect(bar.getByRole("link", { name: "Home" })).toBeTruthy()
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
