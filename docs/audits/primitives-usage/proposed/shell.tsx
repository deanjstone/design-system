import * as React from "react"
import { ArrowLeftIcon, type LucideIcon } from "lucide-react"

// The frame every screen shares: a sticky title bar with the page's only h1, the content, and the bottom bars
// (a sidebar and an inline action button on wide screens).

export type ShellTab = { label: string; icon: LucideIcon; current?: boolean }
export type ShellAction = { label: string; icon: LucideIcon }

export type ShellProps = {
  title: string
  tabs: ShellTab[]
  action?: ShellAction
  back?: boolean
  children: React.ReactNode
}

export function Shell({ title, tabs, action, back = false, children }: ShellProps) {
  const ActionIcon = action?.icon
  return (
    <div className="pu">
      <header className="pu-topbar">
        {back ? (
          <button type="button" className="pu-icon-button" aria-label="Back">
            <ArrowLeftIcon className="pu-icon" aria-hidden="true" />
          </button>
        ) : null}
        <h1 className="pu-title">{title}</h1>
      </header>
      <main className="pu-main">{children}</main>
      <div className="pu-dock">
        {action && ActionIcon ? (
          <div className="pu-action">
            <button type="button" className="pu-primary">
              <ActionIcon className="pu-icon" aria-hidden="true" />
              {action.label}
            </button>
          </div>
        ) : null}
        <nav className="pu-tabs" aria-label="Sections">
          <ul role="list" className="pu-tab-list">
            {tabs.map((tab) => {
              const TabIcon = tab.icon
              return (
                <li key={tab.label}>
                  <a className="pu-tab" href="#" aria-current={tab.current ? "page" : undefined}>
                    <TabIcon className="pu-icon" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </div>
  )
}
