import React, { useEffect, useState } from "react";
import { RefreshCw, Save, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission } from "@/utils/permissions";
import { useAccountingBaseData } from "../hooks/useAccountingBaseData";
import {
  REPAIR_ACCOUNT_LABELS,
  REPAIR_ACCOUNT_TYPES,
} from "../lib/accountingUi";
import type { AccountingSettings } from "../types";
import { accountingService } from "../services/accountingService";

export const AccountingSettingsPage: React.FC = () => {
  const { can } = usePermission();
  const {
    accounts,
    periods,
    settings,
    setSettings,
    readiness,
    loading,
    busy,
    run,
  } = useAccountingBaseData();
  const [branchLinks, setBranchLinks] = useState<
    Record<
      string,
      { costCenterId: string; accountingAccounts: Record<string, string> }
    >
  >({});
  const [advancedBranchIds, setAdvancedBranchIds] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!readiness) return;
    setBranchLinks(
      Object.fromEntries(
        (readiness.repairBranches || []).map((branch) => [
          branch.id,
          {
            costCenterId: branch.costCenterId,
            accountingAccounts: { ...branch.accountingAccounts },
          },
        ]),
      ),
    );
  }, [readiness]);

  if (loading || !settings) {
    return (
      <div className="erp-ds-clean space-y-5" dir="rtl">
        <PageHeader
          title="إعدادات الحسابات"
          subtitle="السنة المالية والتقريب والتقييم والفترات المحاسبية"
          icon="settings"
          backAction={false}
        />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-5" dir="rtl">
      <PageHeader
        title="إعدادات الحسابات"
        subtitle="السنة المالية والتقريب والتقييم والفترات المحاسبية"
        icon="settings"
        backAction={false}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4" />
              السياسات المحاسبية
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>العملة</Label>
              <Input
                value={settings.currency}
                onChange={(event) =>
                  setSettings(
                    (row) => row && { ...row, currency: event.target.value },
                  )
                }
              />
            </div>
            <div>
              <Label>بداية السنة المالية</Label>
              <Select
                value={String(settings.fiscalYearStartMonth)}
                onValueChange={(value) =>
                  setSettings(
                    (row) =>
                      row && {
                        ...row,
                        fiscalYearStartMonth: Number(value),
                      },
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, index) => (
                    <SelectItem key={index + 1} value={String(index + 1)}>
                      شهر {index + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>طريقة تقييم المخزون</Label>
              <Select
                value={settings.inventoryValuationMethod}
                onValueChange={(value) =>
                  setSettings(
                    (row) =>
                      row && {
                        ...row,
                        inventoryValuationMethod:
                          value as AccountingSettings["inventoryValuationMethod"],
                      },
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weighted_average">متوسط مرجح</SelectItem>
                  <SelectItem value="fifo">
                    الوارد أولًا يصرف أولًا FIFO
                  </SelectItem>
                  <SelectItem value="standard">تكلفة معيارية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>عدد الخانات العشرية</Label>
              <Input
                type="number"
                min="0"
                max="4"
                value={settings.decimalPlaces}
                onChange={(event) =>
                  setSettings(
                    (row) =>
                      row && {
                        ...row,
                        decimalPlaces: Number(event.target.value),
                      },
                  )
                }
              />
            </div>
            {(
              [
                ["autoPostInventory", "ترحيل حركات المخزون آليًا"],
                ["requireCostCenter", "إلزام مركز التكلفة"],
                ["allowManualJournals", "السماح بالقيود اليدوية"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={(event) =>
                    setSettings(
                      (row) =>
                        row && { ...row, [key]: event.target.checked },
                    )
                  }
                />
                {label}
              </label>
            ))}
            {can("accounting.settings.manage") ? (
              <Button
                className="md:col-span-2"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      accountingService.saveSettings(
                        settings as unknown as Record<string, unknown>,
                      ),
                    "تم حفظ سياسات الحسابات.",
                  )
                }
              >
                حفظ الإعدادات
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-fit shadow-none">
          <CardHeader>
            <CardTitle className="text-base">الفترات المحاسبية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 6 }, (_, index) => {
              const date = new Date();
              date.setMonth(date.getMonth() - index);
              const period = date.toISOString().slice(0, 7);
              const stored = periods.find((row) => row.period === period);
              const status = stored?.status || "open";
              return (
                <div
                  key={period}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <div>
                    <strong>{period}</strong>
                    <p className="text-xs text-muted-foreground">
                      {status === "closed"
                        ? "لا يقبل قيودًا جديدة"
                        : "مفتوحة للترحيل"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={status === "open" ? "default" : "secondary"}
                    >
                      {status === "open" ? "مفتوحة" : "مقفلة"}
                    </Badge>
                    {can("accounting.periods.manage") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              accountingService.setPeriod(
                                period,
                                status === "open" ? "closed" : "open",
                              ),
                            status === "open"
                              ? "تم إقفال الفترة."
                              : "تم إعادة فتح الفترة.",
                          )
                        }
                      >
                        {status === "open" ? "إقفال" : "إعادة فتح"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                ربط فروع الصيانة بالحسابات ومراكز التكلفة
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                اختر مركز التكلفة فقط ثم احفظ — النظام يجهّز الشجرة الافتراضية
                ويربط حسابات التحصيل والإيراد والخصم تلقائيًا. لن يُسمح بالتحصيل
                قبل اكتمال هذا الربط.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {can("accounting.accounts.manage") ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      accountingService.seedDefaults,
                      "تم استكمال الحسابات الافتراضية الناقصة دون تغيير الحسابات الحالية.",
                    )
                  }
                >
                  <RefreshCw className="ms-1 h-4 w-4" />
                  استكمال الشجرة الافتراضية
                </Button>
              ) : null}
              <Badge
                variant={
                  (readiness?.repairBranches || []).every(
                    (branch) => branch.ready,
                  )
                    ? "default"
                    : "destructive"
                }
              >
                {
                  (readiness?.repairBranches || []).filter(
                    (branch) => branch.ready,
                  ).length
                }
                /{readiness?.repairBranches.length || 0} فرع جاهز
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(readiness?.repairBranches || []).map((branch) => {
            const defaults =
              readiness?.defaultRepairAccountingAccounts || {};
            const link = branchLinks[branch.id] || {
              costCenterId: "",
              accountingAccounts: { ...defaults },
            };
            const showAdvanced = Boolean(advancedBranchIds[branch.id]);
            const linkReady = Boolean(branch.ready);
            const centerName =
              (readiness?.costCenters || []).find(
                (center) => center.id === link.costCenterId,
              )?.name || "";
            return (
              <div key={branch.id} className="rounded-xl border p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong>{branch.name}</strong>
                    <p className="text-xs text-muted-foreground">
                      {branch.code || branch.id}
                    </p>
                  </div>
                  <Badge variant={linkReady ? "default" : "destructive"}>
                    {linkReady
                      ? "جاهز محاسبيًا"
                      : "يلزم اختيار مركز تكلفة وحفظ الربط"}
                  </Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <Label>مركز تكلفة الصيانة *</Label>
                    <Select
                      value={link.costCenterId || undefined}
                      onValueChange={(value) =>
                        setBranchLinks((current) => ({
                          ...current,
                          [branch.id]: { ...link, costCenterId: value },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر مركز التكلفة" />
                      </SelectTrigger>
                      <SelectContent>
                        {(readiness?.costCenters || [])
                          .filter((center) => center.isActive)
                          .map((center) => (
                            <SelectItem key={center.id} value={center.id}>
                              {center.code ? `${center.code} — ` : ""}
                              {center.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      كل تحصيل وخصم وإيراد لهذا الفرع سيُرحَّل إلى مركز التكلفة
                      المحدد.
                      {centerName ? ` الحالي: ${centerName}.` : ""}
                    </p>
                  </div>
                  {can("accounting.settings.manage") ? (
                    <Button
                      disabled={busy || !link.costCenterId}
                      onClick={() =>
                        void run(
                          () =>
                            accountingService.linkRepairBranch({
                              branchId: branch.id,
                              costCenterId: link.costCenterId,
                              useDefaultAccounts: true,
                            }),
                          "تم ربط الفرع بالحسابات الافتراضية وأصبح جاهزًا للتحصيل.",
                        )
                      }
                    >
                      <Save className="ms-1 h-4 w-4" />
                      حفظ الربط بالحسابات الافتراضية
                    </Button>
                  ) : null}
                </div>

                <div className="mt-3 rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    الحسابات الافتراضية (تُطبَّق تلقائيًا عند الحفظ)
                  </p>
                  <p className="mt-1">
                    نقدية {defaults.cash || "111001"} · بطاقات{" "}
                    {defaults.card || "111002"} · تحويل{" "}
                    {defaults.bankTransfer || "111003"} · إيراد خدمات{" "}
                    {defaults.serviceRevenue || "411001"} · خصومات{" "}
                    {defaults.discounts || "419001"} · مخزون{" "}
                    {defaults.partsInventory || "131001"}
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-primary underline-offset-2 hover:underline"
                    onClick={() =>
                      setAdvancedBranchIds((current) => ({
                        ...current,
                        [branch.id]: !showAdvanced,
                      }))
                    }
                  >
                    {showAdvanced
                      ? "إخفاء التعديل المتقدم للحسابات"
                      : "تعديل متقدم للحسابات (محاسب)"}
                  </button>
                </div>

                {showAdvanced ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Object.entries(REPAIR_ACCOUNT_LABELS).map(
                      ([key, label]) => {
                        const selectedCode =
                          link.accountingAccounts[key] || defaults[key] || "";
                        const selectedExists = accounts.some(
                          (account) =>
                            account.code === selectedCode &&
                            account.isActive &&
                            account.allowPosting &&
                            account.type === REPAIR_ACCOUNT_TYPES[key],
                        );
                        return (
                          <div key={key}>
                            <Label>{label}</Label>
                            <Select
                              value={selectedCode || undefined}
                              onValueChange={(value) =>
                                setBranchLinks((current) => ({
                                  ...current,
                                  [branch.id]: {
                                    ...link,
                                    accountingAccounts: {
                                      ...link.accountingAccounts,
                                      [key]: value,
                                    },
                                  },
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="اختر الحساب" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedCode && !selectedExists ? (
                                  <SelectItem value={selectedCode} disabled>
                                    {selectedCode} — غير موجود/غير صالح في
                                    الشجرة
                                  </SelectItem>
                                ) : null}
                                {accounts
                                  .filter(
                                    (account) =>
                                      account.isActive &&
                                      account.allowPosting &&
                                      account.type ===
                                        REPAIR_ACCOUNT_TYPES[key],
                                  )
                                  .map((account) => (
                                    <SelectItem
                                      key={account.code}
                                      value={account.code}
                                    >
                                      {account.code} — {account.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      },
                    )}
                    {can("accounting.settings.manage") ? (
                      <div className="md:col-span-2 xl:col-span-3 flex justify-end">
                        <Button
                          variant="secondary"
                          disabled={busy || !link.costCenterId}
                          onClick={() =>
                            void run(
                              () =>
                                accountingService.linkRepairBranch({
                                  branchId: branch.id,
                                  costCenterId: link.costCenterId,
                                  useDefaultAccounts: false,
                                  accountingAccounts:
                                    link.accountingAccounts,
                                }),
                              "تم حفظ الربط بالحسابات المحددة يدويًا.",
                            )
                          }
                        >
                          حفظ الربط بالحسابات المحددة
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!readiness?.repairBranches.length ? (
            <p className="p-6 text-center text-muted-foreground">
              لا توجد فروع صيانة لربطها.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};
