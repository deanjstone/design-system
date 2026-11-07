import * as React from "react"
import { createRoot } from "react-dom/client"
import { CircleCheckIcon, CircleDashedIcon, CircleDotIcon, SignalHighIcon, SignalLowIcon, SignalMediumIcon, TriangleAlertIcon } from "lucide-react"

import "./index.css"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { DisplayMenu, GroupedList } from "@/components/grouped-list"
import { IssueRow } from "@/components/issue-row"
import { useDisplaySettings } from "@/hooks/use-display-settings"
import { groupItems, pickVisible, type DisplayConfig, type ListGrouping } from "@/lib/list-group-core"

// ?theme=dark switches the page to the dark theme. The screenshots script loads it once per theme.
const params = new URLSearchParams(window.location.search)
document.documentElement.classList.toggle("dark", params.get("theme") === "dark")

type Issue = {
  id: string
  title: string
  status: "todo" | "working" | "done"
  priority: "urgent" | "high" | "medium" | "low"
  wave: string
  repo: string
  labels: string[]
  due?: string
  assignee: string
}

const ISSUES: Issue[] = [
  { id: "DS-192", title: "Dense issue and PR list row", status: "done", priority: "high", wave: "Wave 1", repo: "design-system", labels: ["design", "mode:afk"], due: "Due Nov 12", assignee: "DS" },
  { id: "DS-193", title: "Filter builder with shareable URL state", status: "done", priority: "high", wave: "Wave 1", repo: "design-system", labels: ["design", "mode:afk"], assignee: "DS" },
  { id: "DS-194", title: "Grouped, collapsible lists with display toggles", status: "working", priority: "medium", wave: "Wave 1", repo: "design-system", labels: ["design", "mode:afk"], due: "Due Nov 14", assignee: "AQ" },
  {
    id: "argus-1084",
    title: "Promote the ops-hub card to the deploy branch once CI on that SHA is green and the owner has approved it on the phone",
    status: "todo",
    priority: "urgent",
    wave: "Wave 2",
    repo: "argus",
    labels: ["ops-hub", "needs:owner", "wayfinder"],
    due: "Due Nov 30",
    assignee: "AQ",
  },
  { id: "argus-1100", title: "Show the PR queue as a grouped list", status: "todo", priority: "medium", wave: "Wave 2", repo: "argus", labels: ["ops-hub"], assignee: "DS" },
  { id: "argus-1101", title: "A row with no wave and no labels", status: "todo", priority: "low", wave: "", repo: "argus", labels: [], assignee: "AQ" },
  { id: "homelab-9", title: "Rotate the tailscale auth key", status: "todo", priority: "low", wave: "Later", repo: "homelab", labels: ["ops", "mode:hitl"], assignee: "DS" },
  { id: "homelab-12", title: "Approve the deploy card on the phone", status: "working", priority: "high", wave: "Wave 1", repo: "homelab", labels: ["ops", "mode:hitl"], due: "Due Nov 9", assignee: "DS" },
]

const STATUS_LABEL = { todo: "To do", working: "Working", done: "Done" }

const GROUPINGS: ListGrouping<Issue>[] = [
  { id: "status", label: "Status", keys: (issue) => issue.status, groupLabel: (key) => STATUS_LABEL[key as Issue["status"]], order: ["working", "todo", "done"] },
  { id: "wave", label: "Wave", keys: (issue) => issue.wave, order: ["Wave 1", "Wave 2", "Later"] },
  { id: "repo", label: "Repo", keys: (issue) => issue.repo },
  { id: "label", label: "Label", keys: (issue) => issue.labels },
]

const CONFIG: DisplayConfig = {
  groupings: GROUPINGS.map((grouping) => grouping.id),
  properties: [
    { id: "priority", label: "Priority" },
    { id: "identifier", label: "ID" },
    { id: "status", label: "Status" },
    { id: "labels", label: "Labels" },
    { id: "project", label: "Wave" },
    { id: "dueDate", label: "Due date" },
    { id: "assignee", label: "Assignee" },
  ],
  defaultGroupBy: "status",
}

const PRIORITY = {
  urgent: <TriangleAlertIcon aria-label="Priority: urgent" className="size-4 text-critical" />,
  high: <SignalHighIcon aria-label="Priority: high" className="size-4 text-muted-foreground" />,
  medium: <SignalMediumIcon aria-label="Priority: medium" className="size-4 text-muted-foreground" />,
  low: <SignalLowIcon aria-label="Priority: low" className="size-4 text-muted-foreground" />,
}

const STATUS = {
  todo: <CircleDashedIcon aria-label="Status: to do" className="size-4 text-muted-foreground" />,
  working: <CircleDotIcon aria-label="Status: working" className="size-4 text-warning" />,
  done: <CircleCheckIcon aria-label="Status: done" className="size-4 text-success" />,
}

function Demo() {
  const display = useDisplaySettings("demo", CONFIG)
  const { settings } = display
  const grouping = GROUPINGS.find((candidate) => candidate.id === settings.groupBy) ?? null
  const groups = groupItems(ISSUES, grouping, { noneLabel: grouping ? `No ${grouping.label.toLowerCase()}` : "None" })

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-3 py-4">
      <div className="flex items-center justify-between gap-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
        <h1 className="min-w-0 truncate text-lg font-semibold">Issues</h1>
        <DisplayMenu
          groupings={GROUPINGS}
          properties={CONFIG.properties}
          settings={settings}
          onGroupByChange={display.setGroupBy}
          onPropertyChange={display.setPropertyVisible}
          onReset={display.reset}
        />
      </div>
      <GroupedList
        groups={groups}
        collapsed={grouping ? (settings.collapsed[grouping.id] ?? []) : []}
        onToggleGroup={display.toggleCollapsed}
        getItemKey={(issue) => issue.id}
        renderItem={(issue) => (
          <IssueRow
            title={issue.title}
            href={`#${issue.id}`}
            {...pickVisible(
              {
                priority: PRIORITY[issue.priority],
                identifier: issue.id,
                status: STATUS[issue.status],
                labels: issue.labels.map((name) => (
                  <Badge key={name} variant="outline">
                    {name}
                  </Badge>
                )),
                project: issue.wave || undefined,
                dueDate: issue.due,
                assignee: (
                  <Avatar size="sm" aria-label={`Assigned to ${issue.assignee}`} role="img">
                    <AvatarFallback>{issue.assignee}</AvatarFallback>
                  </Avatar>
                ),
              },
              settings,
            )}
          />
        )}
      />
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<Demo />)
