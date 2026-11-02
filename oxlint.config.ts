import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["react", "typescript", "oxc"],
  ignorePatterns: [
    ".claude/**",
    "**/node_modules/**",
    "**/dist/**",
    "r/**",
    "geometry-gate-out/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" }],
  rules: {
    "react/rules-of-hooks": "error",
    "typescript/no-floating-promises": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
  },
  overrides: [
    {
      // Shipped registry source: editing it changes r/ and needs a release. The
      // conditional spread keeps `description` absent rather than undefined.
      files: ["registry/lib/links-core.ts"],
      rules: { "anti-slop/no-conditional-empty-object-spread": "off" },
    },
    {
      files: ["**/*.test.{ts,tsx}", "**/test/**", "**/harness/**"],
      rules: { "anti-slop/no-module-mocking": "warn" },
    },
  ],
});
