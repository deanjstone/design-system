"use client"

// One changed file with its diff, moved here from ops-hub's `file-diff.tsx` (design-system#205) so a diff
// follows the registry's wrap rule: nothing is cut off and nothing scrolls sideways. The file path, the
// hunk headers and every code line wrap; `wrap-anywhere` breaks a token with no spaces so it cannot widen
// the card. The +/- sign has its own narrow column, so a wrapped line stays indented under its code. Below
// `md` one line-number column is shown, not two, to give the code the room.

import * as React from "react"
import { ChevronRightIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { parsePatch, type DiffLine, type FileDiffFile } from "@/lib/diff-core"

// A patch longer than this starts collapsed, as does a file with no patch to show.
const OPEN_UP_TO_LINES = 400

const ROW_TONE: Record<DiffLine["kind"], string> = {
  add: "bg-emerald-500/10",
  del: "bg-destructive/10",
  hunk: "bg-muted text-muted-foreground",
  note: "text-muted-foreground italic",
  context: "",
}

const SIGN: Record<DiffLine["kind"], string> = { add: "+", del: "−", context: " ", hunk: "", note: "" }

type FileDiffProps = Omit<React.ComponentProps<typeof Collapsible>, "children" | "render"> & {
  /** The file to show. A `PullFile` from GitHub's API fits as it is. */
  file: FileDiffFile
  /**
   * Run edge to edge on phones: below `md` the block drops its side borders and rounded corners, and its
   * body keeps clear of the safe areas. It cannot know the padding of the card around it, so pair it with a
   * negative margin that matches, for example `className="max-md:-mx-4"` inside a `p-4` card.
   */
  bleed?: boolean
}

function FileDiff({ file, bleed = false, defaultOpen, className, ...props }: FileDiffProps) {
  const lines = React.useMemo(() => (file.patch ? parsePatch(file.patch) : []), [file.patch])
  const open = defaultOpen ?? (file.patch !== null && lines.length <= OPEN_UP_TO_LINES)

  return (
    <Collapsible
      data-slot="file-diff"
      data-file={file.filename}
      defaultOpen={open}
      className={cn("overflow-hidden rounded-md border", bleed && "max-md:rounded-none max-md:border-x-0", className)}
      {...props}
    >
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-auto min-h-11 w-full justify-start gap-2 rounded-none py-2 text-left whitespace-normal [&[data-panel-open]>svg:first-child]:rotate-90"
          />
        }
      >
        <ChevronRightIcon className="transition-transform motion-reduce:transition-none" />
        <span data-slot="file-diff-path" className="min-w-0 flex-1 text-left font-mono text-2xs wrap-anywhere">
          {file.previousFilename ? `${file.previousFilename} → ` : ""}
          {file.filename}
        </span>
        <span className="shrink-0 text-2xs">
          <span className="text-emerald-700 dark:text-emerald-400">+{file.additions}</span>{" "}
          <span className="text-destructive">−{file.deletions}</span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {file.patch === null ? (
          <p className="border-t px-3 py-2 text-2xs text-muted-foreground wrap-anywhere">
            {file.status === "renamed" ? "Renamed with no changes." : "Binary or too large to show; open it on GitHub."}
          </p>
        ) : (
          <div data-slot="file-diff-body" className={cn("border-t font-mono text-xs leading-5", bleed && "max-md:pl-safe max-md:pr-safe")}>
            {lines.map((line, index) => (
              <div
                key={index}
                data-slot="file-diff-line"
                data-line={line.kind}
                className={cn(
                  "grid min-h-5 min-w-0 grid-cols-[2.5rem_2.5rem_1rem_minmax(0,1fr)] max-md:grid-cols-[2.5rem_1rem_minmax(0,1fr)]",
                  ROW_TONE[line.kind],
                )}
              >
                <span data-slot="file-diff-old-line" className="px-1 text-right text-muted-foreground select-none max-md:hidden">
                  {line.oldLine ?? ""}
                </span>
                <span data-slot="file-diff-new-line" className="px-1 text-right text-muted-foreground select-none">
                  {line.newLine ?? (line.oldLine === null ? null : <span className="md:hidden">{line.oldLine}</span>)}
                </span>
                <span data-slot="file-diff-sign" className="text-center select-none">
                  {SIGN[line.kind]}
                </span>
                <span data-slot="file-diff-code" className="min-w-0 pr-2 whitespace-pre-wrap wrap-anywhere">
                  {line.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export { FileDiff }
export type { FileDiffProps }
