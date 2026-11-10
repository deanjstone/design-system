import * as React from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { AppearanceSection, SettingsPage } from "@/components/settings-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useFontPreference } from "@/hooks/use-font-preference"
import { useThemePreference } from "@/hooks/use-theme-preference"
import { fontInitScript, applyFont, parseFont } from "@/lib/font-preference"
import { ALL_THEMES, applyPreference, parsePreference, themeInitScript } from "@/lib/theme-preference"

// ?view=components (default) draws a few components; ?view=settings draws the Appearance section.
// ?theme=ds&mode=dark&font=aspekta set a state for the screenshots by the same functions the app uses
// (applyPreference, applyFont). With no parameters the page runs the apps' real head scripts, which
// restore the stored choice, or leave the page alone when there is none.
const params = new URLSearchParams(window.location.search)
const view = params.get("view") ?? "components"
if (params.has("theme") || params.has("mode") || params.has("font")) {
  applyPreference(parsePreference(`${params.get("theme") ?? "ocean"}.${params.get("mode") ?? "light"}`), { prefersDark: false })
  applyFont(parseFont(params.get("font")))
} else {
  new Function(themeInitScript())()
  new Function(fontInitScript())()
}

function Components() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Deploy queue</CardTitle>
          <CardDescription>Two commits wait on a green run before they can be approved.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>main</Badge>
            <Badge variant="secondary">CI running</Badge>
            <code className="font-mono text-sm">2bed670 · v3.22.0</code>
          </div>
          <Tabs defaultValue="queue">
            <TabsList>
              <TabsTrigger value="queue">Queue</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="rollback">Rollback</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input aria-label="Commit" placeholder="Filter by SHA or message" />
          <div className="flex gap-2">
            <Button className="flex-1">Approve</Button>
            <Button variant="outline" className="flex-1">
              Hold
            </Button>
          </div>
        </CardContent>
      </Card>
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm">{"git push origin HEAD:main\ncheck: pass 2bed670"}</pre>
    </div>
  )
}

function Settings() {
  const { preference, setTheme, setMode } = useThemePreference()
  const { font, setFont } = useFontPreference()
  return (
    <SettingsPage>
      <AppearanceSection
        preference={preference}
        onThemeChange={setTheme}
        onModeChange={setMode}
        themes={ALL_THEMES}
        font={font}
        onFontChange={setFont}
      />
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm">{"font-mono sample 0123456789"}</pre>
    </SettingsPage>
  )
}

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
    {view === "settings" ? <Settings /> : <Components />}
  </main>,
)
