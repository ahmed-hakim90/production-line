import { ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface RowActionMenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  variant?: "danger"
  separator?: false
}

export interface RowActionMenuSeparator {
  separator: true
}

export type RowActionMenuEntry = RowActionMenuItem | RowActionMenuSeparator

interface RowActionsMenuProps {
  items: RowActionMenuEntry[]
}

export function RowActionsMenu({ items }: RowActionsMenuProps) {
  const safeItems = items.slice(0, 7)

  if (safeItems.length === 0) {
    return null
  }

  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg border border-slate-200 text-[#64748B] hover:bg-slate-50 hover:text-[#4F46E5]"
          aria-label="إجراءات الصف"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-lg border border-slate-200 bg-white p-1">
        {safeItems.map((item, index) => {
          if ("separator" in item && item.separator) {
            return <DropdownMenuSeparator key={`sep-${index}`} />
          }

          return (
            <DropdownMenuItem
              key={item.label}
              onClick={item.onClick}
              className={cn(
                "cursor-pointer rounded-md text-sm font-normal text-[#0F172A]",
                item.variant === "danger" && "text-[#DC2626] focus:text-[#DC2626]"
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
