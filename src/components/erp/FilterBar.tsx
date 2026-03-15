import { ReactNode } from "react"
import { Search } from "lucide-react"

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

const DEFAULT_PERIODS: PeriodOption[] = [
  { label: "اليوم", value: "today" },
  { label: "أمس", value: "yesterday" },
  { label: "أسبوعي", value: "week" },
  { label: "شهري", value: "month" },
  { label: "الكل", value: "all" },
]

/** @deprecated Use `SmartFilterBar` from the same directory for new pages. */
export function FilterBar({
  periods = DEFAULT_PERIODS,
  activePeriod,
  onPeriodChange,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  selects,
  extra,
  className,
}: FilterBarProps) {
  return (
    <section className={cn("erp-filter-bar", className)}>
      {periods.length > 0 && (
        <div className="erp-date-seg">
          {periods.map((p) => (
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

      {selects?.map((s, i) => (
        <Select key={`${s.placeholder}-${i}`} value={s.value} onValueChange={s.onChange}>
          <SelectTrigger className="erp-filter-select w-[180px]">
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

      {searchPlaceholder && (
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
          <Input
            className="erp-search-input ps-8"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
        </div>
      )}

      {extra}
    </section>
  )
}
