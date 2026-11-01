"use client"

import * as React from "react"
import { cn } from "cn"

// The scroller names itself from the caption: the caption reports its id up, so
// the region is labelled only when there is a caption to label it with.
const TableCaptionIdContext = React.createContext<(id: string | undefined) => void>(
  () => {}
)

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = React.useState(false)
  const [captionId, setCaptionId] = React.useState<string>()

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () =>
      setOverflowing(container.scrollWidth > container.clientWidth)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    if (container.firstElementChild) observer.observe(container.firstElementChild)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      // Safari does not tab into a scroller, so a table that overflows is a
      // focusable, named region (WCAG 2.1.1, axe scrollable-region-focusable).
      tabIndex={overflowing ? 0 : undefined}
      role={overflowing && captionId ? "region" : undefined}
      aria-labelledby={overflowing && captionId ? captionId : undefined}
      className="relative w-full overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <TableCaptionIdContext.Provider value={setCaptionId}>
        <table
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </TableCaptionIdContext.Provider>
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-selected:bg-muted data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  id,
  ...props
}: React.ComponentProps<"caption">) {
  const generatedId = React.useId()
  const captionId = id ?? generatedId
  const reportCaptionId = React.useContext(TableCaptionIdContext)

  React.useEffect(() => {
    reportCaptionId(captionId)
    return () => reportCaptionId(undefined)
  }, [captionId, reportCaptionId])

  return (
    <caption
      id={captionId}
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
