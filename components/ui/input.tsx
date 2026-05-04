import * as React from "react"

import { cn } from "@/lib/utils"
import { hideZeroForInput } from "@/lib/inputDisplayValue"

export type InputProps = React.ComponentProps<"input"> & {
  /** When true, the value `0` / `"0"` is shown instead of clearing for the placeholder. */
  showZero?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, value, defaultValue, showZero, ...props }, ref) => {
    const map = (v: InputProps["value"]) =>
      showZero || v === undefined ? v : (hideZeroForInput(v) as InputProps["value"])

    const mappedValue = value !== undefined ? map(value) : undefined
    const mappedDefault = defaultValue !== undefined ? map(defaultValue) : undefined

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
        {...(mappedValue !== undefined ? { value: mappedValue } : {})}
        {...(mappedDefault !== undefined ? { defaultValue: mappedDefault } : {})}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
