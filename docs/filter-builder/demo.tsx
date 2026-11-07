import * as React from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { FilterBuilder } from "@/components/filter-builder"
import { useFilterState } from "@/hooks/use-filter-state"
import { applyFilters, type FilterField } from "@/lib/filter-core"

// ?theme=dark switches the page to the dark theme. The screenshots script loads it once per theme.
const params = new URLSearchParams(window.location.search)
document.documentElement.classList.toggle("dark", params.get("theme") === "dark")

type Issue = { id: string; title: string; label: string; wave: string; modes: string[]; points: number }

const ISSUES: Issue[] = [
  { id: "DS-1", title: "Fix the promotion card", label: "bug", wave: "w1", modes: ["afk"], points: 3 },
  { id: "DS-2", title: "Dense issue and PR list row", label: "design", wave: "w1", modes: ["afk"], points: 5 },
  { id: "DS-3", title: "Filter builder with shareable URL state", label: "design", wave: "w1", modes: ["afk"], points: 8 },
  { id: "DS-4", title: "Rotate the tailscale auth key", label: "ops", wave: "later", modes: ["hitl"], points: 1 },
  { id: "DS-5", title: "Approve the deploy card on the phone", label: "ops", wave: "w1", modes: ["hitl"], points: 2 },
  { id: "DS-6", title: "Owner decision on the theme tokens", label: "design", wave: "w2", modes: ["hitl"], points: 3 },
  { id: "DS-7", title: "Retry the geometry gate screenshot", label: "bug", wave: "w2", modes: ["afk"], points: 2 },
  { id: "DS-8", title: "Backlog triage across every repo", label: "ops", wave: "later", modes: ["afk", "hitl"], points: 13 },
]

const FIELDS: FilterField<Issue>[] = [
  {
    id: "label",
    label: "Label",
    type: "option",
    options: [
      { value: "bug", label: "Bug" },
      { value: "design", label: "Design" },
      { value: "ops", label: "Ops" },
    ],
    accessor: (issue) => issue.label,
  },
  {
    id: "wave",
    label: "Wave",
    type: "option",
    options: [
      { value: "w1", label: "Wave 1" },
      { value: "w2", label: "Wave 2" },
      { value: "later", label: "Later" },
    ],
    accessor: (issue) => issue.wave,
  },
  {
    id: "mode",
    label: "Mode",
    type: "multiOption",
    options: [
      { value: "afk", label: "AFK" },
      { value: "hitl", label: "HITL" },
    ],
    accessor: (issue) => issue.modes,
  },
  { id: "title", label: "Title", type: "text", accessor: (issue) => issue.title },
  { id: "points", label: "Points", type: "number", accessor: (issue) => issue.points },
]

function Demo() {
  const [filters, setFilters] = useFilterState(FIELDS)
  const shown = applyFilters(ISSUES, filters, FIELDS)

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
      <h1 className="text-lg font-semibold">Filter builder</h1>
      <FilterBuilder fields={FIELDS} value={filters} onValueChange={setFilters} />
      <p className="text-sm text-muted-foreground">
        <output data-testid="count">
          {shown.length} of {ISSUES.length}
        </output>{" "}
        issues
      </p>
      <ul data-testid="results" className="m-0 flex list-none flex-col divide-y divide-border p-0">
        {shown.map((issue) => (
          <li key={issue.id} className="flex min-w-0 items-center gap-3 py-2 text-sm">
            <span className="w-12 shrink-0 text-muted-foreground tabular-nums">{issue.id}</span>
            <span className="min-w-0 flex-1 truncate">{issue.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{issue.wave}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<Demo />)
