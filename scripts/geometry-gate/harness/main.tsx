import { Bell, Home, Inbox, Search, Settings } from "lucide-react"
import { createRoot } from "react-dom/client"
import { toast } from "sonner"

import "./index.css"
import { AppShell } from "@/components/app-shell"
import { Login } from "@/components/login"
import { PageHeader } from "@/components/page-header"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandInput, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Toaster } from "@/components/ui/sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"

// One page, one block per `?v=` value, so the gate drives each registry block in
// its own context. The shell view is the AppShell with a representative page in it.

const params = new URLSearchParams(location.search)
const view = params.get("v") ?? "shell"
if (params.get("dark")) document.documentElement.classList.add("dark")

const sections = [
  { id: "a", label: "Home", href: "#a", icon: <Home /> },
  { id: "b", label: "Inbox", href: "#b", icon: <Inbox /> },
  { id: "c", label: "Alerts", href: "#c", icon: <Bell /> },
  { id: "d", label: "Search", href: "#d", icon: <Search /> },
  { id: "e", label: "Settings", href: "#e", icon: <Settings /> },
]
const apps = [
  { id: "x", name: "Shell", href: "#x" },
  { id: "y", name: "Jobs", href: "#y" },
]

const Page = () => (
  <div className="flex flex-col gap-4">
    <PageHeader title="Page title" description="A description that is long enough to wrap onto a second line on a phone." actions={<Button>Act</Button>} />
    <div className="flex flex-wrap gap-2">
      <Button>Default</Button>
      <Button size="sm">Small</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="link">Link</Button>
      <Badge>Badge</Badge>
      <Badge render={<a href="#badge" />} variant="outline">Link badge</Badge>
      <Toggle aria-label="Bold" variant="outline">B</Toggle>
    </div>
    <div className="flex flex-col gap-2">
      <Label htmlFor="name">Name</Label>
      <Input id="name" placeholder="name" />
      <Textarea aria-label="Notes" placeholder="notes" />
      <div className="flex min-h-11 items-center gap-2">
        <Checkbox id="check" />
        <Label htmlFor="check">Check</Label>
      </div>
      <div className="flex min-h-11 items-center gap-2">
        <Switch id="switch" />
        <Label htmlFor="switch">Switch</Label>
      </div>
      <Command className="rounded-lg border">
        <CommandInput placeholder="Search" />
        <CommandList />
      </Command>
      <Select defaultValue="a">
        <SelectTrigger aria-label="Choice"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
          <SelectItem value="b">B</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <Tabs defaultValue="1">
      <TabsList>
        <TabsTrigger value="1">One</TabsTrigger>
        <TabsTrigger value="2">Two</TabsTrigger>
      </TabsList>
      <TabsContent value="1">Tab content</TabsContent>
    </Tabs>
    <Card>
      <CardHeader>
        <CardTitle>Card</CardTitle>
        <CardDescription>Card description</CardDescription>
      </CardHeader>
      <CardContent>Card body</CardContent>
    </Card>
    <Table>
      <TableHeader>
        <TableRow><TableHead>A</TableHead><TableHead>B</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow><TableCell>1</TableCell><TableCell>2</TableCell></TableRow>
      </TableBody>
    </Table>
    <Table className="whitespace-nowrap">
      <TableCaption>Wide table</TableCaption>
      <TableHeader>
        <TableRow>
          {["Name", "Role", "Region", "Last seen", "Status"].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          {["Ada Lovelace", "Administrator", "Australia East", "Yesterday at 09:20", "Active"].map((value) => <TableCell key={value}>{value}</TableCell>)}
        </TableRow>
      </TableBody>
    </Table>
    {Array.from({ length: 8 }, (_, index) => (
      <p key={index}>Paragraph {index + 1}: text that scrolls under the tab bar and the bottom curves.</p>
    ))}
  </div>
)

// A page banner for the shell's slot (`?v=shell&banner=1`): the knowledge app's model-download strip.
const Banner = () => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between text-primary">
      <span>Downloading AI model…</span>
      <span className="tabular-nums text-muted-foreground">60%</span>
    </div>
    <div className="h-0.5 w-full rounded-full bg-muted">
      <div className="h-0.5 w-3/5 rounded-full bg-primary" />
    </div>
  </div>
)

const SIDES = ["top", "right", "bottom", "left"] as const
type Side = (typeof SIDES)[number]
const side: Side = SIDES.includes(params.get("side") as Side) ? (params.get("side") as Side) : "right"

const Toast = () => {
  toast("Saved", { description: "Your change was saved.", duration: Infinity, action: { label: "Undo", onClick: () => {} } })
  return <Toaster position={(params.get("position") as "top-center") ?? "bottom-center"} />
}

const App = () => {
  if (view === "login") {
    return <Login appName="App" description="Sign in" onPassword={async () => {}} onEmailLink={async () => {}} onPasskeySignIn={async () => {}} />
  }
  if (view === "sheet") {
    return (
      <Sheet defaultOpen>
        <SheetContent side={side}>
          <SheetHeader>
            <SheetTitle>Sheet title</SheetTitle>
            <SheetDescription>Sheet description</SheetDescription>
          </SheetHeader>
          <div className="p-4">Sheet body</div>
        </SheetContent>
      </Sheet>
    )
  }
  if (view === "dialog") {
    return (
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog title that is long enough to run towards the close button</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogHeader>
          <Input aria-label="Field" />
          <DialogFooter><Button>OK</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
  if (view === "alert-dialog") {
    return (
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }
  if (view === "drawer") {
    return (
      <Drawer defaultOpen>
        <DrawerContent showCloseButton>
          <DrawerHeader>
            <DrawerTitle>Drawer title</DrawerTitle>
            <DrawerDescription>Drawer description</DrawerDescription>
          </DrawerHeader>
          <div className="p-4">Drawer body</div>
          <DrawerFooter><Button>Done</Button></DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }
  if (view === "toast") return <Toast />
  if (view === "states") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2"><Spinner /><span>Loading</span></div>
        <Skeleton className="h-4 w-40 max-w-full" />
      </div>
    )
  }
  if (view === "shell-focus") {
    return (
      <AppShell appName="Shell" sections={sections} activeSectionId="a" chrome="none" back={{ href: "#", label: "Back to Inbox" }}>
        <Page />
      </AppShell>
    )
  }
  return (
    <AppShell
      appName="Shell"
      sections={sections}
      activeSectionId="a"
      apps={apps}
      currentAppId="x"
      mode="system"
      onModeChange={() => {}}
      back={{ href: "#" }}
      headerActions={<Button size="icon" variant="ghost" aria-label="Alerts"><Bell /></Button>}
      banner={params.get("banner") ? <Banner /> : undefined}
    >
      <Page />
    </AppShell>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
