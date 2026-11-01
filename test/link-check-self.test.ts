// @vitest-environment node

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// design-system#152: the repo that ships link-check passes it, in blocking
// mode. Its test fixtures stay exempt, as for any consumer.

const root = fileURLToPath(new URL("../", import.meta.url))

describe("design-system passes its own link-check", () => {
  it("has no host literal, retired host, config disagreement or drift in blocking mode", () => {
    const result = spawnSync("bash", ["registry/links/link-check.sh", "--mode", "block"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, LINKS_UPSTREAM: `file://${root}registry/links/links.json`, LINK_CHECK_REPO: "design-system" },
    })
    expect(result.stdout).toMatch(/link-check: summary design-system literals=0 retired=0 config=0 drift=0 mode=block/)
    expect(result.status).toBe(0)
  })
})
