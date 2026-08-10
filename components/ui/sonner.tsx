import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react"
import type * as React from "react"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={{ zIndex: 10200 }}
      duration={3500}
      visibleToasts={3}
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl",
          success:
            "group-[.toaster]:border-[rgb(var(--color-success)/0.35)] group-[.toaster]:bg-[rgb(var(--color-success)/0.1)]/95 group-[.toaster]:text-[rgb(var(--color-success))]",
          error:
            "group-[.toaster]:border-[rgb(var(--color-danger)/0.35)] group-[.toaster]:bg-[rgb(var(--color-danger)/0.1)]/95 group-[.toaster]:text-[rgb(var(--color-danger))]",
          warning:
            "group-[.toaster]:border-[rgb(var(--color-warning)/0.35)] group-[.toaster]:bg-[rgb(var(--color-warning)/0.1)]/95 group-[.toaster]:text-[rgb(var(--color-warning))]",
          info:
            "group-[.toaster]:border-[rgb(var(--color-primary)/0.35)] group-[.toaster]:bg-[rgb(var(--color-primary)/0.1)]/95 group-[.toaster]:text-[rgb(var(--color-primary))]",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
