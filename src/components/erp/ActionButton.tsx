import { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ActionButtonProps extends ButtonProps {
  icon?: ReactNode
  loading?: boolean
}

export function PrimaryButton({
  children,
  icon,
  loading,
  className,
  disabled,
  ...props
}: ActionButtonProps) {
  const { t } = useTranslation()
  return (
    <Button
      variant="default"
      className={cn("rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA]", className)}
      disabled={loading || disabled}
      {...props}
    >
      {icon && <span>{icon}</span>}
      {loading ? t("erpComponents.actionButton.loadingSave") : children}
    </Button>
  )
}

export function GhostButton({ children, icon, className, ...props }: ActionButtonProps) {
  return (
    <Button
      variant="ghost"
      className={cn("rounded-lg border border-slate-200 px-4 py-2 text-sm font-normal text-slate-600 hover:bg-slate-50", className)}
      {...props}
    >
      {icon && <span>{icon}</span>}
      {children}
    </Button>
  )
}

export function DangerButton({ children, icon, className, ...props }: ActionButtonProps) {
  return (
    <Button
      variant="ghost"
      className={cn("rounded-lg border border-red-200 px-4 py-2 text-sm font-normal text-red-700 hover:bg-red-50", className)}
      {...props}
    >
      {icon && <span>{icon}</span>}
      {children}
    </Button>
  )
}
