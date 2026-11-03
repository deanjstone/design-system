import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Alert, AlertDescription, AlertTitle } from "../registry/base-nova/ui/alert"

afterEach(cleanup)

describe("Alert", () => {
  it("announces its title and description as an alert", () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Payment failed</AlertTitle>
        <AlertDescription>Update the card on file.</AlertDescription>
      </Alert>,
    )

    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Payment failed")
    expect(alert.textContent).toContain("Update the card on file.")
    expect(alert.getAttribute("data-slot")).toBe("alert")
  })
})
