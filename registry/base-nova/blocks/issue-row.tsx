"use client"

// Pattern from circle's `components/common/issues/issue-line.tsx`
// (https://github.com/ln-dev7/circle), MIT License, Copyright (c) 2025 lndev-ui | Circle Template.
// Re-implemented here on @base-ui/react and this registry's tokens: no motion, no router, no store,
// no mock data. What is circle's: the 44px row, the column order, and the columns dropping away as the
// screen narrows. What is new: a stretched title link, a trailing "more" button and a long-press, so
// the actions circle keeps behind a right-click work on a phone.

import * as React from "react"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "cn"
import { EllipsisIcon } from "lucide-react"

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type IssueRowListProps = React.ComponentProps<"ul">

// The list the rows sit in: `ul`, no bullets, a hairline between rows. `min-w-0` lets it shrink inside
// a flex or grid parent, so a long title can never make the page scroll sideways.
function IssueRowList({ className, ...props }: IssueRowListProps) {
  return (
    <ul
      data-slot="issue-row-list"
      role="list"
      className={cn("m-0 flex min-w-0 list-none flex-col divide-y divide-border p-0", className)}
      {...props}
    />
  )
}

type IssueRowAction = {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
  onSelect?: () => void
  /** Reads as a destructive choice, for example Close or Delete. */
  destructive?: boolean
}

type IssueRowProps = Omit<React.ComponentProps<"li">, "title" | "children"> & {
  /** Wraps when it does not fit, so no title is cut off. It is the row's name and its open target. */
  title: React.ReactNode
  /** Makes the title a link. */
  href?: string
  /** Makes the title a button, when there is no `href`. */
  onOpen?: () => void
  /** Stands in for the title's element, for example the app's router `Link`. */
  render?: useRender.RenderProp
  /** The columns, left to right. Leave out what a row does not have. Pass a text alternative (`aria-label` or `sr-only` text) with an icon. */
  priority?: React.ReactNode
  identifier?: React.ReactNode
  status?: React.ReactNode
  labels?: React.ReactNode
  /** A project, or a wave. */
  project?: React.ReactNode
  dueDate?: React.ReactNode
  assignee?: React.ReactNode
  /** The row's actions: a trailing more button, a right-click and a long-press all open them. */
  actions?: IssueRowAction[]
  /** The more button's whole accessible name, for an app not in English. Default "More actions for <title>". */
  moreLabel?: string
}

// Below sm a row is the priority, the status, the title and the more button. At sm the id, due date and
// assignee join; at lg the labels and the project or wave. The title takes what is left and is cut, so
// it never squeezes the columns that are there.
function IssueRow({
  title,
  href,
  onOpen,
  render,
  priority,
  identifier,
  status,
  labels,
  project,
  dueDate,
  assignee,
  actions = [],
  moreLabel,
  className,
  ...props
}: IssueRowProps) {
  const hasActions = actions.length > 0
  const interactive = href != null || onOpen != null || render != null
  const titleText = typeof title === "string" ? title : undefined
  const moreName = moreLabel ?? (titleText ? `More actions for ${titleText}` : "More actions")

  const control = useRender({
    defaultTagName: href != null ? "a" : onOpen != null ? "button" : "span",
    props: {
      "data-slot": "issue-row-title",
      href,
      type: href == null && onOpen != null ? "button" : undefined,
      onClick: onOpen,
      className: cn(
        "min-w-0 flex-1 py-1 text-left text-xs font-medium wrap-anywhere sm:text-sm sm:font-semibold",
        interactive &&
          "cursor-pointer outline-none after:absolute after:inset-0 after:z-[1] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset",
      ),
      children: title,
    },
    render,
  })

  const rowClassName = cn(
    "relative flex min-h-11 w-full min-w-0 items-center gap-2 select-none [-webkit-touch-callout:none]",
    "pl-[max(0.75rem,env(safe-area-inset-left))]",
    hasActions ? "pr-[max(0.25rem,env(safe-area-inset-right))]" : "pr-[max(0.75rem,env(safe-area-inset-right))]",
    "hover:bg-muted/50 active:bg-muted/50 data-popup-open:bg-muted/50",
    className,
  )

  const cells = (
    <>
      {priority != null ? (
        <span data-slot="issue-row-priority" className="flex shrink-0 items-center">
          {priority}
        </span>
      ) : null}
      {identifier != null ? (
        <span
          data-slot="issue-row-identifier"
          className="hidden w-16 shrink-0 text-sm font-medium wrap-anywhere text-muted-foreground tabular-nums sm:inline-block"
        >
          {identifier}
        </span>
      ) : null}
      {status != null ? (
        <span data-slot="issue-row-status" className="flex shrink-0 items-center">
          {status}
        </span>
      ) : null}
      {control}
      {labels != null ? (
        <span data-slot="issue-row-labels" className="hidden shrink-0 items-center gap-1 lg:inline-flex">
          {labels}
        </span>
      ) : null}
      {project != null ? (
        <span
          data-slot="issue-row-project"
          className="hidden max-w-32 shrink-0 rounded-md border wrap-anywhere px-1.5 py-0.5 text-xs text-muted-foreground lg:inline-block"
        >
          {project}
        </span>
      ) : null}
      {dueDate != null ? (
        <span data-slot="issue-row-due-date" className="hidden shrink-0 text-xs text-warning tabular-nums sm:inline-block">
          {dueDate}
        </span>
      ) : null}
      {assignee != null ? (
        <span data-slot="issue-row-assignee" className="hidden shrink-0 items-center sm:inline-flex">
          {assignee}
        </span>
      ) : null}
      {hasActions ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            data-slot="issue-row-more"
            aria-label={moreName}
            className="relative z-10 inline-flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted data-popup-open:text-foreground"
          >
            <EllipsisIcon aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48 max-w-[calc(100vw-1rem)]">
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.id}
                variant={action.destructive ? "destructive" : "default"}
                onClick={action.onSelect}
                className="pointer-coarse:min-h-11 pointer-coarse:px-3 pointer-coarse:text-base"
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )

  if (!hasActions) {
    return (
      <li data-slot="issue-row" className={rowClassName} {...props}>
        {cells}
      </li>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<li />} data-slot="issue-row" className={rowClassName} {...props}>
        {cells}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-auto min-w-48 max-w-[calc(100vw-1rem)]">
        {actions.map((action) => (
          <ContextMenuItem
            key={action.id}
            variant={action.destructive ? "destructive" : "default"}
            onClick={action.onSelect}
            className="pointer-coarse:min-h-11 pointer-coarse:px-3 pointer-coarse:text-base"
          >
            {action.icon}
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export { IssueRow, IssueRowList }
export type { IssueRowAction, IssueRowListProps, IssueRowProps }
