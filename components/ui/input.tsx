import * as React from "react"

import { cn } from "@/lib/utils"
import { hideZeroForInput } from "@/lib/inputDisplayValue"
import { toEnglishDigits } from "@/lib/englishDigits"

export type InputProps = React.ComponentProps<"input"> & {
  /** When true, the value `0` / `"0"` is shown instead of clearing for the placeholder. */
  showZero?: boolean
}

function isNumericInputType(type: string | undefined, inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"]) {
  const t = (type || "text").toLowerCase()
  return (
    t === "number" ||
    t === "tel" ||
    t === "date" ||
    t === "time" ||
    t === "datetime-local" ||
    t === "month" ||
    t === "week" ||
    inputMode === "numeric" ||
    inputMode === "decimal"
  )
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, value, defaultValue, showZero, dir, lang, inputMode, onChange, ...props }, ref) => {
    const map = (v: InputProps["value"]) =>
      showZero || v === undefined ? v : (hideZeroForInput(v) as InputProps["value"])

    const numeric = isNumericInputType(type, inputMode)
    const mappedValue = value !== undefined ? map(value) : undefined
    const mappedDefault = defaultValue !== undefined ? map(defaultValue) : undefined

    const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
      if (numeric && typeof e.target.value === "string") {
        const next = toEnglishDigits(e.target.value)
        if (next !== e.target.value) {
          e.target.value = next
        }
      }
      onChange?.(e)
    }

    return (
      <input
        type={type}
        inputMode={inputMode}
        dir={dir ?? (numeric ? "ltr" : undefined)}
        lang={lang ?? (numeric ? "en" : undefined)}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          numeric && "tabular-nums",
          className
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
        {...(mappedValue !== undefined ? { value: mappedValue } : {})}
        {...(mappedDefault !== undefined ? { defaultValue: mappedDefault } : {})}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
