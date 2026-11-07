"use client"

// Pattern from circle's `components/common/issues/group-issues.tsx`, `grouped-issues-view.tsx` and its
// display menu (https://github.com/ln-dev7/circle), MIT License, Copyright (c) 2025 lndev-ui | Circle
// Template. Re-implemented here on @base-ui/react and this registry's tokens: no motion, no drag and drop,
// no store, no mock data. What is circle's: group headers with a count that collapse, and a display menu
// that groups and turns row properties on and off. What is new: 44px headers that keep clear of the safe
// areas, a native select for the grouping (the phone's own picker), a 44px checklist for the properties,
// and a list that takes any row, so the dense `IssueRow` is one choice and not a dependency.

import * as React from "react"
import { ChevronRightIcon, SlidersHorizontalIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { ALL_GROUP_KEY, type DisplayProperty, type DisplaySettings, type ListGroup } from "@/lib/list-group-core"

type GroupedListProps<Item> = Omit<React.ComponentProps<"div">, "children"> & {
  /** From `groupItems`. One group with `ALL_GROUP_KEY` (grouping off) draws as a plain list with no header. */
  groups: readonly ListGroup<Item>[]
  /** The keys of the collapsed groups. */
  collapsed: readonly string[]
  /** A header was pressed: collapse or expand that group. */
  onToggleGroup: (key: string) => void
  /** A stable id for an item. An item in two groups is drawn in both, so a key is only unique within a group. */
  getItemKey: (item: Item) => string
  /** One row, an `li`: for example `IssueRow`. It gets the group the item is drawn in. */
  renderItem: (item: Item, group: ListGroup<Item>) => React.ReactNode
  /** What to show when there are no groups. */
  empty?: React.ReactNode
  /** The level of the group headings, so they sit under the page's own. Default 3. */
  headingLevel?: 2 | 3 | 4 | 5 | 6
}

// `min-w-0` lets the list shrink inside a flex or grid parent, so a long title never scrolls the page sideways.
const listClass = "m-0 flex min-w-0 list-none flex-col divide-y divide-border p-0"

/**
 * Items under collapsible group headers, each showing its count. A header is a full-width 44px button.
 * It holds no state: pass `collapsed` and `onToggleGroup` (from `useDisplaySettings`, or your own).
 */
function GroupedList<Item>({ groups, collapsed, onToggleGroup, getItemKey, renderItem, empty, headingLevel = 3, className, ...props }: GroupedListProps<Item>) {
  const Heading = `h${headingLevel}` as "h3"

  const rows = (group: ListGroup<Item>) =>
    group.items.map((item) => <React.Fragment key={getItemKey(item)}>{renderItem(item, group)}</React.Fragment>)

  if (groups.length === 0) return <>{empty ?? null}</>

  return (
    <div data-slot="grouped-list" className={cn("flex min-w-0 flex-col", className)} {...props}>
      {groups.map((group) =>
        group.key === ALL_GROUP_KEY ? (
          <ul key={group.key} role="list" className={listClass}>
            {rows(group)}
          </ul>
        ) : (
          <Collapsible key={group.key} data-slot="grouped-list-group" open={!collapsed.includes(group.key)} onOpenChange={() => onToggleGroup(group.key)}>
            <Heading className="m-0 text-sm font-medium">
              <CollapsibleTrigger
                data-slot="grouped-list-header"
                className="group/header flex h-11 w-full touch-manipulation items-center gap-2 border-b border-border bg-muted/40 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open/header:rotate-90 motion-reduce:transition-none"
                />
                <span data-slot="grouped-list-label" className="min-w-0 flex-1 truncate">
                  {group.label}
                </span>
                <span data-slot="grouped-list-count" className="shrink-0 text-muted-foreground tabular-nums">
                  {group.items.length}
                </span>
              </CollapsibleTrigger>
            </Heading>
            <CollapsibleContent>
              <ul role="list" className={listClass}>
                {rows(group)}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ),
      )}
    </div>
  )
}

type DisplayMenuLabels = {
  /** The trigger button and the menu's title. */
  display: string
  groupBy: string
  /** The Group by choice that turns grouping off. */
  noGrouping: string
  /** The properties' legend. */
  properties: string
  reset: string
}

const DEFAULT_LABELS: DisplayMenuLabels = {
  display: "Display",
  groupBy: "Group by",
  noGrouping: "No grouping",
  properties: "Properties",
  reset: "Reset",
}

type DisplayMenuProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** The groupings to offer: `ListGrouping`s, or just `{ id, label }`. */
  groupings: readonly { id: string; label: string }[]
  /** The row properties that can be turned on and off. */
  properties: readonly DisplayProperty[]
  settings: DisplaySettings
  /** A grouping was chosen, or null for no grouping. */
  onGroupByChange: (groupBy: string | null) => void
  onPropertyChange: (id: string, visible: boolean) => void
  /** Adds a Reset button that calls this. */
  onReset?: () => void
  /** Every visible and spoken string, for an app not in English. */
  labels?: Partial<DisplayMenuLabels>
}

/**
 * A Display button that opens the choices for a view: what to group by and which row properties show.
 * The grouping is a native select, the properties are a checklist, and every touch target is 44px.
 */
function DisplayMenu({ groupings, properties, settings, onGroupByChange, onPropertyChange, onReset, labels: labelOverrides, className, ...props }: DisplayMenuProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const selectId = React.useId()

  return (
    <div data-slot="display-menu" className={cn("flex min-w-0", className)} {...props}>
      <Popover>
        <PopoverTrigger render={<Button variant="outline" className="pointer-coarse:h-11" />}>
          <SlidersHorizontalIcon aria-hidden="true" data-icon="inline-start" />
          {labels.display}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 max-w-[calc(100vw-1rem)] gap-3 p-3">
          <PopoverHeader>
            <PopoverTitle>{labels.display}</PopoverTitle>
          </PopoverHeader>
          {groupings.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={selectId} className="text-xs font-medium text-muted-foreground pointer-coarse:text-sm">
                {labels.groupBy}
              </label>
              <NativeSelect
                id={selectId}
                value={settings.groupBy ?? ""}
                onChange={(event) => onGroupByChange(event.target.value === "" ? null : event.target.value)}
                className="w-full max-w-full [&_select]:pointer-coarse:h-11 [&_select]:pointer-coarse:text-base"
              >
                <NativeSelectOption value="">{labels.noGrouping}</NativeSelectOption>
                {groupings.map((grouping) => (
                  <NativeSelectOption key={grouping.id} value={grouping.id}>
                    {grouping.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          {properties.length > 0 ? (
            <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
              <legend className="mb-1 text-xs font-medium text-muted-foreground pointer-coarse:text-sm">{labels.properties}</legend>
              {properties.map((property) => (
                <label
                  key={property.id}
                  className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted pointer-coarse:min-h-11 pointer-coarse:text-base"
                >
                  <Checkbox
                    checked={settings.properties[property.id] === true}
                    onCheckedChange={(checked) => onPropertyChange(property.id, checked)}
                  />
                  <span className="min-w-0 truncate">{property.label}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {onReset ? (
            <Button variant="ghost" onClick={onReset} className="w-fit pointer-coarse:h-11">
              {labels.reset}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { DisplayMenu, GroupedList }
export type { DisplayMenuLabels, DisplayMenuProps, GroupedListProps }
