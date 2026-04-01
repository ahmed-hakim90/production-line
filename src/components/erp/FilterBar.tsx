import { ReactNode } from "react"
import { Search } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface PeriodOption {
  label: string
  value: string
}

interface SelectOption {
  label: string
  value: string
}

interface FilterSelect {
  placeholder: string
  options: SelectOption[]
  value?: string
  onChange?: (v: string) => void
}

interface FilterBarProps {
  periods?: PeriodOption[]
  activePeriod?: string
  onPeriodChange?: (v: string) => void
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (v: string) => void
  selects?: FilterSelect[]
  extra?: ReactNode
  className?: string
}

/** @deprecated Use `SmartFilterBar` from the same directory for new pages. */
export function FilterBar({
  periods,
  activePeriod,
  onPeriodChange,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  selects,
  extra,
  className,
}: FilterBarProps) {
  const { t } = useTranslation()
  const resolvedPeriods = periods ?? [
    { label: t("erpComponents.filterBar.period.today"), value: "today" },
    { label: t("erpComponents.filterBar.period.yesterday"), value: "yesterday" },
    { label: t("erpComponents.filterBar.period.week"), value: "week" },
    { label: t("erpComponents.filterBar.period.month"), value: "month" },
    { label: t("erpComponents.filterBar.period.all"), value: "all" },
  ]

  return (
    <section className={cn("erp-filter-bar", className)}>
      <div className="flex flex-wrap items-center gap-2 w-full">
        {searchPlaceholder && (
          <div className="relative min-w-[160px] flex-1">
            <Search className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
            <Input
              className="erp-search-input ps-8"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </div>
        )}

        {selects?.map((s, i) => (
          <Select key={`${s.placeholder}-${i}`} value={s.value} onValueChange={s.onChange}>
            <SelectTrigger className="erp-filter-select min-w-[110px]">
              <SelectValue placeholder={s.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {s.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {(resolvedPeriods.length > 0 || extra) && (
        <div className="flex flex-wrap items-center gap-2 w-full">
          {resolvedPeriods.length > 0 && (
            <div className="erp-date-seg">
              {resolvedPeriods.map((p) => (
                <Button
                  key={p.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onPeriodChange?.(p.value)}
                  className={cn(
                    "erp-date-seg-btn",
                    activePeriod === p.value && "bg-[#4F46E5] text-white hover:bg-[#4338CA]"
                  )}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          )}

          {extra}
        </div>
      )}
    </section>
  )
}
