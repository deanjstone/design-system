import { createRoot } from "react-dom/client"

import "./index.css"
import "./proposed.css"
import { Current } from "./current"
import { Proposed } from "./proposed"

// ?v=proposed draws the rebuild, anything else the current registry components. ?theme=dark is the dark mode.
const params = new URLSearchParams(window.location.search)
document.documentElement.classList.toggle("dark", params.get("theme") === "dark")

createRoot(document.getElementById("root")!).render(params.get("v") === "proposed" ? <Proposed /> : <Current />)
