import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { BookOpenIcon, HomeIcon, InboxIcon, SearchIcon, SettingsIcon, StarIcon } from "lucide-react"
import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppShell, type ShellSection } from "../registry/base-nova/blocks/app-shell"

afterEach(cleanup)

// jsdom does no layout, so a test stands in for it: the header wrapper is 64px tall, the tab bar 60px.
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
    // 56px of glass on a phone is a lot of a 393x852 screen for a title and one control; the 44px back
    // button still fits inside 48px with its borders (#138).
    it("is 48px tall, with the 44px back button inside it", () => {
      const { container } = render(<AppShell appName="Reader" sections={four} back={{ href: "/inbox" }}>x</AppShell>)

      expect(header(container).className).toContain("min-h-[min(3rem,72px)]")
      expect(header(container).className).not.toContain("min-h-14")
    })

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
      expect(back.className).toContain("min-h-[clamp(44px,2.75rem,66px)]")
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
      withLayout({ top: 64, bar: 60 })
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(root(container).style.getPropertyValue("--shell-top")).toBe("64px")
    })

    it("measures --shell-bottom from the tab bar", () => {
      withLayout({ top: 64, bar: 60 })
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(root(container).style.getPropertyValue("--shell-bottom")).toBe("60px")
    })

    it("re-measures when the header or the bar changes size", () => {
      withLayout({ top: 64, bar: 60 })
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)
      expect(observed).toHaveLength(2)

      withLayout({ top: 96, bar: 84 })
      observerCallback?.()

      expect(root(container).style.getPropertyValue("--shell-top")).toBe("96px")
      expect(root(container).style.getPropertyValue("--shell-bottom")).toBe("84px")
    })

    it("leaves the CSS fallback in place when the bar is not drawn (hidden from lg, or one section)", () => {
      withLayout({ top: 64, bar: 0 })
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(root(container).style.getPropertyValue("--shell-bottom")).toBe("")
      expect(root(container).className).toContain("lg:[--shell-bottom:0px]")
    })

    it("falls back to CSS values before it has measured, and with no ResizeObserver", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const className = root(container).className
      expect(className).toContain("[--shell-top:calc(var(--safe-t)_+_min(4rem,96px))]")
      expect(className).toContain("[--shell-bottom:calc(var(--edge-b)_+_min(3.75rem,90px))]")
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
      withLayout({ top: 64, bar: 60 })
      render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(document.documentElement.style.getPropertyValue("--scroll-pad-top")).toBe("64px")
      expect(document.documentElement.style.getPropertyValue("--scroll-pad-bottom")).toBe("60px")
    })

    it("hands the scroll padding back on unmount", () => {
      withLayout({ top: 64, bar: 60 })
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
        expect(control.className).toContain("min-h-[clamp(44px,3.125rem,75px)]")
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

  // Focus mode (#139): an immersive view (mail thread, article, graph, scanner) gives the whole screen
  // to the page. The only chrome left is a back control clear of the display curve.
  describe('chrome="none" (focus mode)', () => {
    const focus = (extra: Partial<React.ComponentProps<typeof AppShell>> = {}) =>
      render(
        <AppShell appName="Reader" sections={six} chrome="none" {...extra}>
          <p>Thread</p>
        </AppShell>
      )

    it("draws no header, tab bar, sidebar or bottom scrim", () => {
      const { container } = focus({ back: { href: "/inbox" } })

      for (const slot of ["app-shell-header", "app-shell-top", "app-shell-tabbar", "app-shell-sidebar", "app-shell-bottom-fill"]) {
        expect(container.querySelector(`[data-slot=${slot}]`), slot).toBeNull()
      }
    })

    it("still renders the page inside the main landmark", () => {
      focus()

      expect(within(screen.getByRole("main")).getByText("Thread")).toBeTruthy()
    })

    it("leaves a back control to the parent, 44px, named after it", () => {
      focus({ back: { href: "/inbox", label: "Back to Inbox" } })

      const back = screen.getByRole("link", { name: "Back to Inbox" })
      expect(back.getAttribute("href")).toBe("/inbox")
      expect(back.parentElement!.getAttribute("data-slot")).toBe("app-shell-focus-back")
      expect(back.className).toContain("min-h-[clamp(44px,2.75rem,66px)]")
      expect(back.className).toContain("min-w-[clamp(44px,2.75rem,66px)]")
    })

    it("pins the back control a gutter in from the corner, clear of the curve and the inset", () => {
      focus({ back: { href: "/inbox" } })

      const className = screen.getByRole("link", { name: "Back" }).parentElement!.className
      expect(className).toContain("fixed")
      expect(className).toContain("top-[max(1rem,var(--safe-t))]")
      expect(className).toContain("left-[max(1rem,var(--safe-l))]")
    })

    it("draws a solid focus ring on the back control, never ring/50", () => {
      focus({ back: { href: "/inbox" } })

      const className = screen.getByRole("link", { name: "Back" }).className
      expect(className).toContain("focus-visible:ring-ring")
      expect(className).not.toContain("ring-ring/50")
    })

    it("has no back control on a page with no parent", () => {
      focus()

      expect(screen.queryByRole("link")).toBeNull()
    })

    it("does not offset the column for the sidebar", () => {
      const { container } = focus()

      expect(container.querySelector("[data-slot=app-shell-column]")?.className).not.toContain("lg:pl-64")
    })

    it("keeps the bottom edge clear and drops the tab bar's room", () => {
      focus()

      const className = screen.getByRole("main").className
      expect(className).toContain("pb-edge")
      expect(className).not.toContain("6rem")
      expect(className).not.toContain("lg:pb-6")
    })

    // No header means nothing else keeps the page out of the status-bar inset, the island and the
    // back control, so the main column does (the geometry gate caught this, #143).
    it("starts the page below the inset, and below the back control when there is one", () => {
      focus({ back: { href: "/inbox" } })
      expect(screen.getByRole("main").className).toContain("pt-[calc(max(1rem,var(--safe-t))+min(3.25rem,78px))]")
      cleanup()

      focus()
      expect(screen.getByRole("main").className).toContain("pt-[max(1rem,var(--safe-t))]")
    })

    it("falls back to no top chrome and the bottom edge alone", () => {
      const { container } = focus()

      const className = container.querySelector<HTMLElement>("[data-slot=app-shell]")!.className
      expect(className).toContain("[--shell-top:0px]")
      expect(className).toContain("[--shell-bottom:var(--edge-b)]")
      expect(className).not.toContain("lg:[--shell-bottom:0px]")
    })

    it('is the same shell as chrome="full": a default render keeps its header and bar', () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(header(container)).toBeTruthy()
      expect(tabBar(container)).toBeTruthy()
      expect(container.querySelector("[data-slot=app-shell-focus-back]")).toBeNull()
    })

    describe("workspace variables", () => {
      afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        if (offsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight)
        document.documentElement.removeAttribute("style")
        observed.length = 0
      })

      // jsdom resolves no layout, so stand in for the browser: the back control is 44px tall at top 16px.
      const withBack = () => {
        vi.stubGlobal("ResizeObserver", FakeResizeObserver)
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
          configurable: true,
          get() {
            return (this as HTMLElement).dataset.slot === "app-shell-focus-back" ? 44 : 0
          },
        })
        vi.spyOn(window, "getComputedStyle").mockImplementation(
          // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- partial CSSStyleDeclaration stub; only top/bottom are read
          () => ({ top: "16px", bottom: "0px" }) as unknown as CSSStyleDeclaration
        )
      }

      it("publishes no top or bottom chrome", () => {
        withBack()
        const { container } = focus({ back: { href: "/inbox" } })

        const root = container.querySelector<HTMLElement>("[data-slot=app-shell]")!
        expect(root.style.getPropertyValue("--shell-top")).toBe("")
        expect(root.style.getPropertyValue("--shell-bottom")).toBe("")
        expect(document.documentElement.style.getPropertyValue("--scroll-pad-bottom")).toBe("")
      })

      // A control scrolled under the 44px back control would be hidden (WCAG 2.4.11), so the page keeps
      // clear of it: its top offset, its height and a gutter below.
      it("keeps a focused control clear of the back control", () => {
        withBack()
        focus({ back: { href: "/inbox" } })

        expect(document.documentElement.style.getPropertyValue("--scroll-pad-top")).toBe("68px")
      })

      it("hands the scroll padding back on unmount", () => {
        withBack()
        focus({ back: { href: "/inbox" } })

        cleanup()

        expect(document.documentElement.style.getPropertyValue("--scroll-pad-top")).toBe("")
      })
    })

    it("reads no side inset in the focus code without a max() floor", () => {
      const lines = shellSource.split("\n").filter((line) => line.includes("focus-back") || line.includes("left-[") || line.includes("top-[max"))
      const use = /(env\(safe-area-inset-(?:left|right)\)|var\(--safe-[lr]\))/g

      for (const line of lines) {
        for (const [, inset] of line.matchAll(use)) {
          expect(line.slice(0, line.indexOf(inset)), inset).toMatch(/max\([^()]*$/)
        }
      }
    })
  })

  // Auto-hide (#139): the header slides away on scroll down and back on scroll up, to give the page the
  // room. It is opt-in, off under reduced motion, and never hides a control that has focus (WCAG 2.4.11).
  describe("autoHideHeader", () => {
    const top = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-slot=app-shell-top]")!
    const scrollTo = (y: number) => {
      Object.defineProperty(window, "scrollY", { configurable: true, value: y })
      fireEvent.scroll(window)
    }
    const prefersReducedMotion = (matches: boolean) =>
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: matches && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    const withHeader = (props: Partial<React.ComponentProps<typeof AppShell>> = {}) => {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          return (this as HTMLElement).dataset.slot === "app-shell-top" ? 64 : 0
        },
      })
      return render(
        <AppShell appName="Reader" sections={four} autoHideHeader {...props}>
          x
        </AppShell>
      )
    }
    afterEach(() => {
      vi.unstubAllGlobals()
      if (offsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight)
      Reflect.deleteProperty(window, "scrollY")
    })

    it("is off unless asked for: scrolling never hides the header", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      scrollTo(400)

      expect(top(container).getAttribute("data-hidden")).toBeNull()
    })

    it("starts shown", () => {
      const { container } = withHeader()

      expect(top(container).getAttribute("data-hidden")).toBeNull()
    })

    it("hides on scroll down once past the header", () => {
      const { container } = withHeader()

      scrollTo(200)

      expect(top(container).getAttribute("data-hidden")).toBe("true")
      expect(top(container).className).toContain("data-[hidden=true]:-translate-y-full")
    })

    it("shows again on scroll up", () => {
      const { container } = withHeader()
      scrollTo(300)

      scrollTo(260)

      expect(top(container).getAttribute("data-hidden")).toBeNull()
    })

    it("stays shown while the page is still under the header's own height", () => {
      const { container } = withHeader()

      scrollTo(40)

      expect(top(container).getAttribute("data-hidden")).toBeNull()
    })

    it("ignores a small jitter of scroll", () => {
      const { container } = withHeader()
      scrollTo(120)
      scrollTo(70)
      expect(top(container).getAttribute("data-hidden")).toBeNull()

      scrollTo(74)

      expect(top(container).getAttribute("data-hidden")).toBeNull()
    })

    it("shows at the top of the page", () => {
      const { container } = withHeader()
      scrollTo(300)

      scrollTo(0)

      expect(top(container).getAttribute("data-hidden")).toBeNull()
    })

    it("never hides while a control inside it has focus", () => {
      const { container } = withHeader({ headerActions: <button type="button">Sync</button> })
      screen.getByRole("button", { name: "Sync" }).focus()

      scrollTo(300)

      expect(top(container).getAttribute("data-hidden")).toBeNull()
    })

    it("shows when focus moves into the hidden header", () => {
      const { container } = withHeader({ headerActions: <button type="button">Sync</button> })
      scrollTo(300)
      expect(top(container).getAttribute("data-hidden")).toBe("true")

      fireEvent.focusIn(screen.getByRole("button", { name: "Sync" }))

      expect(top(container).getAttribute("data-hidden")).toBeNull()
    })

    it("keeps the header in place whenever focus is inside it, even before React has re-rendered", () => {
      const { container } = withHeader()

      expect(top(container).className).toContain("focus-within:translate-y-0")
    })

    it("is off under prefers-reduced-motion: the header never hides", () => {
      prefersReducedMotion(true)
      const { container } = withHeader()

      scrollTo(400)

      expect(top(container).getAttribute("data-hidden")).toBeNull()
    })

    it("slides rather than jumps, and not at all under reduced motion", () => {
      const { container } = withHeader()

      expect(top(container).className).toContain("transition-transform")
      expect(top(container).className).toContain("motion-reduce:transition-none")
    })

    it("takes its scroll listener off on unmount", () => {
      const remove = vi.spyOn(window, "removeEventListener")
      withHeader()

      cleanup()

      expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function))
      remove.mockRestore()
    })
  })

  // Landscape phone rail (#139): in landscape the bottom bar costs a third of a 402px screen, so from
  // (orientation: landscape) and (max-height: 500px) the same nav becomes a left icon rail, and the
  // header scrolls away instead of sticking.
  describe("landscape phone rail", () => {
    const R = "[@media(orientation:landscape)_and_(max-height:500px)]:"
    const rail = (container: HTMLElement) => tabBar(container)

    it("turns the one tab bar into a left rail, so there is still one Sections nav", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      const className = rail(container).className
      for (const token of [`${R}flex-col`, `${R}right-auto`, `${R}left-[var(--edge-x)]`, `${R}w-14`]) {
        expect(className, token).toContain(token)
      }
      expect(screen.getAllByRole("navigation", { name: "Sections" })).toHaveLength(2)
    })

    it("sits at the edge padding, which clears the inset and the curve", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const className = rail(container).className
      expect(className).toContain(`${R}left-[var(--edge-x)]`)
      expect(className).toContain(`${R}top-[max(0.5rem,var(--safe-t))]`)
      expect(className).toContain(`${R}bottom-[var(--edge-b)]`)
    })

    it("shows icons only, and keeps each label for the tab's name", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      const bar = within(rail(container))
      for (const control of [...bar.getAllByRole("link"), bar.getByRole("button", { name: "More" })]) {
        expect(control.className).toContain(`${R}[&>span]:sr-only`)
      }
      expect(bar.getByRole("link", { name: "Home" })).toBeTruthy()
    })

    it("keeps every control at least 44px and the focus ring solid", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      const bar = within(rail(container))
      for (const control of [...bar.getAllByRole("link"), bar.getByRole("button", { name: "More" })]) {
        expect(control.className).toContain(`${R}min-w-11`)
        expect(control.className).toContain(`${R}min-h-11`)
        expect(control.className).toContain(`${R}flex-none`)
        expect(control.className).toContain("focus-visible:ring-ring")
        expect(control.className).not.toContain("ring-ring/50")
      }
    })

    it("puts the More label in a span, so the icon-only rules reach it like the other tabs", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      const more = within(rail(container)).getByRole("button", { name: "More" })
      expect(more.querySelector(":scope > span")?.textContent).toBe("More")
    })

    it("scrolls inside itself rather than running off a short screen", () => {
      const { container } = render(<AppShell appName="Reader" sections={six}>x</AppShell>)

      expect(rail(container).className).toContain(`${R}overflow-y-auto`)
    })

    it("makes the header non-sticky, and moves it clear of the rail", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const className = header(container).parentElement!.className
      expect(className).toContain("sticky")
      expect(className).toContain(`${R}static`)
      expect(className).toContain(`${R}pl-[calc(var(--edge-x)+4rem)]`)
    })

    it("moves the page clear of the rail", () => {
      render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const className = screen.getByRole("main").className
      expect(className).toContain(`${R}pl-[calc(var(--edge-x)+4.5rem)]`)
      expect(className).toContain(`${R}pb-edge`)
    })

    it("gives the page no room for a bottom bar in landscape", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(container.querySelector<HTMLElement>("[data-slot=app-shell]")!.className).toContain(
        `${R}[--shell-bottom:var(--edge-b)]`
      )
    })

    // #161: the side padding is room for the rail, so it is only taken when a rail is drawn.
    describe("with one section (no tab bar, so no rail)", () => {
      const railPadding = /max-height:500px\)\]:pl-\[/

      it("takes no rail padding on the header wrapper or the page", () => {
        const { container } = render(<AppShell appName="Reader" sections={[four[0]]}>x</AppShell>)

        expect(tabBar(container)).toBeNull()
        expect(header(container).parentElement!.className).not.toMatch(railPadding)
        expect(screen.getByRole("main").className).not.toMatch(railPadding)
      })

      it("still lets the header scroll away in landscape and keeps the page's bottom edge", () => {
        const { container } = render(<AppShell appName="Reader" sections={[four[0]]}>x</AppShell>)

        expect(header(container).parentElement!.className).toContain(`${R}static`)
        expect(screen.getByRole("main").className).toContain(`${R}pb-edge`)
      })

      it("takes the padding as soon as a second section brings the rail", () => {
        const { container } = render(<AppShell appName="Reader" sections={four.slice(0, 2)}>x</AppShell>)

        expect(header(container).parentElement!.className).toContain(`${R}pl-[calc(var(--edge-x)+4rem)]`)
        expect(screen.getByRole("main").className).toContain(`${R}pl-[calc(var(--edge-x)+4.5rem)]`)
      })
    })

    it("leaves focus mode's page without rail padding, with or without a back control", () => {
      for (const back of [undefined, { href: "/up" }]) {
        const { unmount } = render(<AppShell appName="Reader" sections={four} chrome="none" back={back}>x</AppShell>)

        const className = screen.getByRole("main").className
        expect(className).not.toMatch(/max-height:500px\)\]:pl-\[/)
        expect(className).toContain("pb-edge")
        unmount()
      }
    })

    it("draws no rail in focus mode", () => {
      const { container } = render(<AppShell appName="Reader" sections={four} chrome="none">x</AppShell>)

      expect(container.querySelector("[data-slot=app-shell-tabbar]")).toBeNull()
    })

    describe("workspace variables", () => {
      const railMatches = (matches: boolean) =>
        vi.stubGlobal("matchMedia", (query: string) => ({
          matches: matches && query.includes("max-height: 500px"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }))
      afterEach(() => {
        vi.unstubAllGlobals()
        if (offsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight)
        document.documentElement.removeAttribute("style")
        observed.length = 0
      })
      const layout = () => {
        vi.stubGlobal("ResizeObserver", FakeResizeObserver)
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
          configurable: true,
          get() {
            const slot = (this as HTMLElement).dataset.slot
            if (slot === "app-shell-tabbar") return 320
            return slot === "app-shell-top" ? 64 : 0
          },
        })
      }

      it("does not count the rail's height as bottom chrome", () => {
        layout()
        railMatches(true)
        const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

        expect(container.querySelector<HTMLElement>("[data-slot=app-shell]")!.style.getPropertyValue("--shell-bottom")).toBe("")
        expect(document.documentElement.style.getPropertyValue("--scroll-pad-bottom")).toBe("")
      })

      it("does not pad scrolling for the header, which no longer sticks", () => {
        layout()
        railMatches(true)
        render(<AppShell appName="Reader" sections={four}>x</AppShell>)

        expect(document.documentElement.style.getPropertyValue("--scroll-pad-top")).toBe("")
      })

      it("keeps the portrait measurements outside the rail", () => {
        layout()
        railMatches(false)
        render(<AppShell appName="Reader" sections={four}>x</AppShell>)

        expect(document.documentElement.style.getPropertyValue("--scroll-pad-top")).toBe("64px")
        expect(document.documentElement.style.getPropertyValue("--scroll-pad-bottom")).toBe("320px")
      })

      it("leaves the header alone on scroll, because it scrolls away by itself", () => {
        layout()
        railMatches(true)
        const { container } = render(<AppShell appName="Reader" sections={four} autoHideHeader>x</AppShell>)
        Object.defineProperty(window, "scrollY", { configurable: true, value: 300 })

        fireEvent.scroll(window)

        expect(container.querySelector("[data-slot=app-shell-top]")!.getAttribute("data-hidden")).toBeNull()
        Reflect.deleteProperty(window, "scrollY")
      })
    })

    it("reads no side inset in the rail without a max() floor", () => {
      const use = /(env\(safe-area-inset-(?:left|right)\)|var\(--safe-[lr]\))/g
      for (const line of shellSource.split("\n").filter((entry) => entry.includes("max-height:500px"))) {
        for (const [, inset] of line.matchAll(use)) {
          expect(line.slice(0, line.indexOf(inset)), inset).toMatch(/max\([^()]*$/)
        }
      }
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
  // Large text (#150, #162): the chrome's text and heights stop growing at about 150%, then the tab bar
  // drops to icon-only. The 44px touch target is a floor under every size.
  describe("large text", () => {
    const capped = /(?:min|clamp)\(/

    it("caps the tab label and icon at 150% of their size", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      const tab = tabBar(container).querySelector("a")!
      expect(tab.className).toContain("text-[min(0.75rem,18px)]")
      expect(tab.className).toContain("[&_svg]:size-[min(1.25rem,30px)]")
      expect(tab.className).not.toMatch(/(?:^|\s)text-2xs(?:\s|$)/)
    })

    it("keeps a tab at least 44px tall at every root size, and stops it at 150%", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(tabBar(container).querySelector("a")!.className).toContain("min-h-[clamp(44px,3.125rem,75px)]")
    })

    it("turns the labels sr-only, not hidden, when the bar is too narrow for them", () => {
      const { container } = render(<AppShell appName="Reader" sections={four}>x</AppShell>)

      expect(tabBar(container).className).toContain("@container/tabbar")
      const tab = tabBar(container).querySelector("a")!
      expect(tab.className).toContain("@max-[16rem]/tabbar:[&>span]:sr-only")
      expect(tab.className).toContain("@max-[16rem]/tabbar:min-h-[44px]")
      expect(tab.textContent).toContain("Home")
    })

    it("caps the header row and its back control, with a 44px floor", () => {
      const { container } = render(<AppShell appName="Reader" sections={four} back={{ href: "/" }}>x</AppShell>)

      expect(header(container).className).toContain("min-h-[min(3rem,72px)]")
      expect(container.querySelector("a[aria-label=Back]")!.className).toContain("min-h-[clamp(44px,2.75rem,66px)]")
    })

    it("stops the back control and icon-button actions at 66px, so the header fits at any size", () => {
      const { container } = render(<AppShell appName="Reader" sections={four} back={{ href: "/" }} headerActions={<button>Go</button>}>x</AppShell>)

      const back = container.querySelector<HTMLElement>("a[aria-label=Back]")!
      expect(back.className).toContain("max-h-[66px]")
      expect(back.className).toContain("max-w-[66px]")
      const actions = within(header(container)).getByText("Go").parentElement!
      expect(actions.className).toContain("[&_.size-8]:max-w-[66px]")
    })

    it("keeps header actions from being squeezed out by a long app name", () => {
      const { container } = render(<AppShell appName="Reader" sections={four} headerActions={<button>Go</button>}>x</AppShell>)

      expect(within(header(container)).getByText("Go").parentElement!.className).toContain("shrink-0")
    })

    it("never states a chrome height in bare rem", () => {
      const bare = shellSource
        .split("\n")
        .filter((line) => /(?:min-h|--shell-top|--shell-bottom)[^"\s]*\d(?:\.\d+)?rem/.test(line) && !capped.test(line))
      expect(bare).toEqual([])
    })
  })
})
