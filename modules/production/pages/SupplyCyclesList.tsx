import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '../../../components/PageHeader';
import { Badge, SearchableSelect } from '../components/UI';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import {
  DetailPageShell,
  DetailPageStickyHeader,
  SectionSkeleton,
  SURFACE_CARD,
  NESTED_TILE,
  FIELD_ON_PANEL,
} from '@/src/components/erp/DetailPageChrome';
import { usePermission } from '../../../utils/permissions';
import type { SupplyCycle, SupplyCycleKind, SupplyCycleStatus } from '../../../types';
import {
  supplyCycleService,
  computeSupplyCycleTotals,
  aggregateReportWasteForCycle,
} from '../services/supplyCycleService';
import { formatNumber, formatOperationDateTime } from '../../../utils/calculations';
import { useAppStore } from '../../../store/useAppStore';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import type { RawMaterial } from '../../inventory/types';
import { exportSupplyCyclesListExcel } from '../../../utils/exportExcel';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import { Loader2, Package, Plus, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<SupplyCycleKind, string> = {
  raw_material: 'خام',
  finished_good: 'تام',
};

const STATUS_LABEL: Record<SupplyCycleStatus, string> = {
  draft: 'مسودة',
  open: 'مفتوح',
  closed: 'مقفل',
};

function statusBadgeVariant(s: SupplyCycleStatus): 'success' | 'warning' | 'neutral' {
  if (s === 'closed') return 'neutral';
  if (s === 'open') return 'success';
  return 'warning';
}

export const SupplyCyclesList: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const supplyBatchPrefix = useAppStore((s) => s.systemSettings.planSettings?.supplyCycleBatchCodePrefix ?? 'SC');
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'supply_cycles'),
    [exportImportSettings],
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;

  const [cycles, setCycles] = useState<SupplyCycle[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportWasteById, setReportWasteById] = useState<Record<string, number>>({});
  const [manualWasteById, setManualWasteById] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SupplyCycleStatus>('all');
  const [kindFilter, setKindFilter] = useState<'all' | SupplyCycleKind>('all');

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    kind: 'finished_good' as SupplyCycleKind,
    itemId: '',
    externalLabel: '',
    periodStart: '',
    periodEnd: '',
    openingQty: 0,
    receivedQty: 0,
    consumedQty: 0,
    status: 'draft' as SupplyCycleStatus,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, rms] = await Promise.all([supplyCycleService.list(), rawMaterialService.getAll()]);
      setCycles(list);
      setRawMaterials(rms);
      const reportNext: Record<string, number> = {};
      const manualNext: Record<string, number> = {};
      await Promise.all(
        list.map(async (c) => {
          if (!c.id) return;
          try {
            reportNext[c.id] = await aggregateReportWasteForCycle(c);
          } catch {
            reportNext[c.id] = 0;
          }
          try {
            const lines = await supplyCycleService.listWasteLines(c.id);
            manualNext[c.id] = lines.reduce((s, w) => s + (Number(w.quantity) || 0), 0);
          } catch {
            manualNext[c.id] = 0;
          }
        }),
      );
      setReportWasteById(reportNext);
      setManualWasteById(manualNext);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolveItemName = useCallback(
    (c: SupplyCycle) => {
      if (c.kind === 'raw_material') {
        const rm = rawMaterials.find((r) => r.id === c.itemId);
        return rm?.name || c.itemId;
      }
      const p = _rawProducts.find((x) => x.id === c.itemId);
      return p?.name || c.itemId;
    },
    [rawMaterials, _rawProducts],
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return cycles.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (kindFilter !== 'all' && c.kind !== kindFilter) return false;
      if (!q) return true;
      const batch = (c.batchCode || '').toLowerCase();
      const ext = (c.externalLabel || '').toLowerCase();
      const item = resolveItemName(c).toLowerCase();
      return batch.includes(q) || ext.includes(q) || item.includes(q);
    });
  }, [cycles, searchTerm, statusFilter, kindFilter, resolveItemName]);

  const stats = useMemo(() => {
    const f = filtered;
    return {
      total: f.length,
      draft: f.filter((c) => c.status === 'draft').length,
      open: f.filter((c) => c.status === 'open').length,
      closed: f.filter((c) => c.status === 'closed').length,
    };
  }, [filtered]);

  const itemOptions = useMemo(() => {
    if (form.kind === 'raw_material') {
      return rawMaterials.map((r) => ({ id: r.id!, label: `${r.name} (${r.code})` }));
    }
    return _rawProducts.map((p) => ({ id: p.id!, label: `${p.name} (${p.code})` }));
  }, [form.kind, rawMaterials, _rawProducts]);

  const searchableItemOptions = useMemo(
    () => itemOptions.map((o) => ({ value: o.id, label: o.label })),
    [itemOptions],
  );

  const openCreate = () => {
    const today = new Date().toISOString().slice(0, 10);
    setForm({
      kind: 'finished_good',
      itemId: '',
      externalLabel: '',
      periodStart: today,
      periodEnd: today,
      openingQty: 0,
      receivedQty: 0,
      consumedQty: 0,
      status: 'draft',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleCreate = async () => {
    if (!form.itemId) {
      setFormError('اختر الصنف');
      return;
    }
    if (!form.periodStart || !form.periodEnd) {
      setFormError('حدد تاريخي الفترة');
      return;
    }
    if (form.periodStart > form.periodEnd) {
      setFormError('بداية الفترة يجب أن تكون قبل أو تساوي النهاية');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const id = await supplyCycleService.create({
        kind: form.kind,
        itemId: form.itemId,
        externalLabel: form.externalLabel,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        openingQty: form.openingQty,
        receivedQty: form.receivedQty,
        consumedQty: form.consumedQty,
        status: form.status,
      });
      setShowModal(false);
      await load();
      navigate(`/supply-cycles/${id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleExportList = () => {
    const dateLabel = new Date().toISOString().slice(0, 10);
    const rows = filtered.map((c) => {
      const manual = (c.id && manualWasteById[c.id]) || 0;
      const reportW = (c.id && reportWasteById[c.id]) || 0;
      const { totalWaste, remaining } = computeSupplyCycleTotals(c, manual, reportW);
      return {
        'كود الباتش': c.batchCode,
        النوع: KIND_LABEL[c.kind],
        الصنف: resolveItemName(c),
        'تسمية خارجية': c.externalLabel || '—',
        الحالة: STATUS_LABEL[c.status],
        'من تاريخ': c.periodStart,
        'إلى تاريخ': c.periodEnd,
        'أول مدة': c.openingQty,
        وارد: c.receivedQty,
        صرف: c.consumedQty,
        'هالك يدوي': manual,
        'هالك تقارير (تقدير)': reportW,
        'هالك إجمالي': totalWaste,
        متبقي: remaining,
        'تاريخ الإنشاء': formatOperationDateTime(c.createdAt) ?? '—',
      };
    });
    exportSupplyCyclesListExcel(rows, dateLabel);
  };

  const handleDelete = async (c: SupplyCycle) => {
    if (!c.id) return;
    const ok =
      c.status === 'draft'
        ? window.confirm(`حذف الدورة ${c.batchCode}؟`)
        : window.confirm(`حذف الدورة ${c.batchCode}؟ مسموح فقط إذا كانت فارغة بدون هالك.`);
    if (!ok) return;
    try {
      await supplyCycleService.delete(c.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشل الحذف');
    }
  };

  return (
    <DetailPageShell className="max-w-[1600px] mx-auto">
      <DetailPageStickyHeader>
        <PageHeader
          title="دورات التوريد"
          subtitle="تتبع خام أو تام — فترة، أرقام، هالك تقارير ويدوي، وإقفال"
          icon="inventory_2"
          backAction={false}
          primaryAction={
            can('supplyCycles.manage')
              ? { label: 'دورة جديدة', icon: 'add', onClick: openCreate }
              : undefined
          }
          moreActions={
            canExportFromPage
              ? [{ label: 'تصدير Excel', icon: 'download', onClick: handleExportList, group: 'تصدير' }]
              : []
          }
        />
        <Card className={cn('overflow-hidden', SURFACE_CARD)}>
          <CardContent className="p-3 md:p-4">
            <SmartFilterBar
              searchPlaceholder="بحث بالكود أو الصنف أو التسمية الخارجية…"
              searchValue={searchTerm}
              onSearchChange={setSearchTerm}
              quickFilters={[
                {
                  key: 'status',
                  placeholder: 'الحالة',
                  width: '160px',
                  options: [
                    { value: 'all', label: 'كل الحالات' },
                    { value: 'draft', label: 'مسودة' },
                    { value: 'open', label: 'مفتوح' },
                    { value: 'closed', label: 'مقفل' },
                  ],
                },
                {
                  key: 'kind',
                  placeholder: 'النوع',
                  width: '140px',
                  options: [
                    { value: 'all', label: 'كل الأنواع' },
                    { value: 'raw_material', label: 'خام' },
                    { value: 'finished_good', label: 'تام' },
                  ],
                },
              ]}
              quickFilterValues={{ status: statusFilter, kind: kindFilter }}
              onQuickFilterChange={(key, value) => {
                if (key === 'status') setStatusFilter(value as 'all' | SupplyCycleStatus);
                if (key === 'kind') setKindFilter(value as 'all' | SupplyCycleKind);
              }}
            />
          </CardContent>
        </Card>
      </DetailPageStickyHeader>

      {!loading && cycles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'في النتائج', value: stats.total, icon: Package },
            { label: 'مسودة', value: stats.draft },
            { label: 'مفتوح', value: stats.open },
            { label: 'مقفل', value: stats.closed },
          ].map((tile) => (
            <div
              key={tile.label}
              className={cn('rounded-xl px-4 py-3', NESTED_TILE)}
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {'icon' in tile && tile.icon ? (
                  <tile.icon className="size-3.5 opacity-80" aria-hidden />
                ) : null}
                {tile.label}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{tile.value}</div>
            </div>
          ))}
        </div>
      )}

      <Card className={cn('overflow-hidden', SURFACE_CARD)}>
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-border dark:bg-muted/30">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground">قائمة الدورات</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            انقر على صف للانتقال إلى التفاصيل. المتبقي تقديري حتى إقفال الدورة.
          </p>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <SectionSkeleton rows={10} height={14} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Package className="size-7" />
              </div>
              <p className="text-sm font-medium text-foreground">لا توجد دورات مطابقة للفلتر</p>
              <p className="max-w-sm text-xs text-muted-foreground leading-relaxed">
                غيّر البحث أو الحالة أو أنشئ دورة جديدة لبدء تتبع الباتش.
              </p>
              {can('supplyCycles.manage') && (
                <Button type="button" onClick={openCreate} className="mt-1 gap-1.5">
                  <Plus className="size-4" />
                  دورة جديدة
                </Button>
              )}
            </div>
          ) : (
            <div className="erp-table-scroll overflow-x-auto">
              <table className="erp-table w-full text-right text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr>
                    <th>كود الباتش</th>
                    <th>النوع</th>
                    <th>الصنف</th>
                    <th>خارجي</th>
                    <th>الحالة</th>
                    <th>الفترة</th>
                    <th>أول مدة</th>
                    <th>وارد</th>
                    <th>صرف</th>
                    <th>هالك يدوي</th>
                    <th>هالك تقارير</th>
                    <th>متبقي (تقدير)</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const reportW = (c.id && reportWasteById[c.id]) || 0;
                    const manualW = (c.id && manualWasteById[c.id]) || 0;
                    const { remaining } = computeSupplyCycleTotals(c, manualW, reportW);
                    return (
                      <tr
                        key={c.id}
                        className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-muted/40"
                        onClick={() => c.id && navigate(`/supply-cycles/${c.id}`)}
                      >
                        <td className="font-mono font-semibold text-primary">{c.batchCode}</td>
                        <td>{KIND_LABEL[c.kind]}</td>
                        <td className="max-w-[200px] truncate font-medium">{resolveItemName(c)}</td>
                        <td className="max-w-[120px] truncate text-muted-foreground">{c.externalLabel || '—'}</td>
                        <td>
                          <Badge variant={statusBadgeVariant(c.status)}>{STATUS_LABEL[c.status]}</Badge>
                        </td>
                        <td className="whitespace-nowrap text-xs text-muted-foreground">
                          {c.periodStart} → {c.periodEnd}
                        </td>
                        <td className="tabular-nums">{formatNumber(c.openingQty)}</td>
                        <td className="tabular-nums">{formatNumber(c.receivedQty)}</td>
                        <td className="tabular-nums">{formatNumber(c.consumedQty)}</td>
                        <td className="tabular-nums">{formatNumber(manualW)}</td>
                        <td className="tabular-nums">{formatNumber(reportW)}</td>
                        <td className="tabular-nums font-semibold text-foreground">{formatNumber(remaining)}</td>
                        <td className="text-left" onClick={(e) => e.stopPropagation()}>
                          {can('supplyCycles.delete') && (c.status === 'draft' || c.status === 'open') && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(c)}
                              title="حذف"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={(o) => !saving && setShowModal(o)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Plus className="size-5" />
              </span>
              دورة توريد جديدة
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>النوع</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm((f) => ({ ...f, kind: v as SupplyCycleKind, itemId: '' }))}
              >
                <SelectTrigger className={cn('text-right', FIELD_ON_PANEL)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="finished_good">منتج تام</SelectItem>
                  <SelectItem value="raw_material">مادة خام</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الصنف</Label>
              <SearchableSelect
                options={searchableItemOptions}
                value={form.itemId}
                onChange={(v) => setForm((f) => ({ ...f, itemId: v }))}
                placeholder={
                  form.kind === 'finished_good' ? 'بحث بالاسم أو الكود — منتج تام' : 'بحث بالاسم أو الكود — مادة خام'
                }
                className={cn(FIELD_ON_PANEL, 'text-right')}
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                كود الباتش يُولَّد تلقائياً بصيغة {supplyBatchPrefix}-السنة-تسلسل (من إعدادات السلوك العام).
              </p>
            </div>
            <div className="space-y-2">
              <Label>تسمية خارجية (اختياري)</Label>
              <Input
                value={form.externalLabel}
                onChange={(e) => setForm((f) => ({ ...f, externalLabel: e.target.value }))}
                placeholder="مثلاً رقم أوردر"
                className={cn('text-right', FIELD_ON_PANEL)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <Input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                  className={FIELD_ON_PANEL}
                />
              </div>
              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <Input
                  type="date"
                  value={form.periodEnd}
                  onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                  className={FIELD_ON_PANEL}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>أول مدة</Label>
                <Input
                  type="number"
                  value={form.openingQty}
                  onChange={(e) => setForm((f) => ({ ...f, openingQty: Number(e.target.value) }))}
                  className={FIELD_ON_PANEL}
                />
              </div>
              <div className="space-y-2">
                <Label>وارد</Label>
                <Input
                  type="number"
                  value={form.receivedQty}
                  onChange={(e) => setForm((f) => ({ ...f, receivedQty: Number(e.target.value) }))}
                  className={FIELD_ON_PANEL}
                />
              </div>
              <div className="space-y-2">
                <Label>صرف</Label>
                <Input
                  type="number"
                  value={form.consumedQty}
                  onChange={(e) => setForm((f) => ({ ...f, consumedQty: Number(e.target.value) }))}
                  className={FIELD_ON_PANEL}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الحالة الأولية</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as SupplyCycleStatus }))}
              >
                <SelectTrigger className={FIELD_ON_PANEL}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="open">مفتوح</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formError && (
              <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button type="button" onClick={() => void handleCreate()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : 'حفظ وإنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailPageShell>
  );
};
