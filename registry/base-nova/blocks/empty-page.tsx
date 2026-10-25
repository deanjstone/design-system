import * as React from "react"
import { cn } from "cn"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type EmptyPageProps = Omit<React.ComponentProps<typeof Empty>, "title"> & {
  /** An icon element, drawn in the muted icon tile. */
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** The next step, usually a button. */
  action?: React.ReactNode
}

// A whole page with nothing to show: it fills the room the shell leaves and
// centres the message. For an empty list inside a page, use `Empty` directly.
function EmptyPage({ icon, title, description, action, className, ...props }: EmptyPageProps) {
  return (
    <Empty data-slot="empty" className={cn("min-h-[50dvh]", className)} {...props}>
      <EmptyHeader>
        {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}

export { EmptyPage }
export type { EmptyPageProps }
