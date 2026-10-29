import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Badge, badgeVariants } from "../registry/base-nova/ui/badge"

afterEach(cleanup)

const STATUS_VARIANTS = ["success", "warning", "unreachable", "critical"] as const

describe("Badge status variants", () => {
  it.each(STATUS_VARIANTS)("%s is a tinted treatment on its own status token", (variant) => {
    const classes = badgeVariants({ variant })
    expect(classes).toContain(`bg-${variant}/10`)
    expect(classes).toContain(`text-${variant}`)
    expect(classes).toContain(`dark:bg-${variant}/15`)
  })

  it.each(STATUS_VARIANTS)("%s reports its variant on the rendered badge", (variant) => {
    render(<Badge variant={variant}>{variant}</Badge>)
    expect(screen.getByText(variant).getAttribute("class")).toContain(`text-${variant}`)
  })

  it("keeps the variants that were there before", () => {
    for (const variant of ["default", "secondary", "destructive", "outline", "ghost", "link"] as const) {
      expect(badgeVariants({ variant })).toBeTruthy()
    }
    expect(badgeVariants({ variant: "destructive" })).toContain("text-destructive")
  })
})
