import * as React from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageTransitionProvider, usePageTransition } from "@/components/ui/page-transition"

const THEMES = ["ocean", "default", "t3-chat", "grove", "ember", "iris"] as const
const VIEWS = {
  overview: { title: "Overview", body: "Three services healthy, one deploy waiting for approval." },
  billing: { title: "Billing", body: "Invoices are issued monthly; the next one is due on the 1st." },
  settings: { title: "Settings", body: "Passkeys are preferred over passwords. Sessions last 30 days." },
} as const
type ViewId = keyof typeof VIEWS

function Demo() {
  const { transition } = usePageTransition()
  const [view, setView] = React.useState<ViewId>("overview")
  const [theme, setTheme] = React.useState<(typeof THEMES)[number]>("ocean")
  const [dark, setDark] = React.useState(false)
  const [sweeps, setSweeps] = React.useState(0)

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle("dark", dark)
  }, [theme, dark])

  const go = (next: ViewId) => {
    if (next === view) return
    void transition(() => setView(next)).then(() => setSweeps((count) => count + 1))
  }

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">page-transition</h1>
        <p className="text-sm text-muted-foreground">
          Press a view. The band uses the active theme&apos;s colours; switch theme and mode to see it follow.
          With reduced motion on, or with no WebGL, the view changes with no band.
        </p>
      </header>

      <nav aria-label="Views" className="flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as ViewId[]).map((id) => (
          <Button key={id} variant={id === view ? "default" : "outline"} aria-current={id === view ? "page" : undefined} onClick={() => go(id)}>
            {VIEWS[id].title}
          </Button>
        ))}
      </nav>

      <Card data-testid="view" data-view={view}>
        <CardHeader>
          <CardTitle>{VIEWS[view].title}</CardTitle>
          <CardDescription>{VIEWS[view].body}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Transitions finished: <span data-testid="sweeps">{sweeps}</span></CardContent>
      </Card>

      <section aria-label="Theme" className="flex flex-wrap items-center gap-2">
        {THEMES.map((id) => (
          <Button key={id} size="sm" variant={id === theme ? "default" : "outline"} aria-pressed={id === theme} onClick={() => setTheme(id)}>
            {id}
          </Button>
        ))}
        <Button size="sm" variant="outline" aria-pressed={dark} onClick={() => setDark((value) => !value)}>
          {dark ? "Dark" : "Light"}
        </Button>
      </section>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(
  <PageTransitionProvider>
    <Demo />
  </PageTransitionProvider>,
)
