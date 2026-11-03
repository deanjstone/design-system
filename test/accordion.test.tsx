import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../registry/base-nova/ui/accordion"

afterEach(cleanup)

describe("Accordion", () => {
  it("opens a panel when its trigger is clicked", () => {
    render(
      <Accordion>
        <AccordionItem value="billing">
          <AccordionTrigger>Billing</AccordionTrigger>
          <AccordionContent>Invoices are monthly.</AccordionContent>
        </AccordionItem>
      </Accordion>,
    )

    const trigger = screen.getByRole("button", { name: "Billing" })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(trigger)

    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("Invoices are monthly.")).toBeTruthy()
  })
})
