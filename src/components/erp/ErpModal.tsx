import { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type ErpModalSize = "sm" | "md" | "lg" | "xl" | "full"

interface ErpModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  size?: ErpModalSize
  children: ReactNode
  footer?: ReactNode
}

const sizeClasses: Record<ErpModalSize, string> = {
  sm: "max-w-[400px]",
  md: "max-w-[560px]",
  lg: "max-w-[720px]",
  xl: "max-w-[960px]",
  full: "max-w-[95vw]",
}

export function ErpModal({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  footer,
}: ErpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "rounded-xl border border-slate-200 bg-white p-0 shadow-none",
          sizeClasses[size]
        )}
      >
        <DialogHeader className="border-b border-slate-200 px-6 py-4 text-right">
          <DialogTitle className="text-lg font-medium text-[#0F172A]">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm font-normal text-[#64748B]">{description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <DialogFooter className="border-t border-slate-200 px-6 py-3 sm:justify-start">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
