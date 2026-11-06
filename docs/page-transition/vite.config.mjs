import { fileURLToPath } from "node:url"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Builds the page-transition demo page. docs/page-transition/serve.mjs and smoke-check.mjs build it
// and serve the output for the length of the run; nothing here runs a dev server.
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const registry = path.join(repo, "registry")

const fillPaths = {
  name: "page-transition-demo-paths",
  enforce: "pre",
  transform: (code, id) =>
    id.endsWith("index.css")
      ? code.replaceAll("__REGISTRY__", registry).replaceAll("__THEME__", path.join(repo, "theme/tokens.css"))
      : null,
}

export default defineConfig({
  root: here,
  base: "/",
  plugins: [fillPaths, react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/lib/utils", replacement: path.join(registry, "lib/utils.ts") },
      { find: "@/lib/page-transition-core", replacement: path.join(registry, "lib/page-transition-core.ts") },
      { find: "@/components/ui", replacement: path.join(registry, "base-nova/ui") },
    ],
  },
  server: { fs: { strict: false } },
  build: {
    outDir: process.env.PAGE_TRANSITION_OUT ?? path.join(repo, "node_modules/.cache/page-transition-demo/dist"),
    emptyOutDir: true,
  },
  logLevel: "warn",
})
