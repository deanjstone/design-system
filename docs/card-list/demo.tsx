import * as React from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { Badge } from "@/components/ui/badge"
import { CardList, CardListGroup, CardListItem } from "@/components/card-list"

// ?theme=dark switches the page to the dark theme. The screenshots script loads it once per theme.
const params = new URLSearchParams(window.location.search)
document.documentElement.classList.toggle("dark", params.get("theme") === "dark")
// ?view=before draws the same items as the single-row list the cards replace, for the before/after screenshots.
const before = params.get("view") === "before"

const LONG_TITLE =
  "Promote the ops-hub card to the deploy branch once CI on that SHA is green and the owner has approved it on the phone"
const LONG_BRANCH = "feat/1084-grouped-two-row-card-with-a-very-long-branch-name-that-must-not-widen-the-page"

const ROWS = [
  ["argus", "Grouped two-row card pattern", "Working", "feat/188-grouped-two-row-card", "CI running", "2m"],
  ["argus", "Four-bucket dashboard for ops-hub", "Active", "feat/189-dashboard", "CI red", "14m"],
  ["argus", LONG_TITLE, "Settled", LONG_BRANCH, "CI green", "3d"],
  ["homelab", "Rotate the tailscale auth key", "Snoozed", "chore/ts-key", "CI green", "1w"],
] as const

function BeforeDemo() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 p-4">
      <h1 className="text-lg font-semibold">Single-row list (before)</h1>
      <ul className="m-0 list-none divide-y p-0">
        {ROWS.map(([repo, title, status, branch, check, time]) => (
          <li key={title} className="flex items-center gap-2 py-2 text-sm">
            <span className="shrink-0 font-medium">{repo}</span>
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{`${status} ${branch} ${check} ${time}`}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}

function Demo() {
  const [selected, setSelected] = React.useState("a2")
  const pick = (id: string) => ({ active: selected === id, onClick: () => setSelected(id) })

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 p-4">
      <h1 className="text-lg font-semibold">Card list</h1>
      <CardList>
        <CardListGroup heading="argus" count={4}>
          <CardListItem
            title="Grouped two-row card pattern"
            status={<Badge variant="warning">Working</Badge>}
            branch="feat/188-grouped-two-row-card"
            check="CI running"
            time="2m"
            render={<button type="button" />}
            {...pick("a1")}
          />
          <CardListItem
            title="Four-bucket dashboard for ops-hub"
            status={<Badge variant="critical">Active</Badge>}
            branch="feat/189-dashboard"
            check="CI red"
            time="14m"
            render={<button type="button" />}
            {...pick("a2")}
          />
          <CardListItem
            title={LONG_TITLE}
            status={<Badge variant="success">Settled</Badge>}
            branch={LONG_BRANCH}
            check="CI green"
            time="3d"
            render={<button type="button" />}
            {...pick("a3")}
          />
          <CardListItem title="A card with only a title" render={<button type="button" />} {...pick("a4")} />
        </CardListGroup>
        <CardListGroup heading="homelab" count={2}>
          <CardListItem
            title="Rotate the tailscale auth key"
            status={<Badge variant="secondary">Snoozed</Badge>}
            branch="chore/ts-key"
            check="CI green"
            time="1w"
            render={<a href="#homelab-1" />}
          />
          <CardListItem
            title="Restore the nightly backup timer"
            status={<Badge variant="warning">Working</Badge>}
            branch="fix/backup-timer"
            time="now"
            render={<a href="#homelab-2" />}
          />
        </CardListGroup>
        <CardListGroup heading="quick-capture" count={0} />
      </CardList>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(before ? <BeforeDemo /> : <Demo />)
