import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "../registry/base-nova/ui/carousel"

// jsdom has no ResizeObserver or IntersectionObserver, and embla reads matchMedia for its breakpoints.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
  window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as MediaQueryList
})

afterEach(cleanup)

describe("Carousel", () => {
  it("is a labelled carousel region with previous and next controls", () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Slide one</CarouselItem>
          <CarouselItem>Slide two</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    )

    const region = screen.getByRole("region")
    expect(region.getAttribute("aria-roledescription")).toBe("carousel")
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Next slide" })).toBeTruthy()
    expect(screen.getAllByRole("group").every((slide) => slide.getAttribute("aria-roledescription") === "slide")).toBe(true)
  })
})
