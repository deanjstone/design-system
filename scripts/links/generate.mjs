// Renders registry/lib/links.ts from registry/links/links.json.
//   node scripts/links/generate.mjs           write the file
//   node scripts/links/generate.mjs --check   exit 1 if the file is stale
// test/links.test.ts fails on a stale file, so `pnpm check` catches it too.
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { validateRegistry } from "./registry.mjs"

const root = new URL("../../", import.meta.url)
const registryPath = fileURLToPath(new URL("registry/links/links.json", root))
const modulePath = fileURLToPath(new URL("registry/lib/links.ts", root))

// $comment and $schema describe the JSON file, not the data.
const withoutMeta = ({ $comment, $schema, ...data }) => data

export function renderLinksModule(registry) {
  const errors = validateRegistry(registry)
  if (errors.length > 0) throw new Error(`links.json is invalid:\n- ${errors.join("\n- ")}`)
  const data = JSON.stringify(withoutMeta(registry), null, 2)
  return `// link-check:vendored
// GENERATED from links.json by design-system scripts/links/generate.mjs. Do not edit.
// The URL builders for every Argus host and tailnet service: every URL in code comes from here.
import { createLinks } from "@/lib/links-core"

export const REGISTRY = ${data} as const

export const { appUrl, routeUrl, apiUrl, mcpUrl, tailnetUrl, switcherApps, COOKIE_DOMAIN } = createLinks(REGISTRY)

export type LinkId = (typeof REGISTRY.entries)[number]["id"]
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rendered = renderLinksModule(JSON.parse(readFileSync(registryPath, "utf8")))
  if (process.argv.includes("--check")) {
    if (readFileSync(modulePath, "utf8") !== rendered) {
      console.error("registry/lib/links.ts is stale: run node scripts/links/generate.mjs")
      process.exit(1)
    }
  } else {
    writeFileSync(modulePath, rendered)
  }
}
