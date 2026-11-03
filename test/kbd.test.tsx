import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Kbd, KbdGroup } from "../registry/base-nova/ui/kbd"

afterEach(cleanup)

describe("Kbd", () => {
  it("renders a key and a group of keys as kbd elements", () => {
    render(
      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>,
    )

    expect(screen.getByText("Ctrl").tagName).toBe("KBD")
    expect(screen.getByText("K").tagName).toBe("KBD")
  })
})
