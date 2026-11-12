import { CircleDotIcon, EllipsisIcon, GitPullRequestIcon, HouseIcon, MessageSquareIcon, WavesIcon } from "lucide-react"

import { ISSUE_META, ISSUE_PARAGRAPHS, ISSUE_POINTS, ISSUE_TITLE } from "./data"
import { Shell, type ShellTab } from "./shell"

// The issue page: the title and state, then the body text, then the triage controls folded away in a disclosure.

const TABS: ShellTab[] = [
  { label: "Home", icon: HouseIcon, current: true },
  { label: "Waves", icon: WavesIcon },
  { label: "Pull requests", icon: GitPullRequestIcon },
  { label: "More", icon: EllipsisIcon },
]

const WAVES = ["W1", "W2", "W3", "Later", "Held"]
const MODES = ["AFK", "HITL"]

function Segments({ label, options, pressed }: { label: string; options: string[]; pressed: string }) {
  return (
    <div className="pu-field">
      <span className="pu-strong">{label}</span>
      <div role="group" aria-label={label} className="pu-segments">
        {options.map((option) => (
          <button key={option} type="button" className="pu-segment" aria-pressed={option === pressed}>
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Detail() {
  return (
    <Shell title="design-system/207" tabs={TABS} back action={{ label: "Comment", icon: MessageSquareIcon }}>
      <section className="pu-issue">
        <h2 className="pu-heading-lg">{ISSUE_TITLE}</h2>
        <p className="pu-state-line">
          <CircleDotIcon className="pu-icon pu-state-icon-warning" aria-hidden="true" />
          <span className="pu-strong">In progress</span>
          <span className="pu-muted">{` · ${ISSUE_META}`}</span>
        </p>
        <div className="pu-prose">
          {ISSUE_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph.slice(0, 32)}>{paragraph}</p>
          ))}
          <ul className="pu-points">
            {ISSUE_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <details className="pu-disclosure">
          <summary className="pu-disclosure-summary">Triage</summary>
          <div className="pu-triage">
            <Segments label="Wave" options={WAVES} pressed="W1" />
            <Segments label="Mode" options={MODES} pressed="AFK" />
          </div>
        </details>
      </section>
    </Shell>
  )
}
