import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "../registry/base-nova/ui/questionnaire"

afterEach(cleanup)

const items = [
  {
    name: "scope",
    required: true,
    choices: [{ value: "api" }, { value: "web" }],
  },
  { name: "notes" },
] as const

const renderForm = (onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())) =>
  render(
    <Questionnaire items={items} onSubmit={onSubmit}>
      <QuestionnaireProgress />
      <QuestionnaireItem name="scope" required>
        <QuestionnaireTitle>Which part should change?</QuestionnaireTitle>
        <QuestionnaireDescription>Pick one.</QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="api">
            API
            <QuestionnaireChoiceDescription>Server routes</QuestionnaireChoiceDescription>
          </QuestionnaireChoice>
          <QuestionnaireChoice value="web">Web</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError>Choose one to continue.</QuestionnaireError>
      </QuestionnaireItem>
      <QuestionnaireItem name="notes">
        <QuestionnaireTitle>Anything else?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireInput aria-label="Notes" />
        </QuestionnaireChoices>
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireSkip />
        <QuestionnaireNext />
        <QuestionnaireSubmit />
      </QuestionnaireActions>
    </Questionnaire>
  )

describe("Questionnaire", () => {
  it("renders items as fieldsets titled by a legend, with the upstream slots", () => {
    const { container } = renderForm()
    const item = container.querySelector("fieldset[data-slot=questionnaire-item]")!

    expect(container.querySelector("form[data-slot=questionnaire]")).not.toBeNull()
    expect(item.querySelector("legend[data-slot=questionnaire-title]")!.textContent).toBe(
      "Which part should change?"
    )
    expect(screen.getByText("Pick one.").getAttribute("data-slot")).toBe("questionnaire-description")
    expect(screen.getByText("Server routes").getAttribute("data-slot")).toBe(
      "questionnaire-choice-description"
    )
  })

  it("renders a named progressbar", () => {
    renderForm()

    expect(screen.getByRole("progressbar")).not.toBeNull()
  })

  it("renders single-choice items as radios", () => {
    renderForm()

    expect(screen.getAllByRole("radio")).toHaveLength(2)
  })

  it("blocks Next on an unanswered required item and shows its error", async () => {
    const { container } = renderForm()

    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    const item = container.querySelector("fieldset[data-slot=questionnaire-item]")!
    await waitFor(() => expect(item.getAttribute("aria-invalid")).toBe("true"))
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("Question 1 of 2")
    expect(screen.getByText("Choose one to continue.").hasAttribute("hidden")).toBe(false)
  })

  it("advances to the next item once the required one is answered", async () => {
    const { container } = renderForm()

    fireEvent.click(screen.getByRole("radio", { name: /API/ }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    await waitFor(() =>
      expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
        "Question 2 of 2"
      )
    )
    const [scope, notes] = container.querySelectorAll("fieldset[data-slot=questionnaire-item]")
    expect(scope.hasAttribute("hidden")).toBe(true)
    expect(notes.hasAttribute("hidden")).toBe(false)
  })

  it("submits the answers from the last item", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    renderForm(onSubmit)

    fireEvent.click(screen.getByRole("radio", { name: /Web/ }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    const notes = await screen.findByRole("textbox", { name: "Notes" })
    fireEvent.change(notes, { target: { value: "ship it" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit" }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
  })

  it("lets a consumer override a navigation label", () => {
    render(
      <Questionnaire items={items}>
        <QuestionnaireItem name="scope">
          <QuestionnaireTitle>Q</QuestionnaireTitle>
        </QuestionnaireItem>
        <QuestionnairePrevious>Back</QuestionnairePrevious>
        <QuestionnaireNext>Continue</QuestionnaireNext>
      </Questionnaire>
    )

    expect(screen.getByRole("button", { name: "Continue" })).not.toBeNull()
  })
})

describe("QuestionnaireChoice", () => {
  it("renders checkboxes for a multiple item and checks them independently", () => {
    render(
      <Questionnaire items={[{ name: "areas", choices: [{ value: "a" }, { value: "b" }] }]}>
        <QuestionnaireItem name="areas" multiple>
          <QuestionnaireTitle>Areas</QuestionnaireTitle>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="a">A</QuestionnaireChoice>
            <QuestionnaireChoice value="b">B</QuestionnaireChoice>
          </QuestionnaireChoices>
        </QuestionnaireItem>
      </Questionnaire>
    )
    const [first, second] = screen.getAllByRole("checkbox") as HTMLInputElement[]

    fireEvent.click(first)
    fireEvent.click(second)

    expect(first.checked).toBe(true)
    expect(second.checked).toBe(true)
  })
})
