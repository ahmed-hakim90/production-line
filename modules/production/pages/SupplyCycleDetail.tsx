import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '../../../components/PageHeader';
import { Badge, SearchableSelect } from '../components/UI';
import { usePermission } from '../../../utils/permissions';
import type { SupplyCycle, SupplyCycleKind, SupplyCycleStatus, SupplyCycleWasteLine } from '../../../types';
import {
  supplyCycleService,
  computeSupplyCycleTotals,
  aggregateReportWasteForCycle,
} from '../services/supplyCycleService';
import { formatNumber, formatOperationDateTime } from '../../../utils/calculations';
import { useAppStore } from '../../../store/useAppStore';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import type { RawMaterial } from '../../inventory/types';
import { exportSupplyCycleDetailExcel } from '../../../utils/exportExcel';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import { reportService } from '../services/reportService';
import { toast } from '../../../components/Toast';
import {
  DetailPageShell,
  DetailPageStickyHeader,
  DetailCollapsibleSection,
  SectionSkeleton,
  SURFACE_CARD,
  NESTED_TILE,
  FIELD_ON_PANEL,
} from '@/src/components/erp/DetailPageChrome';
import { Loader2, Lock, Pencil, Plus, Save, Trash2 } from 'lucide-react';
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
  raw_material: 'مادة خام',
  finished_good: 'منتج تام',
};

const STATUS_LABEL: Record<SupplyCycleStatus, string> = {
  draft: 'مسودة',
  open: 'مفتوح',
  closed: 'مقفل',
};

function statusVariant(s: SupplyCycleStatus): 'success' | 'warning' | 'neutral' {
  if (s === 'closed') return 'neutral';
  if (s === 'open') return 'success';
  return 'warning';
}

export const SupplyCycleDetail: React.FC = () => {
  const { cycleId } = useParams<{ cycleId: string }>();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'supply_cycles'),
    [exportImportSettings],
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;

  const [cycle, setCycle] = useState<SupplyCycle | null>(null);
  const [wasteLines, setWasteLines] = useState<SupplyCycleWasteLine[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [reportWaste, setReportWaste] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkedReportCount, setLinkedReportCount] = useState<number | null>(null);

  const [wasteQty, setWasteQty] = useState(0);
  const [wasteNote, setWasteNote] = useState('');

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
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
    if (!cycleId) return;
    setLoading(true);
    try {
      setLinkedReportCount(null);
      const [c, rms, lines] = await Promise.all([
        supplyCycleService.getById(cycleId),
        rawMaterialService.getAll(),
        supplyCycleService.listWasteLines(cycleId),
      ]);
      setRawMaterials(rms);
      setCycle(c);
      setWasteLines(lines);
      if (c) {
        try {
          const linked = await reportService.listAllBySupplyCycleId(c.id!);
          setLinkedReportCount(linked.length);
        } catch {
          setLinkedReportCount(null);
        }
        const rw = await aggregateReportWasteForCycle(c);
        setReportWaste(rw);
        setEditForm({
          kind: c.kind,
          itemId: c.itemId,
          externalLabel: c.externalLabel || '',
          periodStart: c.periodStart,
          periodEnd: c.periodEnd,
          openingQty: c.openingQty,
          receivedQty: c.receivedQty,
          consumedQty: c.consumedQty,
          status: c.status,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

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

  const resolveUidLabel = useCallback(
    (firestoreUid: string | undefined) => {
      const u = String(firestoreUid || '').trim();
      if (!u) return '—';
      const emp = _rawEmployees.find((e) => e.userId === u);
      if (emp?.name?.trim()) return emp.name.trim();
      if (uid === u && userDisplayName?.trim()) return userDisplayName.trim();
      return `مستخدم …${u.slice(-6)}`;
    },
    [_rawEmployees, uid, userDisplayName],
  );

  const manualSum = useMemo(
    () => wasteLines.reduce((s, w) => s + (Number(w.quantity) || 0), 0),
    [wasteLines],
  );

  const totals = useMemo(() => {
    if (!cycle) return { totalWaste: 0, remaining: 0 };
    if (cycle.status === 'closed' && cycle.closedWasteTotal != null && cycle.closedRemaining != null) {
      return {
        totalWaste: cycle.closedWasteTotal,
        remaining: cycle.closedRemaining,
      };
    }
    return computeSupplyCycleTotals(cycle, manualSum, reportWaste);
  }, [cycle, manualSum, reportWaste]);

  const editable = cycle && (cycle.status === 'draft' || cycle.status === 'open');
  const canEdit = Boolean(editable && can('supplyCycles.manage'));
  const canClose = Boolean(cycle && cycle.status !== 'closed' && can('supplyCycles.close'));
  const showDelete = Boolean(cycle && can('supplyCycles.delete') && cycle.status !== 'closed');

  const itemOptions = useMemo(() => {
    if (editForm.kind === 'raw_material') {
      return rawMaterials.map((r) => ({ id: r.id!, label: `${r.name} (${r.code})` }));
    }
    return _rawProducts.map((p) => ({ id: p.id!, label: `${p.name} (${p.code})` }));
  }, [editForm.kind, rawMaterials, _rawProducts]);

  const searchableEditItemOptions = useMemo(
    () => itemOptions.map((o) => ({ value: o.id, label: o.label })),
    [itemOptions],
  );

  const saveEdit = async () => {
    if (!cycle?.id || !canEdit) return;
    if (editForm.periodStart > editForm.periodEnd) {
      window.alert('بداية الفترة يجب أن تكون قبل أو تساوي النهاية');
      return;
    }
    setSaving(true);
    try {
      await supplyCycleService.update(cycle.id, {
        kind: editForm.kind,
        itemId: editForm.itemId,
        externalLabel: editForm.externalLabel,
        periodStart: editForm.periodStart,
        periodEnd: editForm.periodEnd,
        openingQty: editForm.openingQty,
        receivedQty: editForm.receivedQty,
        consumedQty: editForm.consumedQty,
        status: editForm.status,
      });
      setShowEdit(false);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشل التعديل');
    } finally {
      setSaving(false);
    }
  };

  const addWaste = async () => {
    if (!cycle?.id || cycle.status === 'closed') return;
    if (!can('supplyCycles.manage')) return;
    setSaving(true);
    try {
      await supplyCycleService.addManualWasteLine(cycle.id, wasteQty, wasteNote);
      setWasteQty(0);
      setWasteNote('');
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشل الإضافة');
    } finally {
      setSaving(false);
    }
  };

  const removeWaste = async (line: SupplyCycleWasteLine) => {
    if (!line.id || cycle?.status === 'closed') return;
    if (!window.confirm('حذف سطر الهالك؟')) return;
    setSaving(true);
    try {
      await supplyCycleService.deleteWasteLine(line.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشل الحذف');
    } finally {
      setSaving(false);
    }
  };

  const closeCycle = async () => {
    if (!cycle?.id) return;
    if (!window.confirm('إقفال الدورة؟ لن يُسمح بتعديل الأرقام أو الهالك اليدوي بعد الإقفال.')) return;
    setSaving(true);
    try {
      await supplyCycleService.close(cycle.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشل الإقفال');
    } finally {
      setSaving(false);
    }
  };

  const deleteCycle = async () => {
    if (!cycle?.id) return;
    if (!window.confirm(`حذف ${cycle.batchCode}؟`)) return;
    setSaving(true);
    try {
      await supplyCycleService.delete(cycle.id);
      navigate('/supply-cycles');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فشل الحذف');
    } finally {
      setSaving(false);
    }
  };

  const handleExportDetail = () => {
    if (!cycle) return;
    const summaryRow: Record<string, string | number> = {
      'كود الباتش': cycle.batchCode,
      النوع: KIND_LABEL[cycle.kind],
      الصنف: resolveItemName(cycle),
      'تسمية خارجية': cycle.externalLabel || '—',
      الحالة: STATUS_LABEL[cycle.status],
      'من تاريخ': cycle.periodStart,
      'إلى تاريخ': cycle.periodEnd,
      'أول مدة': cycle.openingQty,
      وارد: cycle.receivedQty,
      صرف: cycle.consumedQty,
      'هالك يدوي': manualSum,
      'هالك تقارير (تقدير)': reportWaste,
      'إجمالي الهالك': totals.totalWaste,
      المتبقي: totals.remaining,
      'تاريخ الإنشاء': formatOperationDateTime(cycle.createdAt) ?? '—',
      'منشئ الدورة': resolveUidLabel(cycle.createdByUid),
      ...(cycle.status === 'closed'
        ? {
            'تاريخ الإقفال': formatOperationDateTime(cycle.closedAt) ?? '—',
            'مُقفِل الدورة': resolveUidLabel(cycle.closedByUid),
          }
        : {}),
    };
    exportSupplyCycleDetailExcel(cycle, summaryRow, wasteLines, (w) =>
      w.source === 'manual' ? 'سطر يدوي' : `تقرير ${w.reportId || ''}`,
    );
  };

  if (!cycleId) {
    return (
      <DetailPageShell className="max-w-6xl mx-auto">
        <p className="text-center text-sm text-muted-foreground py-12">معرّف غير صالح.</p>
      </DetailPageShell>
    );
  }

  if (loading) {
    return (
      <DetailPageShell className="max-w-6xl mx-auto">
        <DetailPageStickyHeader>
          <PageHeader
            title="تفاصيل دورة التوريد"
            backAction={{ to: '/supply-cycles', label: 'رجوع' }}
            loading
          />
          <Card className={cn('overflow-hidden', SURFACE_CARD)}>
            <SectionSkeleton rows={4} height={20} />
          </Card>
        </DetailPageStickyHeader>
        <DetailCollapsibleSection title="بيانات الصنف والفترة" defaultOpen>
          <SectionSkeleton rows={5} height={14} />
        </DetailCollapsibleSection>
        <DetailCollapsibleSection title="ملخص الأرقام" defaultOpen>
          <SectionSkeleton rows={3} height={48} />
        </DetailCollapsibleSection>
      </DetailPageShell>
    );
  }

  if (!cycle) {
    return (
      <DetailPageShell className="max-w-6xl mx-auto">
        <Card className={cn('overflow-hidden', SURFACE_CARD)}>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-destructive font-medium">الدورة غير موجودة أو لا تملك صلاحية عرضها.</p>
            <Button type="button" variant="outline" onClick={() => navigate('/supply-cycles')}>
              العودة لقائمة الدورات
            </Button>
          </CardContent>
        </Card>
      </DetailPageShell>
    );
  }

  const headerExtra = (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={statusVariant(cycle.status)}>{STATUS_LABEL[cycle.status]}</Badge>
      <span className="text-xs font-medium text-muted-foreground hidden sm:inline">{KIND_LABEL[cycle.kind]}</span>
      {canClose && cycle.status !== 'closed' && (
        <Button
          type="button"
          size="sm"
          className="gap-1.5 h-8"
          onClick={() => void closeCycle()}
          disabled={saving}
        >
          <Lock className="size-3.5" />
          إقفال الدورة
        </Button>
      )}
    </div>
  );

  const kpiTiles = [
    { label: 'أول مدة', value: formatNumber(cycle.openingQty) },
    { label: 'وارد', value: formatNumber(cycle.receivedQty) },
    { label: 'صرف', value: formatNumber(cycle.consumedQty) },
    { label: 'هالك يدوي', value: formatNumber(manualSum) },
    { label: 'هالك تقارير (تقدير)', value: formatNumber(reportWaste) },
    { label: 'إجمالي الهالك', value: formatNumber(totals.totalWaste) },
  ];

  return (
    <DetailPageShell className="max-w-6xl mx-auto">
      <DetailPageStickyHeader>
        <PageHeader
          title={cycle.batchCode}
          subtitle={cycle.externalLabel || `${KIND_LABEL[cycle.kind]} · ${resolveItemName(cycle)}`}
          icon="inventory_2"
          backAction={{ to: '/supply-cycles', label: 'دورات التوريد' }}
          primaryAction={
            canEdit ? { label: 'تعديل', icon: 'edit', onClick: () => setShowEdit(true) } : undefined
          }
          moreActions={[
            ...(canExportFromPage
              ? [{ label: 'تصدير Excel', icon: 'download', onClick: handleExportDetail, group: 'تصدير' as const }]
              : []),
            ...(showDelete
              ? [
                  {
                    label: 'حذف الدورة',
                    icon: 'delete',
                    onClick: () => void deleteCycle(),
                    group: 'خطر' as const,
                    danger: true,
                  },
                ]
              : []),
          ]}
          extra={headerExtra}
        />

        <Card className={cn('overflow-hidden', SURFACE_CARD)}>
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">المتبقي</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{formatNumber(totals.remaining)}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  أول مدة + وارد − صرف − هالك (تقدير حتى الإقفال)
                </p>
              </div>
              <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', 'min-w-0 sm:max-w-md')}>
                {kpiTiles.slice(0, 3).map((k) => (
                  <div key={k.label} className={cn('px-3 py-2', NESTED_TILE)}>
                    <p className="text-[10px] font-medium text-muted-foreground">{k.label}</p>
                    <p className="text-sm font-semibold tabular-nums">{k.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </DetailPageStickyHeader>

      <DetailCollapsibleSection title="بيانات الصنف والفترة" defaultOpen>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-border/60 dark:bg-muted/25">
            <dt className="text-muted-foreground">الصنف</dt>
            <dd className="font-medium text-end">{resolveItemName(cycle)}</dd>
          </div>
          <div className="flex justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-border/60 dark:bg-muted/25">
            <dt className="text-muted-foreground">الفترة</dt>
            <dd className="text-end">
              {cycle.periodStart} → {cycle.periodEnd}
            </dd>
          </div>
          {cycle.externalLabel ? (
            <div className="flex justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 sm:col-span-2 dark:border-border/60 dark:bg-muted/25">
              <dt className="text-muted-foreground">تسمية خارجية</dt>
              <dd className="text-end">{cycle.externalLabel}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-border/60 dark:bg-muted/25">
            <dt className="text-muted-foreground">تاريخ الإنشاء</dt>
            <dd className="text-end">{formatOperationDateTime(cycle.createdAt) ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-border/60 dark:bg-muted/25">
            <dt className="text-muted-foreground">منشئ الدورة</dt>
            <dd className="text-sm font-medium text-end">{resolveUidLabel(cycle.createdByUid)}</dd>
          </div>
          {cycle.status === 'closed' && (
            <>
              <div className="flex justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-border/60 dark:bg-muted/25">
                <dt className="text-muted-foreground">تاريخ الإقفال</dt>
                <dd className="text-end">{formatOperationDateTime(cycle.closedAt) ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-border/60 dark:bg-muted/25">
                <dt className="text-muted-foreground">مُقفِل الدورة</dt>
                <dd className="text-sm font-medium text-end">{resolveUidLabel(cycle.closedByUid)}</dd>
              </div>
            </>
          )}
        </dl>
      </DetailCollapsibleSection>

      <DetailCollapsibleSection title="ملخص الأرقام" defaultOpen>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {kpiTiles.map((k) => (
            <div key={k.label} className={cn('space-y-1 p-3', NESTED_TILE)}>
              <p className="text-[11px] font-medium text-muted-foreground leading-tight">{k.label}</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{k.value}</p>
            </div>
          ))}
        </div>
        <div className={cn('mt-4 p-4 rounded-xl border-2 border-primary/20 bg-primary/5', NESTED_TILE)}>
          <p className="text-[11px] font-semibold text-muted-foreground">المتبقي (أول + وارد − صرف − هالك)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatNumber(totals.remaining)}</p>
        </div>
      </DetailCollapsibleSection>

      <DetailCollapsibleSection title="الربط والمخزون وترحيل أول المدة" defaultOpen>
        <div className="space-y-3 text-sm">
          <p>
            <span className="text-muted-foreground">تقارير إنتاج مربوطة بهذه الدورة:</span>{' '}
            <span className="font-bold tabular-nums text-foreground">{linkedReportCount ?? '—'}</span>
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            من صفحة التقارير يمكن اختيار «دورة توريد» عند الحفظ؛ عندها يُحسب هالك التقارير من هذه التقارير المحددة بدل
            التقدير بالتاريخ فقط.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/inventory/transactions')}>
              فتح حركات المخزون
            </Button>
            {cycle.status === 'closed' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(String(totals.remaining));
                  toast.success('تم نسخ المتبقي — الصقه كأول مدة في دورة جديدة عند الحاجة.');
                }}
              >
                نسخ المتبقي لترحيل أول المدة
              </Button>
            )}
          </div>
        </div>
      </DetailCollapsibleSection>

      <DetailCollapsibleSection title="الهالك اليدوي" defaultOpen>
        {cycle.status === 'closed' ? (
          <p className="text-sm text-muted-foreground mb-4">
            الدورة مقفلة — لا يمكن إضافة أو تعديل سطور الهالك اليدوي.
          </p>
        ) : (
          canEdit && (
            <div
              className={cn(
                'flex flex-wrap items-end gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-border',
              )}
            >
              <div className="w-32 space-y-2">
                <Label>الكمية</Label>
                <Input
                  type="number"
                  className={FIELD_ON_PANEL}
                  value={wasteQty}
                  onChange={(e) => setWasteQty(Number(e.target.value))}
                />
              </div>
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label>ملاحظة (اختياري)</Label>
                <Input
                  className={FIELD_ON_PANEL}
                  value={wasteNote}
                  onChange={(e) => setWasteNote(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => void addWaste()} disabled={saving} className="gap-1.5">
                <Plus className="size-4" />
                إضافة هالك
              </Button>
            </div>
          )
        )}
        <div className="erp-table-scroll overflow-x-auto rounded-lg border border-slate-200 dark:border-border">
          <table className="erp-table w-full text-right text-sm border-collapse min-w-[480px]">
            <thead>
              <tr>
                <th>المصدر</th>
                <th>الكمية</th>
                <th>ملاحظة</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {wasteLines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-8">
                    لا توجد سطور هالك يدوية.
                  </td>
                </tr>
              ) : (
                wasteLines.map((w) => (
                  <tr key={w.id}>
                    <td>{w.source === 'manual' ? 'يدوي' : 'تقرير إنتاج'}</td>
                    <td className="tabular-nums font-medium">{formatNumber(w.quantity)}</td>
                    <td className="text-muted-foreground">{w.note || '—'}</td>
                    <td className="text-left">
                      {canEdit && cycle.status !== 'closed' && w.source === 'manual' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => void removeWaste(w)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DetailCollapsibleSection>

      <Dialog open={showEdit && canEdit} onOpenChange={(o) => !saving && setShowEdit(o)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Pencil className="size-5" />
              </span>
              تعديل الدورة
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>النوع</Label>
              <Select
                value={editForm.kind}
                onValueChange={(v) =>
                  setEditForm((f) => ({ ...f, kind: v as SupplyCycleKind, itemId: '' }))
                }
              >
                <SelectTrigger className={FIELD_ON_PANEL}>
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
                options={searchableEditItemOptions}
                value={editForm.itemId}
                onChange={(v) => setEditForm((f) => ({ ...f, itemId: v }))}
                placeholder={
                  editForm.kind === 'finished_good'
                    ? 'بحث بالاسم أو الكود — منتج تام'
                    : 'بحث بالاسم أو الكود — مادة خام'
                }
                className={cn(FIELD_ON_PANEL, 'text-right')}
              />
            </div>
            <div className="space-y-2">
              <Label>تسمية خارجية</Label>
              <Input
                className={FIELD_ON_PANEL}
                value={editForm.externalLabel}
                onChange={(e) => setEditForm((f) => ({ ...f, externalLabel: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <Input
                  type="date"
                  className={FIELD_ON_PANEL}
                  value={editForm.periodStart}
                  onChange={(e) => setEditForm((f) => ({ ...f, periodStart: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <Input
                  type="date"
                  className={FIELD_ON_PANEL}
                  value={editForm.periodEnd}
                  onChange={(e) => setEditForm((f) => ({ ...f, periodEnd: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>أول مدة</Label>
                <Input
                  type="number"
                  className={FIELD_ON_PANEL}
                  value={editForm.openingQty}
                  onChange={(e) => setEditForm((f) => ({ ...f, openingQty: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>وارد</Label>
                <Input
                  type="number"
                  className={FIELD_ON_PANEL}
                  value={editForm.receivedQty}
                  onChange={(e) => setEditForm((f) => ({ ...f, receivedQty: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>صرف</Label>
                <Input
                  type="number"
                  className={FIELD_ON_PANEL}
                  value={editForm.consumedQty}
                  onChange={(e) => setEditForm((f) => ({ ...f, consumedQty: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as SupplyCycleStatus }))}
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
          </div>
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button type="button" variant="outline" onClick={() => setShowEdit(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailPageShell>
  );
};
