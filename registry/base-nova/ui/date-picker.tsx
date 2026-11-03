"use client"

import * as React from "react"
import { enAU } from "date-fns/locale"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type DatePickerProps = {
  value?: Date
  onValueChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  locale?: React.ComponentProps<typeof Calendar>["locale"]
  weekStartsOn?: React.ComponentProps<typeof Calendar>["weekStartsOn"]
}

const DEFAULT_DISPLAY_FORMAT = "PPP"

function DatePicker({
  value,
  onValueChange,
  placeholder = "Pick a date",
  disabled,
  className,
  id,
  locale = enAU,
  weekStartsOn = 1,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            disabled={disabled}
            data-slot="date-picker-trigger"
            data-empty={!value}
            className={cn(
              "w-64 justify-start font-normal data-[empty=true]:text-muted-foreground",
              className
            )}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {value ? format(value, DEFAULT_DISPLAY_FORMAT, { locale }) : placeholder}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value}
          locale={locale}
          weekStartsOn={weekStartsOn}
          onSelect={(date) => {
            onValueChange?.(date)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
export type { DatePickerProps }
