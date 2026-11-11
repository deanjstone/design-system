import { createRoot } from "react-dom/client"

import "./index.css"
import "./proposed.css"
import { Current } from "./current"
import { Proposed } from "./proposed"

// ?v=proposed draws the rebuild, anything else the current registry components. ?theme=dark is the dark
// mode, and ?palette=grove (or any theme name) sets data-theme; with none the page is Ocean, the default.
const params = new URLSearchParams(window.location.search)
document.documentElement.classList.toggle("dark", params.get("theme") === "dark")
const palette = params.get("palette")
if (palette) document.documentElement.dataset.theme = palette

createRoot(document.getElementById("root")!).render(params.get("v") === "proposed" ? <Proposed /> : <Current />)
