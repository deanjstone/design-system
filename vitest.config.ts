import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// Registry sources import `@/lib/utils` and `@/components/ui/*`, the aliases
// consumers' shadcn config maps. Point them at the registry's own copies so
// tests run the shipped files.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/lib/utils": fileURLToPath(new URL("./registry/lib/utils.ts", import.meta.url)),
      "@/components/ui": fileURLToPath(new URL("./registry/base-nova/ui", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
  },
})
