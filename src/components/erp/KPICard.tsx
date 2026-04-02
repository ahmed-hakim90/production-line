import { BarChart3, DollarSign, TrendingUp } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type KPIColor = "indigo" | "green" | "red" | "amber" | "gray"
type KPIIcon = "trend" | "money" | "metric"

interface KPICardProps {
  label: string
  value: string | number
  unit?: string
  subValue?: string
  trend?: string
  trendUp?: boolean
  iconType?: KPIIcon
  color?: KPIColor
  loading?: boolean
  className?: string
}

const iconBoxClasses: Record<KPIColor, string> = {
  indigo: "bg-[#4F46E5]/10 text-[#4F46E5]",
  green: "bg-[#059669]/10 text-[#059669]",
  red: "bg-[#DC2626]/10 text-[#DC2626]",
  amber: "bg-[#D97706]/10 text-[#D97706]",
  gray: "bg-[#94A3B8]/15 text-[#64748B]",
}

const iconMap = {
  trend: TrendingUp,
  money: DollarSign,
  metric: BarChart3,
}

export function KPICard({
  label,
  value,
  unit,
  subValue,
  trend,
  trendUp = true,
  iconType = "metric",
  color = "indigo",
  loading = false,
  className,
}: KPICardProps) {
  const Icon = iconMap[iconType]

  return (
    <article
      className={cn(
        "flex min-h-[118px] flex-col justify-between rounded-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        "shadow-[var(--shadow-desk-card)] ring-1 ring-slate-900/[0.05] dark:ring-white/10",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {loading ? (
          <Skeleton className="h-3 w-20 rounded-md" />
        ) : (
          <p className="text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
        )}
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", iconBoxClasses[color])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <div className="space-y-1">
        {loading ? (
          <Skeleton className="h-7 w-28 rounded-md" />
        ) : (
          <div className="flex items-end gap-1.5">
            <p className="text-xl font-semibold leading-none tracking-tight text-[var(--color-text)]">{value}</p>
            {unit && <span className="text-xs font-normal text-[var(--color-text-muted)]">{unit}</span>}
          </div>
        )}

        {!loading && (subValue || trend) && (
          <div className="flex items-center gap-2">
            {subValue && <span className="text-xs font-normal text-[var(--color-text-muted)]">{subValue}</span>}
            {trend && (
              <span
                className={cn(
                  "rounded-lg px-2 py-0.5 text-xs font-medium",
                  trendUp ? "bg-[#059669]/10 text-[#059669]" : "bg-[#DC2626]/10 text-[#DC2626]"
                )}
              >
                {trend}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
