import { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  tableIconActionToneClass,
  type TableIconActionTone,
} from "./TableIconAction"

interface ActionButtonProps extends ButtonProps {
  icon?: ReactNode
  /** Material Icons Round ligature — preferred for ERP consistency. */
  iconName?: string
  /** Distinctive color tone (same system as ToneActionButton). */
  tone?: TableIconActionTone
  /** Filled solid background. */
  solid?: boolean
  loading?: boolean
}

function renderIcon(icon?: ReactNode, iconName?: string) {
  if (iconName) {
    return <span className="material-icons-round text-sm" aria-hidden>{iconName}</span>
  }
  if (icon) return <span>{icon}</span>
  return null
}

export function PrimaryButton({
  children,
  icon,
  iconName,
  tone = "execute",
  solid = true,
  loading,
  className,
  disabled,
  ...props
}: ActionButtonProps) {
  const { t } = useTranslation()
  return (
    <Button
      variant="default"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium border shadow-none",
        tableIconActionToneClass(tone, solid),
        className,
      )}
      disabled={loading || disabled}
      {...props}
    >
      {loading
        ? <span className="material-icons-round text-sm animate-spin" aria-hidden>refresh</span>
        : renderIcon(icon, iconName)}
      {loading ? t("erpComponents.actionButton.loadingSave") : children}
    </Button>
  )
}

export function GhostButton({
  children,
  icon,
  iconName,
  tone = "neutral",
  solid = false,
  className,
  ...props
}: ActionButtonProps) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold border shadow-none",
        tableIconActionToneClass(tone, solid),
        className,
      )}
      {...props}
    >
      {renderIcon(icon, iconName)}
      {children}
    </Button>
  )
}

export function DangerButton({
  children,
  icon,
  iconName = "delete",
  tone = "delete",
  solid = false,
  className,
  ...props
}: ActionButtonProps) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold border shadow-none",
        tableIconActionToneClass(tone, solid),
        className,
      )}
      {...props}
    >
      {renderIcon(icon, iconName)}
      {children}
    </Button>
  )
}
