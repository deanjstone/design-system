import { fileURLToPath } from "node:url"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { dsSurfaceCss } from "../../scripts/theme/ds-theme.mjs"

// Builds the DS theme and font demo. docs/ds-theme/screenshots.mjs builds it and serves the output for
// the length of the run; nothing here runs a dev server. The DS theme is written out from the same
// object that fills the theme-ds registry item, so the demo draws what a consumer gets.
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const registry = path.join(repo, "registry")
const out = process.env.DS_THEME_OUT ?? path.join(repo, "node_modules/.cache/ds-theme-demo/dist")
const generated = path.join(path.dirname(out), "generated")

const toCss = (rules, indent = "") =>
  Object.entries(rules)
    .map(([selector, body]) => {
      const inner =
        typeof body === "object" && Object.values(body).some((value) => typeof value === "object")
          ? toCss(body, `${indent}  `)
          : Object.entries(body)
              .map(([property, value]) => `${indent}  ${property}: ${value};`)
              .join("\n")
      return `${indent}${selector} {\n${inner}\n${indent}}`
    })
    .join("\n")

mkdirSync(generated, { recursive: true })
const dsThemeCss = path.join(generated, "theme-ds.css")
writeFileSync(dsThemeCss, `${toCss(dsSurfaceCss())}\n`)

const fillPaths = {
  name: "ds-theme-demo-paths",
  enforce: "pre",
  transform: (code, id) =>
    id.endsWith("index.css")
      ? code
          .replaceAll("__REGISTRY__", registry)
          .replaceAll("__THEME__", path.join(repo, "theme/tokens.css"))
          .replaceAll("__DS_THEME__", dsThemeCss)
          .replaceAll("__DS_FONTS__", path.join(registry, "fonts/ds-fonts.css"))
      : null,
}

export default defineConfig({
  root: here,
  base: "/",
  // The font files, installed by registry/fonts/install-ds-fonts.sh into <publicDir>/fonts/ds.
  publicDir: process.env.DS_THEME_PUBLIC ?? false,
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
  build: { outDir: out, emptyOutDir: true },
  logLevel: "warn",
})
