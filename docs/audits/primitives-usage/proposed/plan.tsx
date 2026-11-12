import { CheckIcon, EllipsisIcon, HouseIcon, ListChecksIcon, WorkflowIcon } from "lucide-react"

import { DONE_STEPS, NEXT_STEP, PLAN_DONE, PLAN_TOTAL, TODO_STEPS } from "./data"
import { Shell, type ShellTab } from "./shell"

// The checklist: overall progress, the next step in full, the remaining steps as checkboxes, and the finished steps.

const TABS: ShellTab[] = [
  { label: "Home", icon: HouseIcon },
  { label: "Plans", icon: ListChecksIcon, current: true },
  { label: "Workflows", icon: WorkflowIcon },
  { label: "More", icon: EllipsisIcon },
]

export function Plan() {
  return (
    <Shell title="Audit follow-ups" tabs={TABS} back action={{ label: "Mark next step done", icon: CheckIcon }}>
      <div className="pu-progress-block">
        <p className="pu-progress-line">
          <span className="pu-strong">{`${PLAN_DONE} of ${PLAN_TOTAL} steps done`}</span>
        </p>
        <progress className="pu-progress" max={PLAN_TOTAL} value={PLAN_DONE} aria-label="Steps done" />
      </div>
      <section className="pu-section">
        <h2 className="pu-heading">Next</h2>
        <div className="pu-task pu-task-next">
          <input id={`step-${NEXT_STEP.id}`} type="checkbox" className="pu-checkbox" />
          <label htmlFor={`step-${NEXT_STEP.id}`} className="pu-task-title pu-strong">
            {NEXT_STEP.title}
          </label>
          <p className="pu-task-note">{NEXT_STEP.description}</p>
        </div>
      </section>
      <section className="pu-section">
        <h2 className="pu-heading">
          To do <span className="pu-count">{TODO_STEPS.length}</span>
        </h2>
        <ul role="list" className="pu-rows">
          {TODO_STEPS.map((step) => (
            <li key={step.id} className="pu-task">
              <input id={`step-${step.id}`} type="checkbox" className="pu-checkbox" />
              <label htmlFor={`step-${step.id}`} className="pu-task-title">
                {step.title}
              </label>
            </li>
          ))}
        </ul>
      </section>
      <section className="pu-section">
        <h2 className="pu-heading">
          Done <span className="pu-count">{DONE_STEPS.length}</span>
        </h2>
        <ul role="list" className="pu-rows">
          {DONE_STEPS.map((step) => (
            <li key={step.id} className="pu-done-item">
              <CheckIcon className="pu-icon" aria-hidden="true" />
              <span>{step.title}</span>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  )
}
