
import React, { useState, useEffect, useMemo } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { formatNumber, getTodayDateString } from '../../../utils/calculations';
import { ProductionLineStatus, FirestoreProductionLine } from '../../../types';
import type { LineWorkerAssignment } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { PageHeader } from '../../../components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';


const statusOptions: { value: ProductionLineStatus; label: string }[] = [
  { value: ProductionLineStatus.ACTIVE, label: 'يعمل' },
  { value: ProductionLineStatus.INJECTION, label: 'حقن' },
  { value: ProductionLineStatus.MAINTENANCE, label: 'صيانة' },
  { value: ProductionLineStatus.IDLE, label: 'متوقف' },
  { value: ProductionLineStatus.WARNING, label: 'تنبيه' },
];

const emptyForm: Omit<FirestoreProductionLine, 'id'> = {
  name: '',
  code: '',
  dailyWorkingHours: 8,
  maxWorkers: 20,
  status: ProductionLineStatus.IDLE,
};

export const Lines: React.FC = () => {
  const { openModal } = useGlobalModalManager();
  const productionLines = useAppStore((s) => s.productionLines);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const lineStatuses = useAppStore((s) => s.lineStatuses);
  const createLine = useAppStore((s) => s.createLine);
  const updateLine = useAppStore((s) => s.updateLine);
  const deleteLine = useAppStore((s) => s.deleteLine);
  const createLineStatus = useAppStore((s) => s.createLineStatus);
  const updateLineStatus = useAppStore((s) => s.updateLineStatus);

  const { can } = usePermission();
  const navigate = useTenantNavigate();

  const [todayAssignments, setTodayAssignments] = useState<LineWorkerAssignment[]>([]);
  const [supervisorNameByLineId, setSupervisorNameByLineId] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProductionLineStatus>('all');

  useEffect(() => {
    const loadDailyData = async () => {
      const today = getTodayDateString();
      try {
        const [workersAssignments, supervisorAssignments] = await Promise.all([
          lineAssignmentService.getByDate(today),
          supervisorLineAssignmentService.getActiveByDate(today),
        ]);
        setTodayAssignments(workersAssignments);

        const nextByLine: Record<string, string> = {};
        supervisorAssignments.forEach((row) => {
          const lineId = String(row.lineId || '').trim();
          const supervisorId = String(row.supervisorId || '').trim();
          if (!lineId || !supervisorId) return;
          const supervisorName = _rawEmployees.find((e) => e.id === supervisorId)?.name
            || row.supervisorName
            || '—';
          nextByLine[lineId] = supervisorName;
        });
        setSupervisorNameByLineId(nextByLine);
      } catch {
        setTodayAssignments([]);
        setSupervisorNameByLineId({});
      }
    };
    void loadDailyData();
  }, [_rawEmployees]);

  const getTodayWorkersCount = (lineId: string) =>
    todayAssignments.filter((a) => a.lineId === lineId).length;

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // â”€â”€ Set Target Modal â”€â”€
  const [targetModal, setTargetModal] = useState<{ lineId: string; lineName: string } | null>(null);
  const [targetForm, setTargetForm] = useState({ currentProductId: '', targetTodayQty: 0, isInjectionLine: false });
  const [targetSaving, setTargetSaving] = useState(false);

  const normalizeLineCode = (value: string) => value.trim().toUpperCase();
  const normalizeArabicDigits = (value: string) =>
    value.replace(/[٠-٩]/g, (digit) => String('ظ ١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const buildCodeFromLineName = (name: string) => {
    const normalizedName = normalizeArabicDigits(name);
    const numberMatches = normalizedName.match(/\d+/g);
    if (!numberMatches?.length) return '';
    const lineNumber = Number(numberMatches[numberMatches.length - 1]);
    if (!Number.isFinite(lineNumber)) return '';
    return `LINE-${String(lineNumber).padStart(2, '0')}`;
  };
  const suggestedCode = useMemo(
    () => buildCodeFromLineName(form.name ?? ''),
    [form.name]
  );

  const openTargetModal = (lineId: string, lineName: string) => {
    const existing = lineStatuses.find((s) => s.lineId === lineId);
    setTargetForm({
      currentProductId: existing?.currentProductId ?? '',
      targetTodayQty: existing?.targetTodayQty ?? 0,
      isInjectionLine: Boolean(existing?.isInjectionLine),
    });
    setTargetModal({ lineId, lineName });
  };

  const handleSaveTarget = async () => {
    if (!targetModal) return;
    setTargetSaving(true);
    const existing = lineStatuses.find((s) => s.lineId === targetModal.lineId);
    if (existing?.id) {
      await updateLineStatus(existing.id, {
        currentProductId: targetForm.currentProductId,
        targetTodayQty: targetForm.targetTodayQty,
        isInjectionLine: targetForm.isInjectionLine,
      });
    } else {
      await createLineStatus({
        lineId: targetModal.lineId,
        currentProductId: targetForm.currentProductId,
        targetTodayQty: targetForm.targetTodayQty,
        isInjectionLine: targetForm.isInjectionLine,
      });
    }
    setTargetSaving(false);
    setTargetModal(null);
  };

  const getVariant = (status: ProductionLineStatus) => {
    switch (status) {
      case ProductionLineStatus.ACTIVE: return 'success' as const;
      case ProductionLineStatus.INJECTION: return 'warning' as const;
      case ProductionLineStatus.WARNING: return 'warning' as const;
      case ProductionLineStatus.MAINTENANCE: return 'neutral' as const;
      default: return 'neutral' as const;
    }
  };

  const getStatusLabel = (status: ProductionLineStatus) => {
    switch (status) {
      case ProductionLineStatus.ACTIVE: return 'يعمل حالياً';
      case ProductionLineStatus.INJECTION: return 'خط حقن';
      case ProductionLineStatus.WARNING: return 'تنبيه';
      case ProductionLineStatus.MAINTENANCE: return 'صيانة';
      case ProductionLineStatus.IDLE: return 'جاهز للتشغيل';
      default: return 'غير معروف';
    }
  };

  const openCreate = () => {
    openModal(MODAL_KEYS.LINES_CREATE, { source: 'lines.page' });
  };

  const openEdit = (id: string) => {
    const raw = _rawLines.find((l) => l.id === id);
    if (!raw) return;
    setEditId(id);
    setForm({
      name: raw.name,
      code: raw.code ?? buildCodeFromLineName(raw.name),
      dailyWorkingHours: raw.dailyWorkingHours,
      maxWorkers: raw.maxWorkers,
      status: raw.status,
    });
    setSaveMsg(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    const normalizedCode = normalizeLineCode((form.code ?? '').trim() || buildCodeFromLineName(form.name ?? ''));
    if (!form.name || !normalizedCode) {
      setSaveMsg({ type: 'error', text: 'اسم الخط مطلوب. أضف كود الخط أو اكتب رقمظ‹ا داخل اسم الخط (مثال: خط إنتاج 7).' });
      return;
    }

    const isDuplicateCode = _rawLines.some(
      (line) =>
        line.id !== editId &&
        normalizeLineCode(line.code ?? '') === normalizedCode
    );
    if (isDuplicateCode) {
      setSaveMsg({ type: 'error', text: 'كود الخط مستخدم بالفعل. استخدم كودظ‹ا مختلفًا.' });
      return;
    }

    const payload: Omit<FirestoreProductionLine, 'id'> = {
      ...form,
      code: normalizedCode,
    };

    setSaving(true);
    setSaveMsg(null);
    try {
      if (editId) {
        await updateLine(editId, payload);
        setSaveMsg({ type: 'success', text: 'تم حفظ تعديلات الخط بنجاح' });
      } else {
        await createLine(payload);
        setSaveMsg({ type: 'success', text: 'تم إضافة خط الإنتاج بنجاح' });
        setForm(emptyForm);
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'تعذر حفظ بيانات الخط. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteLine(id);
    setDeleteConfirmId(null);
  };

  const sortedLines = useMemo(() => {
    return [...productionLines].sort((a, b) => {
      const codeCompare = (a.code || '').localeCompare((b.code || ''), 'en', {
        numeric: true,
        sensitivity: 'base',
      });
      if (codeCompare !== 0) return codeCompare;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [productionLines]);

  const filteredLines = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return sortedLines.filter((line) => {
      const matchesStatus = statusFilter === 'all' ? true : line.status === statusFilter;
      const matchesSearch = !query
        ? true
        : `${line.name} ${line.code ?? ''}`.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [sortedLines, searchTerm, statusFilter]);

  return (
    <div className="erp-ds-clean space-y-6">
      <PageHeader
        title="خطوط الإنتاج"
        subtitle="عرض وإدارة خطوط الإنتاج فقط بأسلوب ERPNext"
        icon="linear_scale"
        primaryAction={can('lines.create') ? {
          label: 'إضافة خط إنتاج',
          icon: 'add',
          onClick: openCreate,
          dataModalKey: MODAL_KEYS.LINES_CREATE,
        } : undefined}
      />

      {productionLines.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-5xl mb-3 block opacity-30">precision_manufacturing</span>
            <p className="font-bold text-lg">لا توجد خطوط إنتاج بعد</p>
            <p className="text-sm mt-1">
              {can("lines.create")
                ? 'اضغط "إضافة خط إنتاج" لإضافة أول خط'
                : 'لا توجد خطوط إنتاج لعرضها حالياً'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="list-view-wrapper">
          <SmartFilterBar
            searchPlaceholder="ابحث باسم الخط أو الكود..."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            quickFilters={[
              {
                key: 'status',
                placeholder: 'كل الحالات',
                options: statusOptions.map((option) => ({ value: option.value, label: option.label })),
              },
            ]}
            quickFilterValues={{ status: statusFilter }}
            onQuickFilterChange={(_, value) => setStatusFilter(value as 'all' | ProductionLineStatus)}
            onApply={() => undefined}
            extra={(
              <div className="inline-flex h-[34px] items-center rounded-lg border border-slate-200 px-2.5 text-xs text-slate-500">
                إجمالي الخطوط: <span className="mx-1 font-semibold text-slate-700">{formatNumber(filteredLines.length)}</span>
              </div>
            )}
            className="mb-3"
          />

          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>الخط</th>
                  <th>الحالة</th>
                  <th>المنتج الحالي</th>
                  <th>المشرف</th>
                  <th>عمالة اليوم</th>
                  <th>الإنجاز</th>
                  <th>الكفاءة</th>
                  <th className="text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line) => {
                  const raw = _rawLines.find((l) => l.id === line.id);
                  const statusRow = lineStatuses.find((s) => s.lineId === line.id);
                  const currentProductName = _rawProducts.find((p) => p.id === statusRow?.currentProductId)?.name ?? line.currentProduct ?? '—';
                  const workersCount = getTodayWorkersCount(line.id);
                  const efficiency = Math.min(Math.max(line.efficiency || 0, 0), 100);

                  return (
                    <tr key={line.id}>
                      <td>
                        <div className="font-bold text-[var(--color-text)]">{line.name}</div>
                        <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          {line.code || raw?.code || '—'}
                        </div>
                      </td>
                      <td>
                        <Badge variant={getVariant(line.status)} pulse={line.status === ProductionLineStatus.ACTIVE}>
                          {getStatusLabel(line.status)}
                        </Badge>
                      </td>
                      <td className="font-medium">{currentProductName}</td>
                      <td>{supervisorNameByLineId[line.id] || '—'}</td>
                      <td>{workersCount > 0 ? formatNumber(workersCount) : '—'}</td>
                      <td className="font-medium">{formatNumber(line.achievement)} / {formatNumber(line.target)}</td>
                      <td className="min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="erp-progress-wrap flex-1">
                            <div className={`erp-progress-bar ${efficiency >= 80 ? 'success' : ''}`} style={{ width: `${efficiency}%` }} />
                          </div>
                          <span className={`text-xs font-bold ${efficiency >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {efficiency}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Button variant="primary" className="text-xs py-1.5 px-2.5" onClick={() => navigate(`/lines/${line.id}`)}>
                            <span className="material-icons-round text-sm">visibility</span>
                          </Button>
                          {can("lineStatus.edit") && (
                            <Button variant="outline" className="text-xs py-1.5 px-2.5" onClick={() => openTargetModal(line.id, line.name)}>
                              <span className="material-icons-round text-sm">flag</span>
                            </Button>
                          )}
                          {can("lines.edit") && (
                            <Button variant="outline" className="text-xs py-1.5 px-2.5" onClick={() => openEdit(line.id)}>
                              <span className="material-icons-round text-sm">edit</span>
                            </Button>
                          )}
                          {can("lines.delete") && (
                            <button
                              onClick={() => setDeleteConfirmId(line.id)}
                              className="p-2 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-[var(--border-radius-base)] transition-all"
                              title="حذف"
                            >
                              <span className="material-icons-round text-lg">delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredLines.length === 0 && (
            <div className="empty-state border-t border-[var(--color-border)]">
              <span className="material-icons-round">search_off</span>
              <p className="empty-state-title">لا توجد نتائج مطابقة</p>
              <p className="empty-state-sub">جرظ‘ب تغيير البحث أو فلتر الحالة</p>
            </div>
          )}
        </div>
      )}

      {/* â”€â”€ Add / Edit Modal â”€â”€ */}
      {showModal && (can("lines.create") || can("lines.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); setSaveMsg(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-lg border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-lg font-bold">{editId ? 'تعديل خط الإنتاج' : 'إضافة خط إنتاج جديد'}</h3>
              <button onClick={() => { setShowModal(false); setSaveMsg(null); }} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {saveMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  <span className="material-icons-round text-base">{saveMsg.type === 'success' ? 'check_circle' : 'error'}</span>
                  <p className="flex-1">{saveMsg.text}</p>
                  <button onClick={() => setSaveMsg(null)} className="text-current/70 hover:text-current transition-colors">
                    <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">كود الخط (اختياري)</label>
                <input
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.code ?? ''}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder={suggestedCode || 'مثال: LINE-01'}
                />
                {!form.code?.trim() && suggestedCode && (
                  <p className="text-[11px] font-bold text-slate-500">
                    سيتم توليد الكود تلقائيًا: <span className="text-primary">{suggestedCode}</span>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">اسم الخط *</label>
                <input
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: خط الإنتاج A - التعبئة"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">ساعات العمل اليومية</label>
                  <input
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={1}
                    max={24}
                    value={form.dailyWorkingHours}
                    onChange={(e) => setForm({ ...form, dailyWorkingHours: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">أقصى عدد عمال</label>
                  <input
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={1}
                    value={form.maxWorkers}
                    onChange={(e) => setForm({ ...form, maxWorkers: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">الحالة</label>
                <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as ProductionLineStatus })}>
                  <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                    <SelectValue placeholder="اختر الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowModal(false); setSaveMsg(null); }}>إلغاء</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !form.name}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">{editId ? 'save' : 'add'}</span>
                {editId ? 'حفظ التعديلات' : 'إضافة الخط'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Delete Confirmation â”€â”€ */}
      {deleteConfirmId && can("lines.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف هذا الخط؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20 transition-all flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">delete</span>
                نعمطŒ احذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Set Target Modal â”€â”€ */}
      {targetModal && can("lineStatus.edit") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setTargetModal(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">تعيين هدف اليوم</h3>
                <p className="text-xs text-[var(--color-text-muted)] font-medium mt-0.5">{targetModal.lineName}</p>
              </div>
              <button onClick={() => setTargetModal(null)} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">المنتج الحالي *</label>
                <Select value={targetForm.currentProductId || 'none'} onValueChange={(value) => setTargetForm({ ...targetForm, currentProductId: value === 'none' ? '' : value })}>
                  <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                    <SelectValue placeholder="اختر المنتج..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">اختر المنتج...</SelectItem>
                    {_rawProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">الهدف اليومي (كمية) *</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={targetForm.targetTodayQty || ''}
                  onChange={(e) => setTargetForm({ ...targetForm, targetTodayQty: Number(e.target.value) })}
                  placeholder="مثال: 500"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">إعدادات خط الحقن</label>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={targetForm.isInjectionLine}
                    onChange={(e) => setTargetForm({ ...targetForm, isInjectionLine: e.target.checked })}
                  />
                  هذا الخط يعتبر خط حقن (يظهر فقط في تقرير مكون الحقن)
                </label>
              </div>
              {targetForm.currentProductId && targetForm.targetTodayQty > 0 && (
                <div className="bg-primary/5 border border-primary/10 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
                  <span className="material-icons-round text-primary text-lg">info</span>
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    سيتم تعيين هدف <span className="font-bold text-primary">{formatNumber(targetForm.targetTodayQty)}</span> وحدة
                    من <span className="font-bold text-[var(--color-text)]">{_rawProducts.find(p => p.id === targetForm.currentProductId)?.name}</span> لهذا الخط
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setTargetModal(null)}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={handleSaveTarget}
                disabled={targetSaving}
              >
                {targetSaving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">flag</span>
                حفظ الهدف
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};




