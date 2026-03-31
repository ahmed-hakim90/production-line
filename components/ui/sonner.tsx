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
            "group-[.toaster]:border-emerald-300 group-[.toaster]:bg-emerald-50/95 group-[.toaster]:text-emerald-900",
          error:
            "group-[.toaster]:border-rose-300 group-[.toaster]:bg-rose-50/95 group-[.toaster]:text-rose-900",
          warning:
            "group-[.toaster]:border-amber-300 group-[.toaster]:bg-amber-50/95 group-[.toaster]:text-amber-900",
          info:
            "group-[.toaster]:border-sky-300 group-[.toaster]:bg-sky-50/95 group-[.toaster]:text-sky-900",
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
