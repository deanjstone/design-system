import { CircleCheckIcon, CircleDashedIcon, CircleDotIcon, PlusIcon, SignalHighIcon, SignalLowIcon, SignalMediumIcon, TriangleAlertIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { DisplayMenu, GroupedList } from "@/components/grouped-list"
import { IssueRow } from "@/components/issue-row"
import { PageHeader } from "@/components/page-header"
import { useDisplaySettings } from "@/hooks/use-display-settings"
import { groupItems, pickVisible, type DisplayConfig, type ListGrouping } from "@/lib/list-group-core"

import { DESCRIPTION, ISSUES, REPOS, STATUS_LABEL, STATUS_ORDER, type Issue } from "./data"

// The screen as the registry draws it today: every element is a registry component with its default
// classes, composed the way docs/grouped-list/demo.tsx and the block docs compose them. Nothing here
// overrides a component's size, weight, colour or spacing.

const GROUPINGS: ListGrouping<Issue>[] = [
  { id: "status", label: "Status", keys: (issue) => issue.status, groupLabel: (key) => STATUS_LABEL[key as Issue["status"]], order: [...STATUS_ORDER] },
  { id: "wave", label: "Wave", keys: (issue) => issue.wave, order: ["Wave 1", "Wave 2", "Later"] },
  { id: "repo", label: "Repo", keys: (issue) => issue.repo },
]

const CONFIG: DisplayConfig = {
  groupings: GROUPINGS.map((grouping) => grouping.id),
  properties: [
    { id: "priority", label: "Priority" },
    { id: "identifier", label: "ID" },
    { id: "status", label: "Status" },
    { id: "labels", label: "Labels" },
    { id: "project", label: "Wave" },
    { id: "dueDate", label: "Due date" },
    { id: "assignee", label: "Assignee" },
  ],
  defaultGroupBy: "status",
}

const PRIORITY = {
  urgent: <TriangleAlertIcon aria-label="Priority: urgent" className="size-4 text-critical" />,
  high: <SignalHighIcon aria-label="Priority: high" className="size-4 text-muted-foreground" />,
  medium: <SignalMediumIcon aria-label="Priority: medium" className="size-4 text-muted-foreground" />,
  low: <SignalLowIcon aria-label="Priority: low" className="size-4 text-muted-foreground" />,
}

const STATUS = {
  todo: <CircleDashedIcon aria-label="Status: to do" className="size-4 text-muted-foreground" />,
  working: <CircleDotIcon aria-label="Status: working" className="size-4 text-warning" />,
  done: <CircleCheckIcon aria-label="Status: done" className="size-4 text-success" />,
}

export function Current() {
  const display = useDisplaySettings("hierarchy-density-sample", CONFIG)
  const { settings } = display
  const grouping = GROUPINGS.find((candidate) => candidate.id === settings.groupBy) ?? null
  const groups = groupItems(ISSUES, grouping, { noneLabel: grouping ? `No ${grouping.label.toLowerCase()}` : "None" })

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <PageHeader
        title="Issues"
        description={DESCRIPTION}
        actions={
          <>
            <DisplayMenu
              groupings={GROUPINGS}
              properties={CONFIG.properties}
              settings={settings}
              onGroupByChange={display.setGroupBy}
              onPropertyChange={display.setPropertyVisible}
              onReset={display.reset}
            />
            <Button>
              <PlusIcon data-icon="inline-start" />
              New issue
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="max-w-xs" placeholder="Search issues" aria-label="Search issues" />
            <NativeSelect aria-label="Repo" defaultValue="all">
              <NativeSelectOption value="all">All repos</NativeSelectOption>
              {REPOS.map((repo) => (
                <NativeSelectOption key={repo} value={repo}>
                  {repo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <span className="text-sm text-muted-foreground">{ISSUES.length} issues</span>
          </div>
          <GroupedList
            groups={groups}
            collapsed={grouping ? (settings.collapsed[grouping.id] ?? []) : []}
            onToggleGroup={display.toggleCollapsed}
            getItemKey={(issue) => issue.id}
            renderItem={(issue) => (
              <IssueRow
                title={issue.title}
                href={`#${issue.id}`}
                {...pickVisible(
                  {
                    priority: PRIORITY[issue.priority],
                    identifier: issue.id,
                    status: STATUS[issue.status],
                    labels: issue.labels.map((name) => (
                      <Badge key={name} variant="outline">
                        {name}
                      </Badge>
                    )),
                    project: issue.wave || undefined,
                    dueDate: issue.due ? `Due ${issue.due}` : undefined,
                    assignee: (
                      <Avatar size="sm" aria-label={`Assigned to ${issue.assignee}`} role="img">
                        <AvatarFallback>{issue.assignee}</AvatarFallback>
                      </Avatar>
                    ),
                  },
                  settings,
                )}
              />
            )}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Quick add</CardTitle>
            <CardDescription>File an issue without leaving the list.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="current-title">Title</FieldLabel>
                <Input id="current-title" placeholder="What needs doing" />
              </Field>
              <Field>
                <FieldLabel htmlFor="current-repo">Repo</FieldLabel>
                <NativeSelect id="current-repo" defaultValue={REPOS[0]}>
                  {REPOS.map((repo) => (
                    <NativeSelectOption key={repo} value={repo}>
                      {repo}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="current-notes">Notes</FieldLabel>
                <Textarea id="current-notes" rows={3} />
                <FieldDescription>Markdown is kept as written.</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="gap-2">
            <Button>Add issue</Button>
            <Button variant="ghost">Clear</Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
