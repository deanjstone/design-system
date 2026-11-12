import { ActivityIcon, BellIcon, CircleCheckIcon, CircleXIcon, HistoryIcon, SettingsIcon, TriangleAlertIcon } from "lucide-react"

import { ATTENTION, HEALTHY, type AttentionService, type AttentionState, type HealthyService } from "./data"
import { Shell, type ShellTab } from "./shell"

// The service health board: services that need attention first, each with its state as an icon and a word,
// then the healthy services in compact rows.

const TABS: ShellTab[] = [
  { label: "Status", icon: ActivityIcon, current: true },
  { label: "History", icon: HistoryIcon },
  { label: "Alerts", icon: BellIcon },
  { label: "Settings", icon: SettingsIcon },
]

const STATE_ICON = { down: CircleXIcon, degraded: TriangleAlertIcon } as const
const STATE_WORD: Record<AttentionState, string> = { down: "Down", degraded: "Degraded" }

function AttentionRow({ service }: { service: AttentionService }) {
  const StateIcon = STATE_ICON[service.state]
  return (
    <li className="pu-state-row">
      <div className="pu-state-head" data-state={service.state}>
        <StateIcon className="pu-icon pu-state-icon" aria-hidden="true" />
        <span className="pu-state-word">{STATE_WORD[service.state]}</span>
        <span className="pu-strong">{service.name}</span>
      </div>
      <p className="pu-meta">{service.detail}</p>
    </li>
  )
}

function HealthyRow({ service }: { service: HealthyService }) {
  return (
    <li className="pu-healthy-row">
      <CircleCheckIcon className="pu-icon pu-health-icon" role="img" aria-label="Healthy" />
      <span className="pu-healthy-name">{service.name}</span>
      <span className="pu-meta">{service.detail}</span>
    </li>
  )
}

export function Status() {
  return (
    <Shell title="Watchtower" tabs={TABS}>
      <p className="pu-summary">
        <span className="pu-strong">{`${ATTENTION.length} need attention`}</span>
        {` · ${HEALTHY.length} healthy`}
      </p>
      <section className="pu-section">
        <h2 className="pu-heading">
          Needs attention <span className="pu-count">{ATTENTION.length}</span>
        </h2>
        <ul role="list" className="pu-rows">
          {ATTENTION.map((service) => (
            <AttentionRow key={service.name} service={service} />
          ))}
        </ul>
      </section>
      <section className="pu-section">
        <h2 className="pu-heading">
          Healthy <span className="pu-count">{HEALTHY.length}</span>
        </h2>
        <ul role="list" className="pu-rows">
          {HEALTHY.map((service) => (
            <HealthyRow key={service.name} service={service} />
          ))}
        </ul>
      </section>
    </Shell>
  )
}
