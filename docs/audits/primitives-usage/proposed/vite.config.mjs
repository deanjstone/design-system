import { fileURLToPath } from "node:url"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Builds the proposed screens for the primitives usage audit (docs/audits/primitives-usage/proposed).
// A screenshot run builds it and serves the output for the length of the run; nothing here runs a dev server.
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../../../..")

const fillPaths = {
  name: "primitives-usage-proposed-paths",
  enforce: "pre",
  transform: (code, id) =>
    id.endsWith("index.css") ? code.replaceAll("__THEME__", path.join(repo, "theme/tokens.css")) : null,
}

export default defineConfig({
  root: here,
  base: "/",
  plugins: [fillPaths, react(), tailwindcss()],
  server: { fs: { strict: false } },
  build: {
    outDir:
      process.env.PRIMITIVES_USAGE_PROPOSED_OUT ??
      path.join(repo, "node_modules/.cache/primitives-usage-proposed/dist"),
    emptyOutDir: true,
  },
  logLevel: "warn",
})
