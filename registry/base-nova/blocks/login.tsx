"use client"

import * as React from "react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

type LoginProps = {
  appName: string
  description?: React.ReactNode
  /** Passkey sign-in. The button shows only when this is given. */
  onPasskeySignIn?: () => Promise<void> | void
  /** Sends a one-time sign-in link to the address. */
  onEmailLink?: (email: string) => Promise<void> | void
  /** Adds a password field. With `onEmailLink` too, the link becomes the second route. */
  onPassword?: (email: string, password: string) => Promise<void> | void
  /** Below the card's controls: help, terms, a link to another sign-in. */
  footer?: React.ReactNode
  className?: string
}

type Action = "passkey" | "password" | "link"

const GENERIC_ERROR = "Something went wrong. Try again."

// The sign-in page. It knows nothing about the auth provider: the app passes the
// handlers it supports, and a handler that throws shows its message.
function Login({ appName, description, onPasskeySignIn, onEmailLink, onPassword, footer, className }: LoginProps) {
  const emailId = React.useId()
  const passwordId = React.useId()
  const emailRef = React.useRef<HTMLInputElement>(null)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [pending, setPending] = React.useState<Action | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  const run = async (action: Action, work: () => Promise<void> | void) => {
    setPending(action)
    setError(null)
    try {
      await work()
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : GENERIC_ERROR)
      return false
    } finally {
      setPending(null)
    }
  }

  const sendLink = async () => {
    const address = email.trim()
    if (!address) {
      setError("Enter your email first.")
      emailRef.current?.focus()
      return
    }
    if (await run("link", () => onEmailLink?.(address))) setSentTo(address)
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (onPassword) void run("password", () => onPassword(email.trim(), password))
    else void sendLink()
  }

  const hasEmailForm = Boolean(onEmailLink || onPassword)
  const busy = pending !== null
  const busyIcon = (action: Action) =>
    pending === action ? <Spinner role="presentation" aria-hidden="true" data-icon="inline-start" /> : null

  return (
    <main
      data-slot="login"
      className={cn("flex min-h-dvh items-center justify-center bg-background p-4 pt-safe pb-safe text-foreground", className)}
    >
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle role="heading" aria-level={1} className="font-heading text-lg font-semibold">
            Sign in to {appName}
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {onPasskeySignIn ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={busy}
              aria-busy={pending === "passkey"}
              onClick={() => void run("passkey", onPasskeySignIn)}
            >
              {busyIcon("passkey")}
              Sign in with a passkey
            </Button>
          ) : null}
          {onPasskeySignIn && hasEmailForm ? <FieldSeparator>or</FieldSeparator> : null}
          {hasEmailForm && sentTo ? (
            <div className="flex flex-col gap-3">
              <p role="status" className="text-sm">
                Check your email. We sent a sign-in link to <strong className="font-medium">{sentTo}</strong>.
              </p>
              <Button type="button" variant="ghost" size="lg" className="w-full" onClick={() => setSentTo(null)}>
                Use a different email
              </Button>
            </div>
          ) : null}
          {hasEmailForm && !sentTo ? (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={emailId}>Email</FieldLabel>
                  <Input
                    ref={emailRef}
                    id={emailId}
                    type="email"
                    required
                    autoComplete="username webauthn"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={busy}
                  />
                </Field>
                {onPassword ? (
                  <Field>
                    <FieldLabel htmlFor={passwordId}>Password</FieldLabel>
                    <Input
                      id={passwordId}
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={busy}
                    />
                  </Field>
                ) : null}
              </FieldGroup>
              <Button
                type="submit"
                size="lg"
                variant={onPasskeySignIn ? "secondary" : "default"}
                className="w-full"
                disabled={busy}
                aria-busy={pending === (onPassword ? "password" : "link")}
              >
                {busyIcon(onPassword ? "password" : "link")}
                {onPassword ? "Sign in" : "Email me a sign-in link"}
              </Button>
              {onPassword && onEmailLink ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="w-full"
                  disabled={busy}
                  aria-busy={pending === "link"}
                  onClick={() => void sendLink()}
                >
                  {busyIcon("link")}
                  Email me a link instead
                </Button>
              ) : null}
            </form>
          ) : null}
          <FieldError>{error}</FieldError>
          {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
        </CardContent>
      </Card>
    </main>
  )
}

export { Login }
export type { LoginProps }
