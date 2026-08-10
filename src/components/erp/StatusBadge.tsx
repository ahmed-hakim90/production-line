import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"

type StatusType = "success" | "warning" | "danger" | "info" | "muted"

/** Semantic badge surfaces — driven by theme CSS variables. */
const styles: Record<StatusType, string> = {
  success: "border-[rgb(var(--color-success)/0.3)] bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]",
  warning: "border-[rgb(var(--color-warning)/0.3)] bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]",
  danger: "border-[rgb(var(--color-danger)/0.3)] bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]",
  info: "border-[rgb(var(--color-primary)/0.3)] bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))]",
  muted: "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)]",
}

const dotColors: Record<StatusType, string> = {
  success: "bg-[rgb(var(--color-success))]",
  warning: "bg-[rgb(var(--color-warning))]",
  danger: "bg-[rgb(var(--color-danger))]",
  info: "bg-[rgb(var(--color-primary))]",
  muted: "bg-[var(--color-text-muted)]",
}

interface StatusBadgeProps {
  label: string
  type?: StatusType
  dot?: boolean
  className?: string
}

export function StatusBadge({ label, type, dot, className }: StatusBadgeProps) {
  const { t } = useTranslation()
  const labelVariantMap: Record<string, StatusType> = {
    [t("erpComponents.statusBadge.labels.currentlyWorking")]: "success",
    "يعمل حالياً": "success",
    [t("erpComponents.statusBadge.labels.active")]: "success",
    "نشط": "success",
    [t("erpComponents.statusBadge.labels.completed")]: "success",
    "مكتمل": "success",
    [t("erpComponents.statusBadge.labels.sent")]: "success",
    "تم الإرسال": "success",
    [t("erpComponents.statusBadge.labels.inProgress")]: "warning",
    "قيد التنفيذ": "warning",
    [t("erpComponents.statusBadge.labels.onTrack")]: "warning",
    "في المسار": "warning",
    [t("erpComponents.statusBadge.labels.pendingApproval")]: "warning",
    "قيد الاعتماد": "warning",
    [t("erpComponents.statusBadge.labels.delayed")]: "danger",
    "متأخر": "danger",
    [t("erpComponents.statusBadge.labels.stopped")]: "danger",
    "موقف": "danger",
    [t("erpComponents.statusBadge.labels.notSent")]: "danger",
    "لم يرسل": "danger",
    [t("erpComponents.statusBadge.labels.noSupervisor")]: "danger",
    "بدون مشرف": "danger",
    [t("erpComponents.statusBadge.labels.planned")]: "info",
    "مخطط": "info",
    [t("erpComponents.statusBadge.labels.weak")]: "muted",
    "ضعيف": "muted",
  }
  const resolvedType = type ?? labelVariantMap[label] ?? "muted"

  return (
    <Badge className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", styles[resolvedType], className)}>
      {dot && <span className={cn("me-1 inline-block h-1.5 w-1.5 rounded-full", dotColors[resolvedType])} />}
      {label}
    </Badge>
  )
}
