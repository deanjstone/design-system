import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "../registry/base-nova/ui/input-group"

afterEach(cleanup)

// The utilities InputGroup uses to look disabled. Each sits behind a `has-*`
// variant, which jsdom can't apply, so the test turns that variant back into
// the `:has()` selector Tailwind would emit and asks the DOM whether it matches.
const DISABLED_UTILITIES = new Set(["opacity-50", "bg-input/50", "bg-input/80"])

function splitVariants(token: string) {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of token) {
    if (char === "[") depth++
    if (char === "]") depth--
    if (char === ":" && depth === 0) {
      parts.push(current)
      current = ""
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts
}

function hasVariantToSelector(variant: string) {
  if (variant === "has-disabled") return ":has(*:disabled)"
  const arbitrary = variant.match(/^has-\[(.*)\]$/)
  if (!arbitrary) throw new Error(`Unhandled has-* variant: ${variant}`)
  return `:has(${arbitrary[1].replaceAll("_", " ")})`
}

function disabledStylingSelectors(group: HTMLElement) {
  return group.className.split(/\s+/).flatMap((token) => {
    const parts = splitVariants(token)
    const utility = parts.pop()
    if (!utility || !DISABLED_UTILITIES.has(utility)) return []
    return parts.filter((variant) => variant.startsWith("has-")).map(hasVariantToSelector)
  })
}

function renderComposer({ controlDisabled, buttonDisabled }: { controlDisabled: boolean; buttonDisabled: boolean }) {
  const { container } = render(
    <InputGroup>
      <InputGroupTextarea aria-label="Message" disabled={controlDisabled} />
      <InputGroupAddon align="block-end">
        <InputGroupButton disabled={buttonDisabled}>Send</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
  return container.querySelector<HTMLElement>("[data-slot=input-group]")!
}

describe("InputGroup disabled styling", () => {
  it("is declared, including the dark variant", () => {
    const group = renderComposer({ controlDisabled: false, buttonDisabled: false })
    const tokens = group.className.split(/\s+/)

    expect(disabledStylingSelectors(group)).toHaveLength(3)
    expect(tokens.some((token) => token.startsWith("dark:has-") && token.endsWith(":bg-input/80"))).toBe(true)
  })

  // A submit button disabled while the composer is empty used to grey out the
  // whole group, textarea included (#61).
  it("does not apply when only a button inside the group is disabled", () => {
    const group = renderComposer({ controlDisabled: false, buttonDisabled: true })

    for (const selector of disabledStylingSelectors(group)) {
      expect(group.matches(selector), selector).toBe(false)
    }
  })

  it("applies when the control is disabled", () => {
    const group = renderComposer({ controlDisabled: true, buttonDisabled: false })

    for (const selector of disabledStylingSelectors(group)) {
      expect(group.matches(selector), selector).toBe(true)
    }
  })
})
