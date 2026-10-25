import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Login } from "../registry/base-nova/blocks/login"

afterEach(cleanup)

const typeEmail = (value: string) =>
  fireEvent.change(screen.getByLabelText("Email"), { target: { value } })

describe("Login", () => {
  it("titles the page after the app", () => {
    render(<Login appName="Reader" onEmailLink={vi.fn()} />)

    expect(screen.getByRole("heading", { level: 1, name: "Sign in to Reader" })).toBeTruthy()
  })

  it("shows a description and a footer when given", () => {
    render(
      <Login appName="Reader" description="Your library" footer={<a href="/help">Need help?</a>} onEmailLink={vi.fn()} />
    )

    expect(screen.getByText("Your library")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Need help?" })).toBeTruthy()
  })

  describe("passkey", () => {
    it("is offered only when there is a handler", () => {
      const { rerender } = render(<Login appName="Reader" onEmailLink={vi.fn()} />)
      expect(screen.queryByRole("button", { name: "Sign in with a passkey" })).toBeNull()

      rerender(<Login appName="Reader" onEmailLink={vi.fn()} onPasskeySignIn={vi.fn()} />)
      expect(screen.getByRole("button", { name: "Sign in with a passkey" })).toBeTruthy()
    })

    it("signs in when pressed, and is disabled while it works", async () => {
      let finish = () => {}
      const onPasskeySignIn = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
      render(<Login appName="Reader" onPasskeySignIn={onPasskeySignIn} />)
      const button = screen.getByRole("button", { name: "Sign in with a passkey" })

      fireEvent.click(button)

      expect(onPasskeySignIn).toHaveBeenCalledOnce()
      await waitFor(() => expect(button.hasAttribute("disabled")).toBe(true))
      expect(button.getAttribute("aria-busy")).toBe("true")

      finish()
      await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false))
    })

    it("shows the error a failed passkey sign-in throws", async () => {
      const onPasskeySignIn = vi.fn().mockRejectedValue(new Error("No passkey on this device"))
      render(<Login appName="Reader" onPasskeySignIn={onPasskeySignIn} />)

      fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }))

      expect((await screen.findByRole("alert")).textContent).toBe("No passkey on this device")
    })

    it("falls back to a generic message when the failure is not an Error", async () => {
      render(<Login appName="Reader" onPasskeySignIn={vi.fn().mockRejectedValue("nope")} />)

      fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }))

      expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.")
    })
  })

  describe("email link", () => {
    it("asks for an email that the browser can autofill a passkey into", () => {
      render(<Login appName="Reader" onEmailLink={vi.fn()} />)

      const input = screen.getByLabelText("Email") as HTMLInputElement
      expect(input.type).toBe("email")
      expect(input.required).toBe(true)
      expect(input.autocomplete).toBe("username webauthn")
    })

    it("sends the trimmed address and then confirms where the link went", async () => {
      const onEmailLink = vi.fn().mockResolvedValue(undefined)
      render(<Login appName="Reader" onEmailLink={onEmailLink} />)

      typeEmail("  dean@example.com ")
      fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }))

      expect((await screen.findByRole("status")).textContent).toContain("dean@example.com")
      expect(onEmailLink).toHaveBeenCalledWith("dean@example.com")
      expect(screen.queryByLabelText("Email")).toBeNull()
    })

    it("lets the visitor go back and use a different address", async () => {
      render(<Login appName="Reader" onEmailLink={vi.fn().mockResolvedValue(undefined)} />)
      typeEmail("dean@example.com")
      fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }))
      await screen.findByRole("status")

      fireEvent.click(screen.getByRole("button", { name: "Use a different email" }))

      expect(screen.getByLabelText("Email")).toBeTruthy()
    })

    it("shows the error and keeps the form when sending fails", async () => {
      const onEmailLink = vi.fn().mockRejectedValue(new Error("Rate limited"))
      render(<Login appName="Reader" onEmailLink={onEmailLink} />)

      typeEmail("dean@example.com")
      fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }))

      expect((await screen.findByRole("alert")).textContent).toBe("Rate limited")
      expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("dean@example.com")
    })

    it("clears an earlier error on the next attempt", async () => {
      const onEmailLink = vi.fn().mockRejectedValueOnce(new Error("Rate limited")).mockResolvedValue(undefined)
      render(<Login appName="Reader" onEmailLink={onEmailLink} />)
      typeEmail("dean@example.com")
      fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }))
      await screen.findByRole("alert")

      fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }))

      await screen.findByRole("status")
      expect(screen.queryByRole("alert")).toBeNull()
    })

    it("separates the passkey from the email form when both are offered", () => {
      render(<Login appName="Reader" onPasskeySignIn={vi.fn()} onEmailLink={vi.fn()} />)

      expect(document.querySelector("[data-slot=field-separator]")?.textContent).toBe("or")
    })

    it("has no separator when only one method is offered", () => {
      render(<Login appName="Reader" onEmailLink={vi.fn()} />)

      expect(document.querySelector("[data-slot=field-separator]")).toBeNull()
    })
  })

  describe("password", () => {
    it("asks for a password and signs in with both", async () => {
      const onPassword = vi.fn().mockResolvedValue(undefined)
      render(<Login appName="Stockade" onPassword={onPassword} />)

      const password = screen.getByLabelText("Password") as HTMLInputElement
      expect(password.type).toBe("password")
      expect(password.autocomplete).toBe("current-password")

      typeEmail("dean@example.com")
      fireEvent.change(password, { target: { value: "hunter2" } })
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      await waitFor(() => expect(onPassword).toHaveBeenCalledWith("dean@example.com", "hunter2"))
    })

    it("offers the email link as a second route beside the password", async () => {
      const onEmailLink = vi.fn().mockResolvedValue(undefined)
      render(<Login appName="Stockade" onPassword={vi.fn()} onEmailLink={onEmailLink} />)

      typeEmail("dean@example.com")
      fireEvent.click(screen.getByRole("button", { name: "Email me a link instead" }))

      await waitFor(() => expect(onEmailLink).toHaveBeenCalledWith("dean@example.com"))
    })

    it("asks for the email before sending a link", () => {
      const onEmailLink = vi.fn()
      render(<Login appName="Stockade" onPassword={vi.fn()} onEmailLink={onEmailLink} />)

      fireEvent.click(screen.getByRole("button", { name: "Email me a link instead" }))

      expect(screen.getByRole("alert").textContent).toBe("Enter your email first.")
      expect(onEmailLink).not.toHaveBeenCalled()
    })

    it("has no password field without a password handler", () => {
      render(<Login appName="Reader" onEmailLink={vi.fn()} />)

      expect(screen.queryByLabelText("Password")).toBeNull()
    })
  })

  it("keeps the buttons full width for a thumb", () => {
    render(<Login appName="Reader" onPasskeySignIn={vi.fn()} onEmailLink={vi.fn()} />)

    for (const button of screen.getAllByRole("button")) expect(button.className).toContain("w-full")
  })

  it("paints its own page background", () => {
    const { container } = render(<Login appName="Reader" />)

    expect(container.querySelector("main")?.className).toContain("bg-background")
  })

  it("renders no method controls when no handler is given", () => {
    render(<Login appName="Reader" />)

    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(screen.queryByLabelText("Email")).toBeNull()
  })
})
