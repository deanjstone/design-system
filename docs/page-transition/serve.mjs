#!/usr/bin/env node
// Opens the page-transition demo for the owner (design-system#198, checkpoint #199): builds it,
// serves the output on 127.0.0.1 and stays up until Ctrl-C. Nothing is written outside the temp
// directory it builds into.
//
//   node docs/page-transition/serve.mjs [--port 4173]
//
// To open it from a phone or another machine, expose the port on the tailnet only:
//   tailscale serve --bg 4173      (never `tailscale funnel`)
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const portFlag = process.argv.indexOf("--port")
const port = portFlag === -1 ? 4173 : Number(process.argv[portFlag + 1])
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port needs a number from 1024 to 65535")

const dist = fs.mkdtempSync(path.join(os.tmpdir(), "page-transition-demo-"))
const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, PAGE_TRANSITION_OUT: dist },
})
if (build.status !== 0) throw new Error("page-transition demo build failed")

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://x").pathname
  const file = path.join(dist, pathname === "/" ? "index.html" : pathname)
  if (!file.startsWith(dist) || !fs.existsSync(file)) {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(fs.readFileSync(file))
})
server.listen(port, "127.0.0.1", () => console.log(`page-transition demo: http://127.0.0.1:${port}/  (Ctrl-C to stop)`))
process.on("SIGINT", () => {
  server.close()
  fs.rmSync(dist, { recursive: true, force: true })
  process.exit(0)
})
