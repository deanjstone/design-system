import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// Registry sources import `@/lib/utils`, the alias consumers' shadcn config
// maps. Point it at the registry's own copy so tests run the shipped files.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/lib/utils": fileURLToPath(new URL("./registry/lib/utils.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.tsx"],
  },
})
