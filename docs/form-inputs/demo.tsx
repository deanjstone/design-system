import * as React from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

const FRUITS = ["Apple", "Banana", "Cherry", "Damson", "Elderberry"]

// ?theme=dark switches the page to the dark tokens; the default is light.
document.documentElement.classList.toggle("dark", new URLSearchParams(location.search).get("theme") === "dark")

function Demo() {
  return (
    <main>
      <section aria-labelledby="radio-heading">
        <h2 id="radio-heading">Radio group</h2>
        <RadioGroup defaultValue="comfortable" aria-labelledby="radio-heading">
          {["default", "comfortable", "compact"].map((density) => (
            <div key={density} className="flex items-center gap-2">
              <RadioGroupItem value={density} id={`density-${density}`} />
              <Label htmlFor={`density-${density}`} className="capitalize">
                {density}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </section>

      <section aria-labelledby="native-select-heading">
        <h2 id="native-select-heading">Native select</h2>
        <NativeSelect aria-labelledby="native-select-heading" defaultValue="ap-southeast-2">
          <NativeSelectOption value="us-east-1">US East</NativeSelectOption>
          <NativeSelectOption value="eu-west-1">EU West</NativeSelectOption>
          <NativeSelectOption value="ap-southeast-2">Asia Pacific (Sydney)</NativeSelectOption>
        </NativeSelect>
      </section>

      <section aria-labelledby="otp-heading">
        <h2 id="otp-heading">Input OTP</h2>
        <InputOTP maxLength={6} aria-labelledby="otp-heading" defaultValue="123">
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
      </section>

      <section aria-labelledby="combobox-heading">
        <h2 id="combobox-heading">Combobox</h2>
        <Combobox items={FRUITS}>
          <ComboboxInput placeholder="Search fruit" aria-label="Fruit" />
          <ComboboxContent>
            <ComboboxEmpty>No fruit found.</ComboboxEmpty>
            <ComboboxList>
              {(fruit: string) => (
                <ComboboxItem key={fruit} value={fruit}>
                  {fruit}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </section>
    </main>
  )
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Demo />
  </React.StrictMode>,
)
