import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { AspectRatio } from "../registry/base-nova/ui/aspect-ratio"

afterEach(cleanup)

describe("AspectRatio", () => {
  it("sets the ratio as a custom property on its box", () => {
    const { container } = render(<AspectRatio ratio={16 / 9}>Preview</AspectRatio>)

    const box = container.querySelector<HTMLElement>('[data-slot="aspect-ratio"]')
    expect(box?.style.getPropertyValue("--ratio")).toBe(String(16 / 9))
    expect(box?.textContent).toBe("Preview")
  })
})
