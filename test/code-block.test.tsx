import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFooter,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "../registry/base-nova/ui/code-block"
import { useHighlightedCode } from "../registry/base-nova/hooks/use-highlighted-code"
import { highlightCode } from "../registry/lib/highlighter"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("CodeBlock", () => {
  it("renders header, content and footer with the default variant and size", () => {
    const { container } = render(
      <CodeBlock>
        <CodeBlockHeader>
          <CodeBlockTitle>build.log</CodeBlockTitle>
        </CodeBlockHeader>
        <CodeBlockContent>{"pnpm build"}</CodeBlockContent>
        <CodeBlockFooter>exit 0</CodeBlockFooter>
      </CodeBlock>
    )
    const root = container.querySelector("[data-slot=code-block]")!

    expect(root.getAttribute("data-variant")).toBe("default")
    expect(root.getAttribute("data-size")).toBe("default")
    expect(screen.getByText("build.log").getAttribute("data-slot")).toBe("code-block-title")
    expect(screen.getByText("exit 0").getAttribute("data-slot")).toBe("code-block-footer")
  })

  it("carries the variant and size on the root", () => {
    const { container } = render(
      <CodeBlock variant="destructive" size="sm">
        <CodeBlockContent>boom</CodeBlockContent>
      </CodeBlock>
    )
    const root = container.querySelector("[data-slot=code-block]")!

    expect(root.getAttribute("data-variant")).toBe("destructive")
    expect(root.getAttribute("data-size")).toBe("sm")
    expect(root.className).toContain("border-destructive/30")
  })

  it("makes the content a focusable, left-to-right scroll region", () => {
    const { container } = render(
      <CodeBlock>
        <CodeBlockContent>x</CodeBlockContent>
      </CodeBlock>
    )
    const pre = container.querySelector("pre[data-slot=code-block-content]")!

    expect(pre.getAttribute("tabindex")).toBe("0")
    expect(pre.getAttribute("dir")).toBe("ltr")
  })

  it("splits a string into numbered lines and honours startLine", () => {
    const { container } = render(
      <CodeBlock>
        <CodeBlockContent lineNumbers startLine={10}>
          {"one\ntwo\nthree\n"}
        </CodeBlockContent>
      </CodeBlock>
    )
    const pre = container.querySelector("pre")!

    expect(pre.getAttribute("data-numbered")).toBe("true")
    expect(pre.style.counterReset).toBe("line 9")
    expect(container.querySelectorAll("[data-slot=code-block-line]")).toHaveLength(3)
  })

  it("sets data-wrap when wrapping", () => {
    const { container } = render(
      <CodeBlock>
        <CodeBlockContent wrap>x</CodeBlockContent>
      </CodeBlock>
    )

    expect(container.querySelector("pre")!.getAttribute("data-wrap")).toBe("true")
  })

  it.each(["default", "added", "removed", "highlighted"] as const)(
    "marks a %s line",
    (variant) => {
      const { container } = render(<CodeBlockLine variant={variant}>text</CodeBlockLine>)

      expect(container.querySelector("[data-slot=code-block-line]")!.getAttribute("data-variant")).toBe(
        variant
      )
    }
  )

  it("keeps a newline in an empty line so copied selections keep blank lines", () => {
    const { container } = render(<CodeBlockLine />)

    expect(container.querySelector("[data-slot=code-block-line-content]")!.textContent).toBe("\n")
  })

  it("floats actions that sit directly inside the block, with no header", () => {
    const { container } = render(
      <CodeBlock>
        <CodeBlockActions>
          <button type="button">act</button>
        </CodeBlockActions>
        <CodeBlockContent>x</CodeBlockContent>
      </CodeBlock>
    )

    expect(container.querySelector("[data-slot=code-block-actions]")!.className).toContain(
      "[[data-slot=code-block]>&]:absolute"
    )
  })
})

describe("CodeBlockCopyButton", () => {
  it("copies its value, announces it, then resets after two seconds", async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    render(<CodeBlockCopyButton value="pnpm install" />)

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }))
    })

    expect(writeText).toHaveBeenCalledWith("pnpm install")
    expect(screen.getByRole("button", { name: "Copied" })).not.toBeNull()
    expect(document.querySelector("[aria-live=polite]")!.textContent).toBe("Copied")

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole("button", { name: "Copy" })).not.toBeNull()
  })

  it("still calls the consumer's onClick", () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    const onClick = vi.fn()
    render(<CodeBlockCopyButton value="x" onClick={onClick} />)

    fireEvent.click(screen.getByRole("button", { name: "Copy" }))

    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe("highlighting", () => {
  it("returns null for a language that is not listed", async () => {
    expect(await highlightCode("x", "cobol")).toBeNull()
  })

  it("tokenizes a listed language into one node per line", async () => {
    const lines = await highlightCode("const a = 1\nconst b = 2", "ts")

    expect(lines).toHaveLength(2)
  })

  it("useHighlightedCode returns plain lines first, then highlighted ones", async () => {
    const Probe = () => {
      const lines = useHighlightedCode("const a = 1\n", "typescript")
      return (
        <CodeBlock>
          <CodeBlockContent>
            {lines.map((line, index) => (
              <CodeBlockLine key={index}>{line}</CodeBlockLine>
            ))}
          </CodeBlockContent>
        </CodeBlock>
      )
    }
    const { container } = render(<Probe />)

    expect(container.querySelectorAll("[data-slot=code-block-line]")).toHaveLength(1)
    await waitFor(() =>
      expect(container.querySelector("[data-slot=code-block-line] span[style]")).not.toBeNull()
    )
    expect(container.querySelector("[data-slot=code-block-code]")!.textContent).toBe("const a = 1")
  })
})
