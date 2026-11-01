import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "../registry/base-nova/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../registry/base-nova/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "../registry/base-nova/ui/drawer"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../registry/base-nova/ui/sheet"

// Curve-safe overlays (design-system#140). jsdom resolves no CSS, so these tests read
// the utility classes each overlay edge carries. The pixel check on a real device is
// design-system#141.

const sonnerProps = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }))

vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    sonnerProps.current = props
    return null
  },
}))

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light" }) }))

afterEach(() => {
  cleanup()
  sonnerProps.current = undefined
})

const classesOf = (element: Element | null) => (element?.getAttribute("class") ?? "").split(/\s+/)

function renderSheet(side: "top" | "right" | "bottom" | "left", children?: ReactNode) {
  render(
    <Sheet open>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription>Description</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>,
  )
  return document.querySelector('[data-slot="sheet-content"]')
}

describe("SheetContent insets", () => {
  it("clears the status bar and both curves on a top sheet", () => {
    const classes = classesOf(renderSheet("top"))
    expect(classes).toContain("data-[side=top]:pt-(--safe-t)")
    expect(classes).toContain("data-[side=top]:pl-(--safe-l)")
    expect(classes).toContain("data-[side=top]:pr-(--safe-r)")
  })

  it("clears the home indicator and both curves on a bottom sheet, with a 1rem floor", () => {
    const classes = classesOf(renderSheet("bottom"))
    expect(classes).toContain("data-[side=bottom]:pb-[max(var(--safe-b),1rem)]")
    expect(classes).toContain("data-[side=bottom]:pl-(--safe-l)")
    expect(classes).toContain("data-[side=bottom]:pr-(--safe-r)")
  })

  it("clears the top, bottom and outer curve of a left sheet", () => {
    const classes = classesOf(renderSheet("left"))
    expect(classes).toContain("data-[side=left]:pt-(--safe-t)")
    expect(classes).toContain("data-[side=left]:pb-(--safe-b)")
    expect(classes).toContain("data-[side=left]:pl-(--safe-l)")
  })

  it("clears the top, bottom and outer curve of a right sheet", () => {
    const classes = classesOf(renderSheet("right"))
    expect(classes).toContain("data-[side=right]:pt-(--safe-t)")
    expect(classes).toContain("data-[side=right]:pb-(--safe-b)")
    expect(classes).toContain("data-[side=right]:pr-(--safe-r)")
  })
})

describe("SheetContent close button", () => {
  const closeOf = (side: "top" | "right" | "bottom" | "left") => {
    renderSheet(side)
    return classesOf(screen.getByRole("button", { name: "Close" }))
  }

  it("moves below the status bar and inside the right curve on a right sheet", () => {
    const classes = closeOf("right")
    expect(classes).toContain("top-[calc(var(--safe-t)+0.75rem)]")
    expect(classes).toContain("right-[calc(var(--safe-r)+0.75rem)]")
  })

  it("moves below the status bar on a left sheet but stays 0.75rem off the sheet's inner edge", () => {
    const classes = closeOf("left")
    expect(classes).toContain("top-[calc(var(--safe-t)+0.75rem)]")
    expect(classes).toContain("right-3")
  })

  it("keeps the 0.75rem top offset on a bottom sheet, which has no top inset", () => {
    const classes = closeOf("bottom")
    expect(classes).toContain("top-3")
    expect(classes).toContain("right-[calc(var(--safe-r)+0.75rem)]")
  })
})

function renderDialog(showCloseButton?: boolean) {
  render(
    <Dialog open>
      <DialogContent showCloseButton={showCloseButton}>
        <DialogHeader>
          <DialogTitle>A long dialog title</DialogTitle>
          <DialogDescription>Description</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>,
  )
  return document.querySelector('[data-slot="dialog-content"]')
}

describe("DialogContent insets", () => {
  it("caps its height to the viewport minus the larger vertical inset on each side, and scrolls", () => {
    const classes = classesOf(renderDialog())
    expect(classes).toContain("max-h-[calc(100dvh-2rem-2*max(var(--safe-t),var(--safe-b)))]")
    expect(classes).toContain("overflow-y-auto")
  })

  it("keeps a side margin of at least 1rem, and the larger side inset when there is one", () => {
    const classes = classesOf(renderDialog())
    expect(classes).toContain("max-w-[calc(100%-2*max(1rem,var(--safe-l),var(--safe-r)))]")
    expect(classes).not.toContain("max-w-[calc(100%-2rem)]")
  })
})

describe("AlertDialogContent insets", () => {
  it("caps its height to the viewport minus the larger vertical inset on each side, and scrolls", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    )
    const classes = classesOf(document.querySelector('[data-slot="alert-dialog-content"]'))
    expect(classes).toContain("max-h-[calc(100dvh-2rem-2*max(var(--safe-t),var(--safe-b)))]")
    expect(classes).toContain("overflow-y-auto")
  })
})

describe("DialogHeader close button clearance", () => {
  it("reserves room for the close button when the dialog shows one", () => {
    renderDialog()
    expect(classesOf(document.querySelector('[data-slot="dialog-header"]'))).toContain(
      "group-data-[close-button]/dialog-content:pr-10",
    )
    expect(document.querySelector('[data-slot="dialog-content"]')?.hasAttribute("data-close-button")).toBe(true)
  })

  it("leaves no close-button marker when the dialog hides it", () => {
    renderDialog(false)
    expect(document.querySelector('[data-slot="dialog-content"]')?.hasAttribute("data-close-button")).toBe(false)
  })
})

function renderDrawer(props: { snapPoints?: number[] } = {}) {
  const { snapPoints } = props
  render(
    <Drawer open snapPoints={snapPoints}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Title</DrawerTitle>
          <DrawerDescription>Description</DrawerDescription>
        </DrawerHeader>
      </DrawerContent>
    </Drawer>,
  )
  return document.querySelector('[data-slot="drawer-popup"]')
}

describe("DrawerContent insets", () => {
  it("clears the status bar when a snap point takes it to the full screen height", () => {
    const classes = classesOf(renderDrawer({ snapPoints: [0.5, 1] }))
    expect(classes).toContain("data-[swipe-axis=y]:data-snap-points:pt-(--safe-t)")
  })

  it("clears the home indicator and both curves on a bottom drawer", () => {
    const classes = classesOf(renderDrawer())
    expect(classes).toContain("data-[swipe-direction=down]:pb-(--safe-b)")
    expect(classes).toContain("data-[swipe-axis=y]:pl-(--safe-l)")
    expect(classes).toContain("data-[swipe-axis=y]:pr-(--safe-r)")
  })

  it("clears the top and bottom of a side drawer", () => {
    const classes = classesOf(renderDrawer())
    expect(classes).toContain("data-[swipe-axis=x]:pt-(--safe-t)")
    expect(classes).toContain("data-[swipe-axis=x]:pb-(--safe-b)")
  })
})

describe("Toaster offsets", () => {
  it("defaults the top and bottom offsets below the status bar and above the home indicator", async () => {
    const { Toaster } = await import("../registry/base-nova/ui/sonner")
    render(<Toaster />)
    expect(sonnerProps.current?.offset).toEqual({
      top: "calc(var(--safe-t) + 8px)",
      bottom: "calc(var(--safe-b) + 8px)",
    })
  })

  it("defaults the mobile offsets the same way", async () => {
    const { Toaster } = await import("../registry/base-nova/ui/sonner")
    render(<Toaster />)
    expect(sonnerProps.current?.mobileOffset).toEqual({
      top: "calc(var(--safe-t) + 8px)",
      bottom: "calc(var(--safe-b) + 8px)",
    })
  })

  it("lets a consumer's own offset replace the default", async () => {
    const { Toaster } = await import("../registry/base-nova/ui/sonner")
    render(<Toaster offset={24} />)
    expect(sonnerProps.current?.offset).toBe(24)
  })
})
