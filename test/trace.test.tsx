import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "../registry/base-nova/ui/trace"

afterEach(cleanup)

describe("Trace", () => {
  it("renders a line with an aria-hidden icon, a title and a description", () => {
    const { container } = render(
      <Trace>
        <TraceLine>
          <TraceIcon>
            <svg />
          </TraceIcon>
          <TraceTitle>Read 3 files</TraceTitle>
          <TraceDescription>1.2s</TraceDescription>
        </TraceLine>
      </Trace>
    )

    expect(container.querySelector("[data-slot=trace]")).not.toBeNull()
    expect(container.querySelector("[data-slot=trace-icon]")?.getAttribute("aria-hidden")).toBe(
      "true"
    )
    expect(screen.getByText("Read 3 files").getAttribute("data-slot")).toBe("trace-title")
    expect(screen.getByText("1.2s").getAttribute("data-slot")).toBe("trace-description")
  })

  it.each(["running", "error", "pending"] as const)(
    "exposes the %s status as a data attribute",
    (status) => {
      const { container } = render(
        <TraceLine status={status}>
          <TraceTitle>Step</TraceTitle>
        </TraceLine>
      )

      expect(container.querySelector("[data-slot=trace-line]")?.getAttribute("data-status")).toBe(
        status
      )
    }
  )

  it("leaves a completed line without a status", () => {
    const { container } = render(<TraceLine>Done</TraceLine>)

    expect(container.querySelector("[data-slot=trace-line]")?.hasAttribute("data-status")).toBe(
      false
    )
  })

  it("styles status through semantic tokens only", () => {
    const { container } = render(<TraceLine status="error">Failed</TraceLine>)
    const classes = container.querySelector("[data-slot=trace-line]")!.className

    expect(classes).toContain("text-muted-foreground")
    expect(classes).toContain("data-[status=error]:text-destructive")
  })
})

describe("TraceCollapsible", () => {
  const renderRow = (props: Partial<React.ComponentProps<typeof TraceCollapsible>> = {}) =>
    render(
      <TraceCollapsible {...props}>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceTitle>Ran tests</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>Output goes here</TraceCollapsibleContent>
      </TraceCollapsible>
    )

  it("opens and closes from the trigger, with a chevron after the line", () => {
    const { container } = renderRow()
    const trigger = screen.getByRole("button", { name: /Ran tests/ })

    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText("Output goes here")).toBeNull()
    expect(trigger.querySelector("svg.lucide-chevron-right")).not.toBeNull()
    expect(container.querySelectorAll("[data-slot=trace-icon]")).toHaveLength(1)

    fireEvent.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("Output goes here")).not.toBeNull()

    fireEvent.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("honours defaultOpen", () => {
    renderRow({ defaultOpen: true })

    expect(screen.getByText("Output goes here")).not.toBeNull()
  })

  it("is controlled through open and onOpenChange", () => {
    const changes: boolean[] = []
    renderRow({ open: false, onOpenChange: (open: boolean) => changes.push(open) })

    fireEvent.click(screen.getByRole("button", { name: /Ran tests/ }))

    expect(changes).toEqual([true])
    expect(screen.queryByText("Output goes here")).toBeNull()
  })

  it("nests a collapsible inside collapsible content", () => {
    render(
      <TraceCollapsible defaultOpen>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceTitle>Subagent</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>
            <TraceCollapsible defaultOpen>
              <TraceCollapsibleTrigger>
                <TraceLine>
                  <TraceTitle>Inner step</TraceTitle>
                </TraceLine>
              </TraceCollapsibleTrigger>
              <TraceCollapsibleContent>Inner detail</TraceCollapsibleContent>
            </TraceCollapsible>
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    )

    expect(screen.getByText("Inner detail")).not.toBeNull()
  })

  it("keeps closed content mounted with keepMounted", () => {
    render(
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>Step</TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted>Kept</TraceCollapsibleContent>
      </TraceCollapsible>
    )

    expect(screen.getByText("Kept", { selector: "[hidden] *, [hidden]" })).not.toBeNull()
  })
})
