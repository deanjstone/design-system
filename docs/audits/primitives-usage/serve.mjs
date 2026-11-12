#!/usr/bin/env node
// Serves a built app (a `dist` directory) on 127.0.0.1 for render.mjs, with the single-page
// fallback a real host gives: a path with no file extension gets index.html.
//
//   node docs/audits/primitives-usage/serve.mjs <dist> <port> [base]
//
// `base` is the path the app was built to live under (Vite's `base`), for example /knowledge/.
// Runs until killed. It binds to the loopback address only.

import { createReadStream, existsSync, statSync } from "node:fs"
import http from "node:http"
import path from "node:path"

const [dist, port, base = "/"] = process.argv.slice(2)
if (!dist || !port || !existsSync(path.join(dist, "index.html"))) {
  console.error("usage: serve.mjs <dist with an index.html> <port> [base]")
  process.exit(2)
}
const root = path.resolve(dist)
const prefix = base.endsWith("/") ? base : `${base}/`
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".wasm": "application/wasm", ".txt": "text/plain" }

http
  .createServer((request, response) => {
    let pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
    if (prefix !== "/" && pathname.startsWith(prefix)) pathname = `/${pathname.slice(prefix.length)}`
    let file = path.join(root, pathname)
    if (!file.startsWith(root)) return response.writeHead(403).end()
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // An asset that is missing is a 404; a route is the app's to draw.
      if (path.extname(pathname) !== "") return response.writeHead(404).end()
      file = path.join(root, "index.html")
    }
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" })
    createReadStream(file).pipe(response)
  })
  .listen(Number(port), "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}${prefix}`))
