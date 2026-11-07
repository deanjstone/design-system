import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, describe, expect, it, vi } from "vitest"

import { IssueRow, IssueRowList } from "../registry/base-nova/blocks/issue-row"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const LONG_TITLE =
  "A very long issue title that keeps going well past the width of a 320 pixel phone screen and must be cut, never wrapped"

const actions = (onSelect = vi.fn()) => [
  { id: "assign", label: "Assign to me", onSelect },
  { id: "close", label: "Close", onSelect, destructive: true },
]

const cell = (container: HTMLElement, slot: string) => container.querySelector<HTMLElement>(`[data-slot=issue-row-${slot}]`)

// jsdom opens a Base UI menu from a bare click; the full mouse sequence toggles it open and shut again.
const openMore = () => {
  fireEvent.click(screen.getByRole("button", { name: /more actions/i }))
}

describe("IssueRowList", () => {
  it("is a list of rows with no bullets", () => {
    render(
      <IssueRowList>
        <IssueRow title="First" />
        <IssueRow title="Second" />
      </IssueRowList>,
    )

    const list = screen.getByRole("list")
    expect(list.className).toContain("list-none")
    // divide-y alone draws in currentColor (near-black) wherever the app has no base border colour.
    expect(list.className).toContain("divide-border")
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
  })
})

describe("IssueRow: opening the item", () => {
  it("is a 44px row", () => {
    const { container } = render(<IssueRow title="T" />)

    const row = container.querySelector("[data-slot=issue-row]")!
    expect(row.tagName).toBe("LI")
    expect(row.className).toContain("h-11")
  })

  it("makes the title a link when given an href, and names the row by its title", () => {
    render(<IssueRow title="Fix the promotion card" href="/issues/12" />)

    const link = screen.getByRole("link", { name: "Fix the promotion card" })
    expect(link.getAttribute("href")).toBe("/issues/12")
  })

  it("makes the title a button that calls onOpen when there is no href", () => {
    const onOpen = vi.fn()
    render(<IssueRow title="Fix the promotion card" onOpen={onOpen} />)

    fireEvent.click(screen.getByRole("button", { name: "Fix the promotion card" }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("lets the app's router link stand in for the title control", () => {
    render(<IssueRow title="Routed" render={<a href="/routed" data-router="yes" />} />)

    const link = screen.getByRole("link", { name: "Routed" })
    expect(link.getAttribute("data-router")).toBe("yes")
  })

  it("stretches the title's hit area over the whole row, so a tap anywhere opens the item", () => {
    render(<IssueRow title="T" href="/x" />)

    const link = screen.getByRole("link", { name: "T" })
    expect(link.className).toContain("after:absolute")
    expect(link.className).toContain("after:inset-0")
    // Above a positioned sibling such as an avatar (found in WebKit: the avatar swallowed the tap), below the more button.
    expect(link.className).toContain("after:z-[1]")
    expect(link.closest("[data-slot=issue-row]")!.className).toContain("relative")
  })

  it("keeps a plain title as text when there is nothing to open", () => {
    render(<IssueRow title="Just text" />)

    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText("Just text")).toBeTruthy()
  })
})

describe("IssueRow: columns drop away by priority", () => {
  const full = (
    <IssueRow
      title={LONG_TITLE}
      href="/x"
      priority={<span>P1</span>}
      identifier="DS-192"
      status={<span>Working</span>}
      labels={<span>design</span>}
      project="W1"
      dueDate="Due Nov 12"
      assignee={<span>DS</span>}
      actions={actions()}
    />
  )

  it("shows only priority, status and the title below sm", () => {
    const { container } = render(full)

    expect(cell(container, "priority")!.className).not.toMatch(/hidden/)
    expect(cell(container, "status")!.className).not.toMatch(/hidden/)
    expect(cell(container, "title")!.className).not.toMatch(/hidden/)
  })

  it("brings in the id, due date and assignee at sm", () => {
    const { container } = render(full)

    for (const slot of ["identifier", "due-date", "assignee"]) {
      const className = cell(container, slot)!.className
      expect(className, slot).toContain("hidden")
      expect(className, slot).toMatch(/\bsm:(inline-flex|inline-block|flex|inline)\b/)
    }
  })

  it("brings in the labels and project or wave at lg", () => {
    const { container } = render(full)

    for (const slot of ["labels", "project"]) {
      const className = cell(container, slot)!.className
      expect(className, slot).toContain("hidden")
      expect(className, slot).toMatch(/\blg:(inline-flex|inline-block|flex|inline)\b/)
    }
  })

  it("cuts the title with an ellipsis and never lets it shrink the other columns' room", () => {
    const { container } = render(full)

    const title = cell(container, "title")!
    expect(title.className).toContain("min-w-0")
    expect(title.className).toContain("truncate")
    expect(title.className).toContain("flex-1")
    expect(title.getAttribute("title")).toBe(LONG_TITLE)
  })

  it("keeps every column except the title at its own width", () => {
    const { container } = render(full)

    for (const slot of ["priority", "identifier", "status", "labels", "project", "due-date", "assignee"]) {
      expect(cell(container, slot)!.className, slot).toContain("shrink-0")
    }
  })

  it("renders no empty slot for a column the row does not have", () => {
    const { container } = render(<IssueRow title="Only a title" />)

    for (const slot of ["priority", "identifier", "status", "labels", "project", "due-date", "assignee", "more"]) {
      expect(cell(container, slot), slot).toBeNull()
    }
  })

  it("keeps the columns in circle's order: priority, id, status, title, labels, project, due date, assignee", () => {
    const { container } = render(full)

    const order = ["priority", "identifier", "status", "title", "labels", "project", "due-date", "assignee"].map((slot) => cell(container, slot)!)
    order.forEach((node, index) => {
      if (index === 0) return
      expect(order[index - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })
})

describe("IssueRow: the actions behind the right-click", () => {
  it("has no more button and no menu when it has no actions", () => {
    render(<IssueRow title="T" href="/x" />)

    expect(screen.queryByRole("button", { name: /more actions/i })).toBeNull()
    fireEvent.contextMenu(screen.getByText("T"))
    expect(screen.queryByRole("menu")).toBeNull()
  })

  describe("the trailing more button", () => {
    it("is a 44px touch target named for the row it acts on", () => {
      render(<IssueRow title="Fix the promotion card" href="/x" actions={actions()} />)

      const more = screen.getByRole("button", { name: "More actions for Fix the promotion card" })
      expect(more.className).toContain("size-11")
      expect(more.className).toContain("touch-manipulation")
    })

    it("sits above the stretched title link, so tapping it does not open the item", () => {
      render(<IssueRow title="T" href="/x" actions={actions()} />)

      const more = screen.getByRole("button", { name: /more actions/i })
      expect(more.className).toContain("relative")
      expect(more.className).toContain("z-10")
    })

    it("takes its own label for an app that is not in English", () => {
      render(<IssueRow title="T" actions={actions()} moreLabel="Weitere Aktionen" />)

      expect(screen.getByRole("button", { name: "Weitere Aktionen" })).toBeTruthy()
    })

    it("opens a menu of the actions", () => {
      render(<IssueRow title="T" actions={actions()} />)

      openMore()

      const menu = screen.getByRole("menu")
      expect(within(menu).getByRole("menuitem", { name: "Assign to me" })).toBeTruthy()
      expect(within(menu).getByRole("menuitem", { name: "Close" })).toBeTruthy()
    })

    it("runs the action chosen and closes the menu", () => {
      const onSelect = vi.fn()
      render(<IssueRow title="T" actions={actions(onSelect)} />)

      openMore()
      fireEvent.click(screen.getByRole("menuitem", { name: "Assign to me" }))

      expect(onSelect).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole("menu")).toBeNull()
    })
  })

  describe("right-click", () => {
    it("opens the same menu", () => {
      render(<IssueRow title="T" href="/x" actions={actions()} />)

      fireEvent.contextMenu(screen.getByRole("link", { name: "T" }))

      const menu = screen.getByRole("menu")
      expect(within(menu).getAllByRole("menuitem")).toHaveLength(2)
    })

    it("runs the action chosen", () => {
      const onSelect = vi.fn()
      render(<IssueRow title="T" href="/x" actions={actions(onSelect)} />)

      fireEvent.contextMenu(screen.getByRole("link", { name: "T" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Close" }))

      expect(onSelect).toHaveBeenCalledTimes(1)
    })
  })

  describe("long-press", () => {
    const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] })

    it("opens the same menu once the finger has been down for half a second", () => {
      vi.useFakeTimers()
      render(<IssueRow title="T" href="/x" actions={actions()} />)

      fireEvent.touchStart(screen.getByRole("link", { name: "T" }), touch(40, 20))
      act(() => {
        vi.advanceTimersByTime(499)
      })
      expect(screen.queryByRole("menu")).toBeNull()

      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(within(screen.getByRole("menu")).getAllByRole("menuitem")).toHaveLength(2)
    })

    it("does not open for a tap that ends first, so a tap still opens the item", () => {
      vi.useFakeTimers()
      render(<IssueRow title="T" href="/x" actions={actions()} />)

      const link = screen.getByRole("link", { name: "T" })
      fireEvent.touchStart(link, touch(40, 20))
      fireEvent.touchEnd(link)
      act(() => {
        vi.advanceTimersByTime(800)
      })

      expect(screen.queryByRole("menu")).toBeNull()
    })

    it("does not open when the finger moves off, which is a scroll", () => {
      vi.useFakeTimers()
      render(<IssueRow title="T" href="/x" actions={actions()} />)

      const link = screen.getByRole("link", { name: "T" })
      fireEvent.touchStart(link, touch(40, 20))
      fireEvent.touchMove(link, touch(40, 80))
      act(() => {
        vi.advanceTimersByTime(800)
      })

      expect(screen.queryByRole("menu")).toBeNull()
    })

    it("turns off the iOS link callout and text selection so the press reaches the menu", () => {
      const { container } = render(<IssueRow title="T" href="/x" actions={actions()} />)

      const row = container.querySelector("[data-slot=issue-row]")!
      expect(row.className).toContain("select-none")
      expect(row.className).toContain("[-webkit-touch-callout:none]")
    })
  })

  it("marks a destructive action so it reads as one", () => {
    render(<IssueRow title="T" actions={actions()} />)

    openMore()

    expect(screen.getByRole("menuitem", { name: "Close" }).getAttribute("data-variant")).toBe("destructive")
    expect(screen.getByRole("menuitem", { name: "Assign to me" }).getAttribute("data-variant")).toBe("default")
  })

  it("sizes the menu to its labels instead of the 44px more button it opens from", () => {
    render(<IssueRow title="T" actions={actions()} />)

    openMore()

    const menu = screen.getByRole("menu")
    expect(menu.className).toContain("w-auto")
    expect(menu.className).toContain("min-w-48")
  })

  it("grows the menu items to 44px under a coarse pointer", () => {
    render(<IssueRow title="T" actions={actions()} />)

    openMore()

    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.className).toContain("pointer-coarse:min-h-11")
    }
  })
})

describe("IssueRow: accessibility", () => {
  it("has no axe violations in a list of full rows", async () => {
    const { container } = render(
      <IssueRowList aria-label="Open issues">
        <IssueRow
          title="Fix the promotion card"
          href="/issues/12"
          priority={<span aria-label="Priority: urgent">!</span>}
          identifier="DS-12"
          status={<span aria-label="Status: working">W</span>}
          labels={<span>design</span>}
          project="Wave 1"
          dueDate="Due Nov 12"
          assignee={<span aria-label="Assigned to Dean">D</span>}
          actions={actions()}
        />
        <IssueRow title="Plain" onOpen={() => {}} />
      </IssueRowList>,
    )

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([])
  })
})
