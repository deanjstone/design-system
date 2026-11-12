// The fixture data for the five proposed screens. Every screen reads its text from here, so the copy can change in one place.

export type Article = {
  id: string
  title: string
  source: string
  readMinutes: number
  saved: boolean
}

export type AttentionState = "down" | "degraded"

export type AttentionService = {
  name: string
  state: AttentionState
  detail: string
}

export type HealthyService = {
  name: string
  detail: string
}

export type Step = {
  id: string
  title: string
}

export type NextStep = Step & {
  description: string
}

export const ARTICLES: Article[] = [
  { id: "a1", title: "Why the smallest browser engines are back in fashion for embedded dashboards", source: "Northwind Journal", readMinutes: 9, saved: true },
  { id: "a2", title: "A practical guide to writing SQL migrations that survive a rollback", source: "Tidewater Notes", readMinutes: 7, saved: false },
  { id: "a3", title: "Notes on running a home server without a permanent public address", source: "Harbour Blog", readMinutes: 12, saved: true },
  { id: "a4", title: "Designing for thumbs: what the tap target research actually says", source: "Field Manual", readMinutes: 5, saved: true },
  { id: "a5", title: "Sizing type by the pointer, not just the screen width", source: "Grid and Ink", readMinutes: 8, saved: false },
  { id: "a6", title: "Keeping a reading list small enough to finish", source: "Quiet Desk", readMinutes: 4, saved: true },
  { id: "a7", title: "The case for boring cron jobs in small teams", source: "Northwind Journal", readMinutes: 6, saved: false },
  { id: "a8", title: "How a tidal grid model predicts port congestion before the ships arrive", source: "Harbour Blog", readMinutes: 11, saved: false },
]

export const ATTENTION: AttentionService[] = [
  { name: "Argus API", state: "down", detail: "Latest deployment failed · 6 min ago" },
  { name: "Sparky sync", state: "degraded", detail: "Sync lag above 5 min · 12 min ago" },
]

export const HEALTHY: HealthyService[] = [
  { name: "ops-hub", detail: "All checks passing" },
  { name: "Homelab DNS", detail: "Resolving in 14 ms" },
  { name: "Tailscale", detail: "3 devices online" },
  { name: "Quick capture", detail: "All checks passing" },
  { name: "Atto1", detail: "Responding in 120 ms" },
  { name: "Budget", detail: "Last sync 1 h ago" },
  { name: "Jobs", detail: "All checks passing" },
  { name: "Briefings", detail: "Last run this morning" },
  { name: "Scan app", detail: "All checks passing" },
]

export const ISSUE_TITLE = "Adopt the audit's type, spacing and density scale as opt-in registry items"
export const ISSUE_META = "opened by deanjstone · 5 days ago"

export const ISSUE_PARAGRAPHS: string[] = [
  "This proposal adds the audit's type, spacing and density scale to the registry as opt-in items. Nothing changes for a consumer who does not take them: the current components keep their values, and the new scale sits beside them under its own names.",
  "The audit found that the same screen reads differently at each width because the registry sets its sizes per component. A list row, a button and a form field each pick their own padding and line height, so a phone gets the desktop density and a touch screen gets targets too small to tap. The scale replaces those choices with seven spacing steps, five type sizes and one density value that the pointer sets.",
  "The sample in this audit shows the result on five screens: a reading list, a status board, an issue page, a checklist and an empty state. Each uses the same shell and the same tokens, and each keeps its tap targets at 44 pixels on a coarse pointer. Colour is not part of the proposal. Every colour is a token the theme already defines, so each screen follows light and dark mode as they are today.",
  "Adopting the scale is a choice per component. A team can take the tokens first, move one screen at a time, and leave the registry defaults in place until a screen has been checked on a phone.",
]

export const ISSUE_POINTS: string[] = [
  "Add the scale as a separate token block, scoped to the new root class.",
  "Pair each opt-in component with a screenshot at phone and desktop width.",
  "Revisit the registry defaults once two or more screens use the scale.",
]

export const NEXT_STEP: NextStep = {
  id: "next",
  title: "Compare the registry buttons at phone width",
  description:
    "Render the registry button and the proposed button side by side at 360 pixels. Note which one wraps its label and which one keeps its height.",
}

export const TODO_STEPS: Step[] = [
  { id: "todo-1", title: "Measure row heights on a coarse pointer" },
  { id: "todo-2", title: "Record the tap target of each segmented control" },
  { id: "todo-3", title: "Confirm the focus ring on the triage disclosure" },
  { id: "todo-4", title: "Write the scale into the token block" },
  { id: "todo-5", title: "Check dark mode on the five screens" },
  { id: "todo-6", title: "File the follow-ups that remain as issues" },
]

export const DONE_STEPS: Step[] = [
  { id: "done-1", title: "Capture the current screens at phone width" },
  { id: "done-2", title: "Count the raw lengths in the registry" },
  { id: "done-3", title: "Group the findings by component" },
  { id: "done-4", title: "Draft the proposed scale" },
  { id: "done-5", title: "Review the scorecard with the owner" },
]

export const PLAN_DONE = DONE_STEPS.length
export const PLAN_TOTAL = 1 + TODO_STEPS.length + DONE_STEPS.length
