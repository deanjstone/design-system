import * as React from "react"
import { cn } from "cn"

type PageHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  /** Buttons for the page's main actions. They sit beside the title from `sm`, under it on a phone. */
  actions?: React.ReactNode
}

// The title block at the top of a page, below the shell's header. One h1 per page.
function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 data-slot="page-header-title" className="font-heading text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p data-slot="page-header-description" className="text-sm text-muted-foreground text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div data-slot="page-header-actions" className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  )
}

export { PageHeader }
export type { PageHeaderProps }
