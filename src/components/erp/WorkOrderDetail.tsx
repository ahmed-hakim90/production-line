import { useEffect, useMemo, useState } from "react"
import { ChevronRight, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { StatusBadge } from "./StatusBadge"
import { cn } from "@/lib/utils"
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

type WorkOrderDetailStatus = "قيد التنفيذ" | "مكتمل" | "موقف" | "قيد الانتظار" | "ملغي"
type TabId = "dates" | "costs" | "notes"

interface WorkOrderDetailProps {
  order: {
    id: string
    orderNumber: string
    productName: string
    productCode: string
    lineName: string
    supervisorName: string
    status: WorkOrderDetailStatus
    targetQty: number
    producedQty: number
    startDate: string
    endDate: string
    expectedDate: string
    daysRemaining: number
    avgPerDay: number
    estimatedDuration: number
    reportsCount: number
    maxWorkers: number
    plannedUnitCost: number
    actualUnitCost: number
    totalCost: number
    notes?: string
  }
  open: boolean
  onClose: () => void
  onEdit: () => void
  onClose_order: () => void
  onPrint: () => void
  /** عند أمر مكتمل: إظهار زر إعادة الفتح (صلاحية التعديل من الصفحة الأم) */
  showReopenCompleted?: boolean
  onReopenCompleted?: () => void
  /** إن وُجد، يُستخدم لشريط الإجراءات بدل الاعتماد على نص الحالة المعروض */
  storedCompleted?: boolean
}

const numberFormatter = new Intl.NumberFormat("ar-EG")
const currencyFormatter = new Intl.NumberFormat("ar-EG", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function WorkOrderDetail({
  order,
  open,
  onClose,
  onEdit,
  onClose_order,
  onPrint,
  showReopenCompleted,
  onReopenCompleted,
  storedCompleted,
}: WorkOrderDetailProps) {
  const { t } = useTranslation()
  const { dir } = useAppDirection();
  const [activeTab, setActiveTab] = useState<TabId>("dates")

  useEffect(() => {
    if (!open) return
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setActiveTab("dates")
    }
  }, [open, order.id])

  const progress = useMemo(() => {
    if (order.targetQty <= 0) return 0
    return Math.max(0, Math.min(100, Math.round((order.producedQty / order.targetQty) * 100)))
  }, [order.producedQty, order.targetQty])
  const progressValue = Number.isFinite(progress) ? progress : 0

  const remaining = Math.max(0, order.targetQty - order.producedQty)
  const isCompletedFooter =
    typeof storedCompleted === "boolean" ? storedCompleted : order.status === "مكتمل"
  const progressTone =
    progress >= 80 ? "var(--color-success)" : progress >= 50 ? "var(--color-warning)" : "var(--color-danger)"
  const daysLabel = order.daysRemaining < 0
    ? t("erpComponents.workOrderDetail.daysLate", { count: Math.abs(order.daysRemaining) })
    : t("erpComponents.workOrderDetail.daysOnly", { count: order.daysRemaining })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[220] flex" dir="ltr">
      <button
        type="button"
        aria-label={t("erpComponents.workOrderDetail.aria.closeDetails")}
        className="h-full flex-1 bg-[hsl(var(--foreground)/0.36)]"
        onClick={onClose}
      />

      <aside
        dir={dir}
        className="h-full w-[min(560px,96vw)] border-s border-[var(--color-border-ui)] bg-[var(--color-card-bg)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border-ui)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-md text-[var(--color-text-2)] hover:bg-[var(--color-page-bg)]"
              aria-label={t("erpComponents.workOrderDetail.aria.back")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--color-text-1)]">{order.orderNumber}</p>
              <p className="text-xs text-[var(--color-text-2)]">{t("erpComponents.workOrderDetail.productionOrder")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge label={order.status} dot />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-md text-[var(--color-text-2)] hover:bg-[var(--color-page-bg)]"
              aria-label={t("erpComponents.workOrderDetail.aria.close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="h-[calc(100%-128px)] overflow-y-auto">
          <section className="grid grid-cols-2 gap-2 border-b border-[var(--color-border-ui)] p-4">
            {[
              { label: t("erpComponents.workOrderDetail.fields.product"), value: order.productName },
              { label: t("erpComponents.workOrderDetail.fields.code"), value: order.productCode },
              { label: t("erpComponents.workOrderDetail.fields.productionLine"), value: order.lineName },
              { label: t("erpComponents.workOrderDetail.fields.supervisor"), value: order.supervisorName },
            ].map((item) => (
              <div key={item.label} className="rounded-md border border-[var(--color-border-ui)] bg-[var(--color-page-bg)] px-3 py-2">
                <p className="text-[11px] text-[var(--color-text-2)]">{item.label}</p>
                <p className="truncate text-sm font-medium text-[var(--color-text-1)]">{item.value || t("erpComponents.workOrderDetail.emptyValue")}</p>
              </div>
            ))}
          </section>

          <section className="space-y-3 border-b border-[var(--color-border-ui)] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--color-text-1)]">{t("erpComponents.workOrderDetail.progress")}</p>
              <p className="text-sm text-[var(--color-text-2)]">
                {numberFormatter.format(order.producedQty)} / {numberFormatter.format(order.targetQty)}
              </p>
            </div>

            <div className="relative h-3 overflow-hidden rounded-full bg-[hsl(var(--muted-foreground)/0.24)]">
              <div
                className="absolute inset-y-0 end-0 rounded-full transition-all"
                style={{
                  width: `${progressValue}%`,
                  minWidth: progressValue > 0 ? 4 : 0,
                  background: progressTone,
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: t("erpComponents.workOrderDetail.fields.requiredQty"), value: order.targetQty, tone: "var(--color-text-1)" },
                { label: t("erpComponents.workOrderDetail.fields.producedQty"), value: order.producedQty, tone: "var(--color-success)" },
                { label: t("erpComponents.workOrderDetail.fields.remainingQty"), value: remaining, tone: "var(--color-danger)" },
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-[var(--color-border-ui)] px-3 py-2">
                  <p className="text-[11px] text-[var(--color-text-2)]">{item.label}</p>
                  <p className="text-sm font-medium" style={{ color: item.tone }}>
                    {numberFormatter.format(item.value)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-b border-[var(--color-border-ui)] px-4">
            <div className="grid grid-cols-3">
              {([
                { id: "dates", label: t("erpComponents.workOrderDetail.tabs.dates") },
                { id: "costs", label: t("erpComponents.workOrderDetail.tabs.costs") },
                { id: "notes", label: t("erpComponents.workOrderDetail.tabs.notes") },
              ] as { id: TabId; label: string }[]).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "border-b px-2 py-3 text-sm transition-colors",
                    activeTab === tab.id
                      ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                      : "border-transparent text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          <section className="p-4">
            {activeTab === "dates" && (
              <div className="space-y-2">
                {[
                  { label: t("erpComponents.workOrderDetail.dates.start"), value: order.startDate || t("erpComponents.workOrderDetail.emptyValue") },
                  { label: t("erpComponents.workOrderDetail.dates.plannedEnd"), value: order.endDate || t("erpComponents.workOrderDetail.emptyValue") },
                  { label: t("erpComponents.workOrderDetail.dates.expected"), value: order.expectedDate || t("erpComponents.workOrderDetail.emptyValue") },
                  { label: t("erpComponents.workOrderDetail.dates.daysRemaining"), value: daysLabel },
                  { label: t("erpComponents.workOrderDetail.dates.avgPerDay"), value: t("erpComponents.workOrderDetail.units.unitValue", { count: numberFormatter.format(order.avgPerDay) }) },
                  { label: t("erpComponents.workOrderDetail.dates.estimatedDuration"), value: t("erpComponents.workOrderDetail.units.dayValue", { count: numberFormatter.format(order.estimatedDuration) }) },
                  { label: t("erpComponents.workOrderDetail.dates.reportsCount"), value: t("erpComponents.workOrderDetail.units.reportValue", { count: numberFormatter.format(order.reportsCount) }) },
                  { label: t("erpComponents.workOrderDetail.dates.maxWorkers"), value: t("erpComponents.workOrderDetail.units.workerValue", { count: numberFormatter.format(order.maxWorkers) }) },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded-md border border-[var(--color-border-ui)] px-3 py-2"
                  >
                    <span className="text-xs text-[var(--color-text-2)]">{row.label}</span>
                    <span
                      className={cn(
                        "text-sm",
                        row.label === t("erpComponents.workOrderDetail.dates.daysRemaining") && order.daysRemaining <= 2 ? "text-[var(--color-danger)]" : "text-[var(--color-text-1)]",
                      )}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "costs" && (
              <div className="space-y-2">
                {[
                  { label: t("erpComponents.workOrderDetail.costs.plannedUnitCost"), value: `${currencyFormatter.format(order.plannedUnitCost)} ${t("erpComponents.workOrderDetail.currencyEgp")}` },
                  { label: t("erpComponents.workOrderDetail.costs.actualUnitCost"), value: `${currencyFormatter.format(order.actualUnitCost)} ${t("erpComponents.workOrderDetail.currencyEgp")}` },
                  { label: t("erpComponents.workOrderDetail.costs.totalCost"), value: `${currencyFormatter.format(order.totalCost)} ${t("erpComponents.workOrderDetail.currencyEgp")}`, accent: true },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded-md border border-[var(--color-border-ui)] px-3 py-2"
                  >
                    <span className="text-xs text-[var(--color-text-2)]">{row.label}</span>
                    <span className={row.accent ? "text-sm text-[var(--color-primary)]" : "text-sm text-[var(--color-text-1)]"}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "notes" && (
              <div className="rounded-md border border-[var(--color-border-ui)] bg-[var(--color-page-bg)] px-3 py-3 text-sm text-[var(--color-text-1)]">
                {order.notes?.trim() ? order.notes : t("erpComponents.workOrderDetail.noNotes")}
              </div>
            )}
          </section>
        </div>

        <footer className="grid grid-cols-3 gap-2 border-t border-[var(--color-border-ui)] px-4 py-3">
          <Button type="button" variant="outline" onClick={onPrint} className="border-[var(--color-border-ui)] text-[var(--color-text-1)]">
            {t("erpComponents.workOrderDetail.actions.print")}
          </Button>
          {!isCompletedFooter ? (
            <Button
              type="button"
              variant="outline"
              onClick={onClose_order}
              className="border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-destructive/10"
            >
              {t("erpComponents.workOrderDetail.actions.closeOrder")}
            </Button>
          ) : showReopenCompleted && onReopenCompleted ? (
            <Button
              type="button"
              variant="outline"
              onClick={onReopenCompleted}
              className="border-amber-600/50 text-amber-800 hover:bg-amber-500/10 dark:text-amber-600"
            >
              {t("erpComponents.workOrderDetail.actions.reopen")}
            </Button>
          ) : (
            <div className="min-h-9" aria-hidden />
          )}
          <Button type="button" variant="default" onClick={onEdit}>
            {t("erpComponents.workOrderDetail.actions.edit")}
          </Button>
        </footer>
      </aside>
    </div>
  )
}

export type { WorkOrderDetailProps, WorkOrderDetailStatus }
