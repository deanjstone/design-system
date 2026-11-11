import * as React from "react"
import { ChevronDownIcon, CircleCheckIcon, CircleDashedIcon, CircleDotIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react"

import { DESCRIPTION, ISSUES, PRIORITY_LABEL, REPOS, STATUS_LABEL, STATUS_ORDER, type Issue } from "./data"

// The same screen rebuilt on the proposed scale: plain elements and the hd-* classes in proposed.css,
// which takes space, type and density from the tokens declared at its top and colour from the theme.
// No registry component is used or changed.

const STATUS_ICON = { todo: CircleDashedIcon, working: CircleDotIcon, done: CircleCheckIcon }

function Row({ issue }: { issue: Issue }) {
  const StatusIcon = STATUS_ICON[issue.status]
  const due = issue.due ? `${issue.overdue ? "Overdue" : "Due"} ${issue.due}` : ""
  return (
    <li className="hd-row" data-status={issue.status}>
      <StatusIcon className="hd-row-status" aria-label={`Status: ${STATUS_LABEL[issue.status].toLowerCase()}`} />
      <a className="hd-row-title" href={`#${issue.id}`}>
        {issue.title}
      </a>
      <span className="hd-row-meta">
        <span className="hd-row-id">{issue.id}</span>
        <span className="hd-row-labels">{issue.labels.join(", ")}</span>
        <span className="hd-row-wave">{issue.wave}</span>
        <span className="hd-row-priority" data-strong={issue.priority === "urgent" || undefined}>
          {PRIORITY_LABEL[issue.priority]}
        </span>
        <span className="hd-row-due" data-strong={issue.overdue || undefined}>
          {due}
        </span>
        <span className="hd-row-assignee">
          <span className="sr-only">Assigned to </span>
          {issue.assignee}
        </span>
      </span>
    </li>
  )
}

function Group({ status }: { status: Issue["status"] }) {
  const [open, setOpen] = React.useState(true)
  const issues = ISSUES.filter((issue) => issue.status === status)
  const panelId = `hd-group-${status}`
  return (
    <section className="hd-group">
      <h2 className="hd-group-heading">
        <button type="button" className="hd-group-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
          <ChevronDownIcon className="hd-icon hd-group-chevron" aria-hidden="true" />
          <span>{STATUS_LABEL[status]}</span>
          <span className="hd-group-count">{issues.length}</span>
        </button>
      </h2>
      <ul id={panelId} className="hd-rows" role="list" hidden={!open}>
        {issues.map((issue) => (
          <Row key={issue.id} issue={issue} />
        ))}
      </ul>
    </section>
  )
}

export function Proposed() {
  return (
    <main className="hd">
      <header className="hd-header">
        <div className="hd-header-text">
          <h1 className="hd-title">Issues</h1>
          <p className="hd-description">{DESCRIPTION}</p>
        </div>
        <div className="hd-actions">
          <button type="button" className="hd-button">
            <SlidersHorizontalIcon className="hd-icon" aria-hidden="true" />
            Display
          </button>
          <button type="button" className="hd-button" data-variant="primary">
            <PlusIcon className="hd-icon" aria-hidden="true" />
            New issue
          </button>
        </div>
      </header>
      <div className="hd-body">
        <div className="hd-main">
          <div className="hd-toolbar">
            <input className="hd-input hd-toolbar-search" type="search" placeholder="Search issues" aria-label="Search issues" />
            <select className="hd-input hd-toolbar-repo" aria-label="Repo" defaultValue="all">
              <option value="all">All repos</option>
              {REPOS.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
            <span className="hd-toolbar-count">{ISSUES.length} issues</span>
          </div>
          <div className="hd-list">
            {STATUS_ORDER.map((status) => (
              <Group key={status} status={status} />
            ))}
          </div>
        </div>
        <form className="hd-rail" onSubmit={(event) => event.preventDefault()}>
          <div className="hd-rail-heading">
            <h2 className="hd-section-title">Quick add</h2>
            <p className="hd-description">File an issue without leaving the list.</p>
          </div>
          <label className="hd-field">
            <span className="hd-label">Title</span>
            <input className="hd-input" placeholder="What needs doing" />
          </label>
          <label className="hd-field">
            <span className="hd-label">Repo</span>
            <select className="hd-input" defaultValue={REPOS[0]}>
              {REPOS.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          </label>
          <label className="hd-field">
            <span className="hd-label">Notes</span>
            <textarea className="hd-input" rows={3} />
            <span className="hd-hint">Markdown is kept as written.</span>
          </label>
          <div className="hd-actions">
            <button type="submit" className="hd-button" data-variant="primary">
              Add issue
            </button>
            <button type="reset" className="hd-button" data-variant="quiet">
              Clear
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
