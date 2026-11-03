import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../registry/base-nova/ui/resizable"

// jsdom has no ResizeObserver, and embla reads matchMedia for its breakpoints.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as MediaQueryList
})

afterEach(cleanup)

describe("Resizable", () => {
  it("lays out two panels with a separator between them", () => {
    const { container } = render(
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={30}>Sidebar</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={70}>Main</ResizablePanel>
      </ResizablePanelGroup>,
    )

    expect(container.querySelectorAll("[data-panel]")).toHaveLength(2)
    expect(container.querySelector('[role="separator"]')).not.toBeNull()
  })
})
