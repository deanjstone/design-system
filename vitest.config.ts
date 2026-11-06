import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// Registry sources import `@/lib/utils` and `@/components/ui/*`, the aliases
// consumers' shadcn config maps. Point them at the registry's own copies so
// tests run the shipped files. Blocks install to `@/components`, so that alias
// comes after `@/components/ui`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/lib/links-core": fileURLToPath(new URL("./registry/lib/links-core.ts", import.meta.url)),
      "@/lib/links": fileURLToPath(new URL("./registry/lib/links.ts", import.meta.url)),
      "@/lib/utils": fileURLToPath(new URL("./registry/lib/utils.ts", import.meta.url)),
      "@/lib/link-pill-core": fileURLToPath(
        new URL("./registry/lib/link-pill-core.ts", import.meta.url),
      ),
      "@/lib/graph-3d-core": fileURLToPath(new URL("./registry/lib/graph-3d-core.ts", import.meta.url)),
      "@/lib/graph-3d-engine": fileURLToPath(new URL("./registry/lib/graph-3d-engine.ts", import.meta.url)),
      "@/lib/page-transition-core": fileURLToPath(
        new URL("./registry/lib/page-transition-core.ts", import.meta.url),
      ),
      "@/lib/highlighter": fileURLToPath(new URL("./registry/lib/highlighter.tsx", import.meta.url)),
      "@/lib/theme-preference": fileURLToPath(new URL("./registry/lib/theme-preference.ts", import.meta.url)),
      "@/lib/nav-link": fileURLToPath(new URL("./registry/lib/nav-link.tsx", import.meta.url)),
      "@/hooks": fileURLToPath(new URL("./registry/base-nova/hooks", import.meta.url)),
      "@/components/ui": fileURLToPath(new URL("./registry/base-nova/ui", import.meta.url)),
      "@/components": fileURLToPath(new URL("./registry/base-nova/blocks", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    // The host is shared and often loaded; the tsc and git-spawning tests take 8-15 s there
    // against vitest's 5 s default, and pass when given room.
    testTimeout: 30_000,
  },
})
