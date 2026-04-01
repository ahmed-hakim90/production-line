import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"

type StatusType = "success" | "warning" | "danger" | "info" | "muted"

const styles: Record<StatusType, string> = {
  success: "border-[#059669]/30 bg-[#059669]/10 text-[#059669]",
  warning: "border-[#D97706]/30 bg-[#D97706]/10 text-[#D97706]",
  danger: "border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]",
  info: "border-[#2563EB]/30 bg-[#2563EB]/10 text-[#2563EB]",
  muted: "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]",
}

const dotColors: Record<StatusType, string> = {
  success: "bg-[#059669]",
  warning: "bg-[#D97706]",
  danger: "bg-[#DC2626]",
  info: "bg-[#4F46E5]",
  muted: "bg-[#94A3B8]",
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
    <Badge className={cn("rounded-lg border px-2.5 py-1 text-xs font-medium", styles[resolvedType], className)}>
      {dot && <span className={cn("me-1 inline-block h-1.5 w-1.5 rounded-full", dotColors[resolvedType])} />}
      {label}
    </Badge>
  )
}
