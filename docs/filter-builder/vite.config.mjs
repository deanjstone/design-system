import { fileURLToPath } from "node:url"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Builds the filter-builder demo page. docs/filter-builder/screenshots.mjs builds it and serves the output
// for the length of the run; nothing here runs a dev server.
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const registry = path.join(repo, "registry")

const fillPaths = {
  name: "filter-builder-demo-paths",
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
      { find: "@/lib", replacement: path.join(registry, "lib") },
      { find: "@/hooks", replacement: path.join(registry, "base-nova/hooks") },
      { find: "@/components/ui", replacement: path.join(registry, "base-nova/ui") },
      { find: "@/components", replacement: path.join(registry, "base-nova/blocks") },
    ],
  },
  server: { fs: { strict: false } },
  build: {
    outDir: process.env.FILTER_BUILDER_OUT ?? path.join(repo, "node_modules/.cache/filter-builder-demo/dist"),
    emptyOutDir: true,
  },
  logLevel: "warn",
})
