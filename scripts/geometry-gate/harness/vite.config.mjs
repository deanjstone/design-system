import { fileURLToPath } from "node:url"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Builds the harness page that renders the registry blocks. GATE_REGISTRY points
// it at another checkout's registry/ (the gate is proven against a pre-fix
// AppShell that way); the default is this repo's own.
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../../..")
const registry = process.env.GATE_REGISTRY ?? path.join(repo, "registry")
const theme = process.env.GATE_THEME ?? path.join(repo, "theme")

export const harnessAliases = [
  { find: "@/lib/utils", replacement: path.join(registry, "lib/utils.ts") },
  { find: "@/lib/nav-link", replacement: path.join(registry, "lib/nav-link.tsx") },
  { find: "@/lib/theme-preference", replacement: path.join(registry, "lib/theme-preference.ts") },
  { find: "@/lib/link-pill-core", replacement: path.join(registry, "lib/link-pill-core.ts") },
  { find: "@/lib/highlighter", replacement: path.join(registry, "lib/highlighter.tsx") },
  { find: "@/hooks", replacement: path.join(registry, "base-nova/hooks") },
  { find: "@/components/ui", replacement: path.join(registry, "base-nova/ui") },
  { find: "@/components", replacement: path.join(registry, "base-nova/blocks") },
]

// Tailwind's @source and @import want real paths, not aliases, so index.css
// carries placeholders that this plugin fills in before Tailwind reads it.
const fillPaths = {
  name: "geometry-gate-paths",
  enforce: "pre",
  transform: (code, id) =>
    id.endsWith("index.css")
      ? code.replaceAll("__REGISTRY__", registry).replaceAll("__THEME__", path.join(theme, "tokens.css"))
      : null,
}

export default defineConfig({
  root: here,
  base: "/",
  plugins: [fillPaths, react(), tailwindcss()],
  resolve: { alias: harnessAliases },
  server: { fs: { strict: false } },
  build: {
    outDir: process.env.GATE_OUT ?? path.join(repo, "node_modules/.cache/geometry-gate/dist"),
    emptyOutDir: true,
    minify: false,
  },
  logLevel: "warn",
})
