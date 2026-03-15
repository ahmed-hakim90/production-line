import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

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

const labelVariantMap: Record<string, StatusType> = {
  "يعمل حالياً": "success",
  "نشط": "success",
  "مكتمل": "success",
  "تم الإرسال": "success",
  "قيد التنفيذ": "warning",
  "في المسار": "warning",
  "قيد الاعتماد": "warning",
  "متأخر": "danger",
  "موقف": "danger",
  "لم يرسل": "danger",
  "بدون مشرف": "danger",
  "مخطط": "info",
  "ضعيف": "muted",
}

interface StatusBadgeProps {
  label: string
  type?: StatusType
  dot?: boolean
  className?: string
}

export function StatusBadge({ label, type, dot, className }: StatusBadgeProps) {
  const resolvedType = type ?? labelVariantMap[label] ?? "muted"

  return (
    <Badge className={cn("rounded-lg border px-2.5 py-1 text-xs font-medium", styles[resolvedType], className)}>
      {dot && <span className={cn("me-1 inline-block h-1.5 w-1.5 rounded-full", dotColors[resolvedType])} />}
      {label}
    </Badge>
  )
}
