import { createRoot } from "react-dom/client"

import "./index.css"
import "./proposed.css"
import { Detail } from "./detail"
import { Empty } from "./empty"
import { List } from "./list"
import { Plan } from "./plan"
import { Status } from "./status"

// ?v= picks one of the five screens; anything else, or none, draws the list. Dark mode follows the system setting.
const SCREENS = { list: List, status: Status, detail: Detail, plan: Plan, empty: Empty } as const
type ScreenName = keyof typeof SCREENS

const isScreenName = (value: string | null): value is ScreenName => value !== null && Object.keys(SCREENS).includes(value)

const requested = new URLSearchParams(window.location.search).get("v")
const Screen = SCREENS[isScreenName(requested) ? requested : "list"]

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)")
const applySystemTheme = () => document.documentElement.classList.toggle("dark", darkQuery.matches)
applySystemTheme()
darkQuery.addEventListener("change", applySystemTheme)

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

createRoot(root).render(<Screen />)
