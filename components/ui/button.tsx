import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { tableIconActionToneClass, type TableIconActionTone } from "@/src/components/erp/TableIconAction"
import { resolveButtonLook } from "@/components/buttonLook"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--border-radius-base)] [font-size:var(--font-size-sm)] [font-family:var(--font-family-base)] font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        /** Heights + radius follow محرك المظهر (`--control-height*`, `--border-radius-base`). */
        default: "h-[var(--control-height-lg)] px-4 py-2",
        sm: "h-[var(--control-height)] rounded-[var(--border-radius-base)] px-3",
        /** Dense toolbar / filter actions — matches --control-height */
        filter: "h-[var(--control-height)] rounded-[var(--border-radius-base)] px-3 [font-size:var(--font-size-sm)]",
        lg: "h-[calc(var(--control-height-lg)+4px)] rounded-[var(--border-radius-lg)] px-8",
        icon: "h-[var(--control-height-lg)] w-[var(--control-height-lg)] rounded-[var(--border-radius-base)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Material Icons Round ligature — optional; auto-inferred from Arabic label when omitted. */
  iconName?: string
  /** Distinctive ERP tone — optional; auto-inferred from label when omitted. */
  tone?: TableIconActionTone
  /** Force filled solid background. */
  solid?: boolean
  /** Disable auto icon/tone inference from label. */
  bare?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      iconName,
      tone,
      solid,
      bare = false,
      children,
      ...props
    },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      )
    }

    const look =
      bare || size === "icon"
        ? iconName
          ? { icon: iconName, tone: tone ?? ("neutral" as const), solid }
          : null
        : resolveButtonLook(children, { iconName, tone, solid })

    const defaultSolid =
      variant === "default"
      || variant === "destructive"
      || variant === "secondary"
      || variant == null
    const useSolid = look?.solid ?? (solid ?? defaultSolid)

    if (look) {
      return (
        <button
          className={cn(
            buttonVariants({ variant: "outline", size }),
            "border shadow-none gap-1.5",
            tableIconActionToneClass(look.tone, useSolid),
            className,
          )}
          ref={ref}
          {...props}
        >
          {!look.skipIcon && look.icon ? (
            <span className="material-icons-round text-sm" aria-hidden>
              {look.icon}
            </span>
          ) : null}
          {children}
        </button>
      )
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
