import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../registry/base-nova/ui/pagination"

afterEach(cleanup)

describe("Pagination", () => {
  it("marks the current page and labels the previous, next and ellipsis controls", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="?page=1" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="?page=2" isActive>2</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="?page=3" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    )

    expect(screen.getByRole("navigation", { name: "pagination" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "2" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: /previous page/i }).getAttribute("href")).toBe("?page=1")
    expect(screen.getByRole("link", { name: /next page/i }).getAttribute("href")).toBe("?page=3")
  })
})
