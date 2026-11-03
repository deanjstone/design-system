import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "../registry/base-nova/ui/input-otp"

afterEach(cleanup)

function Code({ onComplete }: { onComplete?: (value: string) => void }) {
  return (
    <InputOTP maxLength={6} aria-label="Code" onComplete={onComplete}>
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  )
}

describe("InputOTP", () => {
  it("renders one slot per character and a separator between the groups", () => {
    const { container } = render(<Code />)

    expect(container.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(6)
    expect(container.querySelector('[data-slot="input-otp-separator"]')?.getAttribute("role")).toBe("separator")
  })

  it("fills the slots as digits are typed and completes at maxLength", () => {
    const onComplete = vi.fn()
    const { container } = render(<Code onComplete={onComplete} />)
    const input = container.querySelector("input") as HTMLInputElement

    fireEvent.change(input, { target: { value: "123456" } })

    const slotText = Array.from(container.querySelectorAll('[data-slot="input-otp-slot"]')).map(
      (slot) => slot.textContent,
    )
    expect(slotText).toEqual(["1", "2", "3", "4", "5", "6"])
    expect(onComplete).toHaveBeenCalledWith("123456")
  })
})
