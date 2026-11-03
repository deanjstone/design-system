import { fileURLToPath } from "node:url"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Builds the layout and display demo page. docs/layout/smoke-check.mjs builds it,
// serves the output for one headless tab and tears it down; nothing here runs a dev server.
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const registry = path.join(repo, "registry")

const fillPaths = {
  name: "layout-demo-paths",
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
      { find: "@/components/ui", replacement: path.join(registry, "base-nova/ui") },
    ],
  },
  server: { fs: { strict: false } },
  build: {
    outDir: process.env.LAYOUT_OUT ?? path.join(repo, "node_modules/.cache/layout-demo/dist"),
    emptyOutDir: true,
  },
  logLevel: "warn",
})
