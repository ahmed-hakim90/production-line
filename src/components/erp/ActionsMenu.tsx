import { ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

export interface ActionsMenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  variant?: "danger"
}

interface ActionsMenuProps {
  items: ActionsMenuItem[]
  triggerLabel?: string
}

export function ActionsMenu({
  items,
  triggerLabel,
}: ActionsMenuProps) {
  const { t } = useTranslation()
  const { dir } = useAppDirection()
  const resolvedTriggerLabel = triggerLabel ?? t("erpComponents.actionsMenu.triggerLabel")
  const safeItems = items.slice(0, 8)

  if (safeItems.length === 0) {
    return null
  }

  return (
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-normal text-slate-600 hover:bg-slate-50"
        >
          <MoreHorizontal className="h-4 w-4" />
          {resolvedTriggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-lg border border-slate-200 bg-white p-1">
        {safeItems.map((item) => (
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
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
