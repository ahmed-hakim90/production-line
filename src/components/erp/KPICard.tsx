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
  indigo: "bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))]",
  green: "bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]",
  red: "bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]",
  amber: "bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]",
  gray: "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]",
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
        "erp-kpi-card flex min-h-[108px] flex-col justify-between rounded-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] p-4",
        "shadow-[var(--shadow-desk-card)] ring-1 ring-[var(--color-text)]/[0.04] dark:ring-white/10",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {loading ? (
          <Skeleton className="h-3 w-20 rounded-md" />
        ) : (
          <p className="text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
        )}
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-[var(--border-radius-lg)]", iconBoxClasses[color])}>
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
                  "rounded-[var(--border-radius-base)] px-2 py-0.5 text-xs font-medium",
                  trendUp
                    ? "bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]"
                    : "bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]"
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
