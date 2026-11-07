import * as React from "react"
import { createRoot } from "react-dom/client"
import { CircleCheckIcon, CircleDashedIcon, CircleDotIcon, SignalHighIcon, SignalLowIcon, SignalMediumIcon, TriangleAlertIcon } from "lucide-react"

import "./index.css"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { IssueRow, IssueRowList } from "@/components/issue-row"

// ?theme=dark switches the page to the dark theme. The screenshots script loads it once per theme.
const params = new URLSearchParams(window.location.search)
document.documentElement.classList.toggle("dark", params.get("theme") === "dark")

const LONG_TITLE =
  "Promote the ops-hub card to the deploy branch once CI on that SHA is green and the owner has approved it on the phone"

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

const person = (initials: string, name: string) => (
  <Avatar size="sm" aria-label={`Assigned to ${name}`} role="img">
    <AvatarFallback>{initials}</AvatarFallback>
  </Avatar>
)

const labels = (...names: string[]) =>
  names.map((name) => (
    <Badge key={name} variant="outline">
      {name}
    </Badge>
  ))

function Demo() {
  const [log, setLog] = React.useState("none")
  const act = (what: string) => () => setLog(what)
  const actions = (id: string) => [
    { id: "assign", label: "Assign to me", onSelect: act(`${id}: assign`) },
    { id: "wave", label: "Move to the next wave", onSelect: act(`${id}: wave`) },
    { id: "close", label: "Close", onSelect: act(`${id}: close`), destructive: true },
  ]

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 py-4">
      <h1 className="px-3 text-lg font-semibold">Issue row</h1>
      <p className="px-3 text-sm text-muted-foreground">
        Last action: <output data-testid="log">{log}</output>
      </p>
      <IssueRowList aria-label="Open issues">
        <IssueRow
          title="Dense issue and PR list row"
          href="#issue-192"
          priority={PRIORITY.high}
          identifier="DS-192"
          status={STATUS.working}
          labels={labels("design", "mode:afk")}
          project="Wave 1"
          dueDate="Due Nov 12"
          assignee={person("DS", "Dean Stone")}
          actions={actions("DS-192")}
        />
        <IssueRow
          title={LONG_TITLE}
          href="#issue-1084"
          priority={PRIORITY.urgent}
          identifier="argus-1084"
          status={STATUS.todo}
          labels={labels("ops-hub", "needs:owner", "wayfinder")}
          project="Promotion cards and the long wave name"
          dueDate="Due Nov 30"
          assignee={person("AQ", "Aquila")}
          actions={actions("argus-1084")}
        />
        <IssueRow
          title="A row with only a title and priority"
          href="#issue-7"
          priority={PRIORITY.low}
          actions={actions("DS-7")}
        />
        <IssueRow
          title="Rotate the tailscale auth key"
          href="#issue-9"
          priority={PRIORITY.medium}
          identifier="homelab-9"
          status={STATUS.done}
          project="Later"
          assignee={person("DS", "Dean Stone")}
          actions={actions("homelab-9")}
        />
        <IssueRow title="A read-only row, no actions" href="#issue-3" identifier="DS-3" status={STATUS.done} />
      </IssueRowList>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<Demo />)
