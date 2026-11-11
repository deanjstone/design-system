// The one data set both versions of the sample draw, so the comparison is of the design and nothing else.
export type Issue = {
  id: string
  title: string
  status: "todo" | "working" | "done"
  priority: "urgent" | "high" | "medium" | "low"
  wave: string
  repo: string
  labels: string[]
  due?: string
  /** The due date has passed and the issue is not done. */
  overdue?: boolean
  assignee: string
}

export const ISSUES: Issue[] = [
  { id: "DS-194", title: "Grouped, collapsible lists with display toggles", status: "working", priority: "medium", wave: "Wave 1", repo: "design-system", labels: ["design", "mode:afk"], due: "Nov 14", assignee: "AQ" },
  { id: "homelab-12", title: "Approve the deploy card on the phone", status: "working", priority: "high", wave: "Wave 1", repo: "homelab", labels: ["ops", "mode:hitl"], due: "Nov 9", overdue: true, assignee: "DS" },
  {
    id: "argus-1084",
    title: "Promote the ops-hub card to the deploy branch once CI on that SHA is green and the owner has approved it on the phone",
    status: "todo",
    priority: "urgent",
    wave: "Wave 2",
    repo: "argus",
    labels: ["ops-hub", "needs:owner", "wayfinder"],
    due: "Nov 30",
    assignee: "AQ",
  },
  { id: "argus-1100", title: "Show the PR queue as a grouped list", status: "todo", priority: "medium", wave: "Wave 2", repo: "argus", labels: ["ops-hub"], assignee: "DS" },
  { id: "argus-1101", title: "A row with no wave and no labels", status: "todo", priority: "low", wave: "", repo: "argus", labels: [], assignee: "AQ" },
  { id: "homelab-9", title: "Rotate the tailscale auth key", status: "todo", priority: "low", wave: "Later", repo: "homelab", labels: ["ops", "mode:hitl"], assignee: "DS" },
  { id: "DS-192", title: "Dense issue and PR list row", status: "done", priority: "high", wave: "Wave 1", repo: "design-system", labels: ["design", "mode:afk"], due: "Nov 12", assignee: "DS" },
  { id: "DS-193", title: "Filter builder with shareable URL state", status: "done", priority: "high", wave: "Wave 1", repo: "design-system", labels: ["design", "mode:afk"], assignee: "DS" },
]

export const STATUS_ORDER = ["working", "todo", "done"] as const
export const STATUS_LABEL = { todo: "To do", working: "Working", done: "Done" } as const
export const PRIORITY_LABEL = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" } as const
export const REPOS = ["design-system", "argus", "homelab"]
export const DESCRIPTION = "Open work across design-system, argus and homelab."
