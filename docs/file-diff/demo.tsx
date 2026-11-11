import * as React from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileDiff } from "@/components/file-diff"

// ?theme=dark switches the page to the dark theme. The screenshots script loads it once per theme.
const params = new URLSearchParams(window.location.search)
document.documentElement.classList.toggle("dark", params.get("theme") === "dark")

const LONG_LINE = `const hubUrl = "https://ops-hub.example.test/api/github/pulls/deanjstone/design-system/205/files?per_page=100&page=1&token=${"abcdef0123456789".repeat(6)}"`

const PATCH = [
  "@@ -12,7 +12,8 @@ export function renderTheFilesChangedSectionOfAPullRequestPageWithAVeryLongHunkHeader() {",
  "   const files = useFiles(repo, number)",
  "-  const old = files.data",
  `+  const next = files.data ?? []`,
  `+  ${LONG_LINE}`,
  "   return (",
  "     <section>",
  "\\ No newline at end of file",
].join("\n")

const FILES = [
  {
    filename: "apps/ops-hub-web/src/views/pull-page-with-a-rather-long-name/files-changed-section-of-the-page.tsx",
    previousFilename: null,
    status: "modified",
    additions: 2,
    deletions: 1,
    patch: PATCH,
  },
  { filename: "apps/ops-hub-web/src/assets/logo.png", previousFilename: null, status: "added", additions: 0, deletions: 0, patch: null },
]

function Demo() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Files changed</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {FILES.map((file) => (
            <FileDiff key={file.filename} file={file} bleed defaultOpen className="max-md:-mx-4" />
          ))}
        </CardContent>
      </Card>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<Demo />)
