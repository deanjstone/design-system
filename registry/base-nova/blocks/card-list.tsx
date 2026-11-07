import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "cn"

type CardListProps = React.ComponentProps<"div">

// The page-width container for one or more groups. `min-w-0` lets it shrink inside a flex or grid
// parent, so a long title further down can never make the page scroll sideways.
function CardList({ className, ...props }: CardListProps) {
  return <div data-slot="card-list" className={cn("flex min-w-0 flex-col gap-5", className)} {...props} />
}

type CardListGroupProps = Omit<React.ComponentProps<"section">, "title"> & {
  /** The group's name, for example a repo. Labels the region and is its heading. */
  heading: React.ReactNode
  /** The heading element's level. Default 2; use 3 when the page already has an h2 above the list. */
  headingLevel?: 2 | 3 | 4
  /** A number shown beside the heading, for example how many cards the group holds. */
  count?: React.ReactNode
  /** Shown in place of the list when the group has no cards. */
  empty?: React.ReactNode
}

// A heading and its cards. A group with no cards keeps its heading and says so, rather than vanishing.
function CardListGroup({
  heading,
  headingLevel = 2,
  count,
  empty = "Nothing here",
  className,
  children,
  ...props
}: CardListGroupProps) {
  const headingId = React.useId()
  const Heading = `h${headingLevel}` as const
  const hasCards = React.Children.toArray(children).length > 0

  return (
    <section
      data-slot="card-list-group"
      aria-labelledby={headingId}
      className={cn("flex min-w-0 flex-col gap-2", className)}
      {...props}
    >
      <Heading
        id={headingId}
        data-slot="card-list-group-heading"
        className="flex min-w-0 items-baseline gap-2 px-1 text-sm font-medium"
      >
        <span className="min-w-0 truncate">{heading}</span>
        {count !== undefined ? (
          <span data-slot="card-list-group-count" className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
            {count}
          </span>
        ) : null}
      </Heading>
      {hasCards ? (
        <ul data-slot="card-list-group-items" role="list" className="m-0 flex min-w-0 list-none flex-col gap-2 p-0">
          {children}
        </ul>
      ) : (
        <p data-slot="card-list-group-empty" className="px-1 text-sm text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  )
}

type CardListItemProps = Omit<useRender.ComponentProps<"div">, "title"> & {
  /** First row. One line, cut with an ellipsis when it does not fit. */
  title: React.ReactNode
  /** Second row, in this order: status, branch, check, time. Leave out what a card does not have. */
  status?: React.ReactNode
  branch?: React.ReactNode
  check?: React.ReactNode
  time?: React.ReactNode
  /** The selected card: raised off the list and marked `aria-current`. */
  active?: boolean
}

// A two-row card: the title, then status, branch, check and time. Only the branch gives way when the
// row is tight (320 px), so the other three stay readable. A div by default; pass `render={<a href />}`
// or `render={<button />}` to make the whole card the tap target.
function CardListItem({ title, status, branch, check, time, active = false, className, render, ...props }: CardListItemProps) {
  const hasDetails = status != null || branch != null || check != null || time != null

  const card = useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex min-h-11 w-full min-w-0 flex-col justify-center gap-1 overflow-hidden rounded-xl border px-3 py-2 text-left text-sm outline-none",
          "[a]:cursor-pointer [a]:transition-colors [a]:hover:bg-muted [a]:active:bg-accent",
          "[button]:cursor-pointer [button]:transition-colors [button]:hover:bg-muted [button]:active:bg-accent",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          active
            ? "relative z-10 border-border bg-card text-card-foreground shadow-md ring-1 ring-foreground/10"
            : "border-transparent bg-muted/50",
          className,
        ),
        "aria-current": active ? "true" : undefined,
        "data-active": active ? "true" : undefined,
        children: (
          <>
            <span data-slot="card-list-item-row" className="flex min-w-0 items-center">
              <span
                data-slot="card-list-item-title"
                title={typeof title === "string" ? title : undefined}
                className="min-w-0 flex-1 truncate font-medium"
              >
                {title}
              </span>
            </span>
            {hasDetails ? (
              <span
                data-slot="card-list-item-row"
                className="flex min-w-0 items-center gap-x-2 text-xs text-muted-foreground"
              >
                {status != null ? (
                  <span data-slot="card-list-item-status" className="shrink-0">
                    {status}
                  </span>
                ) : null}
                {branch != null ? (
                  <span data-slot="card-list-item-branch" className="min-w-0 truncate font-mono">
                    {branch}
                  </span>
                ) : null}
                {check != null ? (
                  <span data-slot="card-list-item-check" className="shrink-0">
                    {check}
                  </span>
                ) : null}
                {time != null ? (
                  <span data-slot="card-list-item-time" className="ml-auto shrink-0 tabular-nums">
                    {time}
                  </span>
                ) : null}
              </span>
            ) : null}
          </>
        ),
      },
      props,
    ),
    render,
    state: { slot: "card-list-item", active },
  })

  return (
    <li data-slot="card-list-entry" className="m-0 min-w-0 list-none p-0">
      {card}
    </li>
  )
}

export { CardList, CardListGroup, CardListItem }
export type { CardListProps, CardListGroupProps, CardListItemProps }
