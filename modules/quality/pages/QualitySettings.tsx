import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, LoadingSkeleton } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { qualitySettingsService } from '../services/qualitySettingsService';
import type {
  QualityDefectSeverity,
  QualityInspectionTemplate,
  QualityPolicySettings,
  QualityPrintTemplateSettings,
  QualityReasonCatalogItem,
  QualityReworkPolicySettings,
  QualitySamplingPlan,
} from '@/types';

type QualitySettingsTab =
  | 'policies'
  | 'reasonCatalog'
  | 'inspectionTemplates'
  | 'samplingPlans'
  | 'reworkPolicies'
  | 'printTemplates';

const SETTINGS_TABS: { key: QualitySettingsTab; label: string; icon: string }[] = [
  { key: 'policies', label: 'السياسات', icon: 'policy' },
  { key: 'reasonCatalog', label: 'كتالوج أسباب العيوب', icon: 'category' },
  { key: 'inspectionTemplates', label: 'قوالب الفحص', icon: 'checklist' },
  { key: 'samplingPlans', label: 'خطط المعاينة', icon: 'science' },
  { key: 'reworkPolicies', label: 'سياسات إعادة التشغيل', icon: 'autorenew' },
  { key: 'printTemplates', label: 'قوالب الطباعة', icon: 'print' },
];

const SEVERITY_OPTIONS: { value: QualityDefectSeverity; label: string }[] = [
  { value: 'low', label: 'منخفض' },
  { value: 'medium', label: 'متوسط' },
  { value: 'high', label: 'مرتفع' },
  { value: 'critical', label: 'حرج' },
];

const categoryOptions = ['تشطيب', 'مقاس', 'لون', 'تجميع', 'مواد خام', 'تعبئة'];
const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const QualitySettings: React.FC = () => {
  const { can } = usePermission();
  const canManageSettings = can('quality.settings.manage');
  const canManageCatalog = can('quality.settings.manage');
  const rawProducts = useAppStore((s) => s._rawProducts);
  const rawLines = useAppStore((s) => s._rawLines);

  const [activeTab, setActiveTab] = useState<QualitySettingsTab>('policies');
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<QualityPolicySettings>({ closeRequiresQualityApproval: false });
  const [reasons, setReasons] = useState<QualityReasonCatalogItem[]>([]);
  const [savingPolicies, setSavingPolicies] = useState(false);
  const [savingReason, setSavingReason] = useState(false);
  const [message, setMessage] = useState('');

  const [reasonForm, setReasonForm] = useState({
    id: '',
    code: '',
    labelAr: '',
    category: categoryOptions[0],
    severityDefault: 'medium' as QualityDefectSeverity,
    isActive: true,
  });
  const [inspectionTemplates, setInspectionTemplates] = useState<QualityInspectionTemplate[]>([]);
  const [samplingPlans, setSamplingPlans] = useState<QualitySamplingPlan[]>([]);
  const [reworkPolicies, setReworkPolicies] = useState<QualityReworkPolicySettings>({
    autoCreateReworkOnFail: true,
    allowDirectScrap: false,
    requireCapaForCritical: true,
  });
  const [printTemplates, setPrintTemplates] = useState<QualityPrintTemplateSettings>({
    headerText: 'تقرير الجودة',
    footerText: 'تم الإنشاء بواسطة نظام الإنتاج',
    showSignatureInspector: true,
    showSignatureSupervisor: true,
    showSignatureQualityManager: true,
  });
  const [templateForm, setTemplateForm] = useState({
    id: '',
    name: '',
    productId: '',
    lineId: '',
    checklistCsv: '',
    criticalChecksCsv: '',
    isActive: true,
  });
  const [samplingForm, setSamplingForm] = useState({
    id: '',
    productId: '',
    lineId: '',
    frequencyMinutes: 60,
    sampleSize: 5,
    isActive: true,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await qualitySettingsService.seedDefaultReasons();
      const [policiesData, reasonsData, settingsHub] = await Promise.all([
        qualitySettingsService.getPolicies(),
        qualitySettingsService.getReasons(false),
        qualitySettingsService.getSettingsHub(),
      ]);
      setPolicies(policiesData);
      setReasons(reasonsData);
      setInspectionTemplates(settingsHub.inspectionTemplates ?? []);
      setSamplingPlans(settingsHub.samplingPlans ?? []);
      setReworkPolicies(settingsHub.reworkPolicies);
      setPrintTemplates(settingsHub.printTemplates);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeReasonsCount = useMemo(() => reasons.filter((item) => item.isActive).length, [reasons]);

  const onSavePolicies = async () => {
    if (!canManageSettings) return;
    setSavingPolicies(true);
    setMessage('');
    try {
      await qualitySettingsService.setPolicies(policies);
      setMessage('تم حفظ سياسات الجودة بنجاح');
    } catch {
      setMessage('تعذر حفظ سياسات الجودة');
    } finally {
      setSavingPolicies(false);
    }
  };

  const resetReasonForm = () => {
    setReasonForm({
      id: '',
      code: '',
      labelAr: '',
      category: categoryOptions[0],
      severityDefault: 'medium',
      isActive: true,
    });
  };

  const onSubmitReason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCatalog) return;
    if (!reasonForm.code.trim() || !reasonForm.labelAr.trim()) {
      setMessage('يرجى إدخال كود واسم السبب');
      return;
    }

    setSavingReason(true);
    setMessage('');
    try {
      const payload = {
        code: reasonForm.code.trim(),
        labelAr: reasonForm.labelAr.trim(),
        category: reasonForm.category.trim(),
        severityDefault: reasonForm.severityDefault,
        isActive: reasonForm.isActive,
      };

      if (reasonForm.id) {
        await qualitySettingsService.updateReason(reasonForm.id, payload);
      } else {
        await qualitySettingsService.createReason(payload);
      }

      await loadData();
      resetReasonForm();
      setMessage('تم حفظ سبب العيب');
    } catch {
      setMessage('تعذر حفظ سبب العيب');
    } finally {
      setSavingReason(false);
    }
  };

  const onEditReason = (reason: QualityReasonCatalogItem) => {
    setReasonForm({
      id: reason.id ?? '',
      code: reason.code,
      labelAr: reason.labelAr,
      category: reason.category,
      severityDefault: reason.severityDefault,
      isActive: reason.isActive,
    });
    setActiveTab('reasonCatalog');
  };

  const onDeleteReason = async (id?: string) => {
    if (!canManageCatalog || !id) return;
    if (!window.confirm('هل تريد حذف هذا السبب؟')) return;
    try {
      await qualitySettingsService.deleteReason(id);
      await loadData();
      setMessage('تم حذف سبب العيب');
    } catch {
      setMessage('تعذر حذف سبب العيب');
    }
  };

  const saveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSettings || !templateForm.name.trim()) return;
    const id = templateForm.id || `tpl-${Date.now()}`;
    await qualitySettingsService.upsertInspectionTemplate({
      id,
      name: templateForm.name.trim(),
      productId: templateForm.productId || undefined,
      lineId: templateForm.lineId || undefined,
      checklist: splitCsv(templateForm.checklistCsv),
      criticalChecks: splitCsv(templateForm.criticalChecksCsv),
      isActive: templateForm.isActive,
    });
    setTemplateForm({
      id: '',
      name: '',
      productId: '',
      lineId: '',
      checklistCsv: '',
      criticalChecksCsv: '',
      isActive: true,
    });
    await loadData();
    setMessage('تم حفظ قالب الفحص');
  };

  const saveSampling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSettings) return;
    const id = samplingForm.id || `smp-${Date.now()}`;
    await qualitySettingsService.upsertSamplingPlan({
      id,
      productId: samplingForm.productId || undefined,
      lineId: samplingForm.lineId || undefined,
      frequencyMinutes: Math.max(1, Number(samplingForm.frequencyMinutes) || 1),
      sampleSize: Math.max(1, Number(samplingForm.sampleSize) || 1),
      isActive: samplingForm.isActive,
    });
    setSamplingForm({
      id: '',
      productId: '',
      lineId: '',
      frequencyMinutes: 60,
      sampleSize: 5,
      isActive: true,
    });
    await loadData();
    setMessage('تم حفظ خطة المعاينة');
  };

  const saveReworkPolicies = async () => {
    if (!canManageSettings) return;
    await qualitySettingsService.setSettingsHub({ reworkPolicies });
    await loadData();
    setMessage('تم حفظ سياسات إعادة التشغيل');
  };

  const savePrintTemplates = async () => {
    if (!canManageSettings) return;
    await qualitySettingsService.setSettingsHub({ printTemplates });
    await loadData();
    setMessage('تم حفظ قوالب الطباعة');
  };

  if (loading) return <LoadingSkeleton type="card" rows={6} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">إعدادات الجودة</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">مركز ضبط سياسات الجودة وكتالوج أسباب العيوب.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={policies.closeRequiresQualityApproval ? 'warning' : 'neutral'}>
            إغلاق أمر الشغل: {policies.closeRequiresQualityApproval ? 'يتطلب اعتماد جودة' : 'مفتوح بدون اعتماد'}
          </Badge>
          <Badge variant="info">الأسباب الفعالة: {activeReasonsCount}</Badge>
        </div>
      </div>

      {message && (
        <Card>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{message}</p>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-2">
          {SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-md shadow-primary/30'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span className="material-icons-round text-base">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {activeTab === 'policies' && (
        <Card title="سياسات الاعتماد والإغلاق">
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">إغلاق أمر الشغل يتطلب اعتماد الجودة</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  عند التفعيل، لن يمكن تحويل أمر الشغل إلى مكتمل إلا إذا كانت حالة الجودة معتمدة.
                </p>
              </div>
              <button
                type="button"
                disabled={!canManageSettings || savingPolicies}
                onClick={() => setPolicies((prev) => ({ ...prev, closeRequiresQualityApproval: !prev.closeRequiresQualityApproval }))}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  policies.closeRequiresQualityApproval ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
                } ${!canManageSettings || savingPolicies ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition ${
                    policies.closeRequiresQualityApproval ? '-translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex justify-end">
              <Button onClick={onSavePolicies} disabled={!canManageSettings || savingPolicies}>
                <span className="material-icons-round text-sm">{savingPolicies ? 'hourglass_top' : 'save'}</span>
                <span>{savingPolicies ? 'جاري الحفظ...' : 'حفظ السياسات'}</span>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'reasonCatalog' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Card className="xl:col-span-1" title={reasonForm.id ? 'تعديل سبب عيب' : 'إضافة سبب عيب'}>
            <form onSubmit={onSubmitReason} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">الكود</label>
                <input
                  value={reasonForm.code}
                  onChange={(e) => setReasonForm((prev) => ({ ...prev, code: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  placeholder="DEF-001"
                  disabled={!canManageCatalog || savingReason}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">اسم السبب</label>
                <input
                  value={reasonForm.labelAr}
                  onChange={(e) => setReasonForm((prev) => ({ ...prev, labelAr: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  placeholder="عيب تشطيب"
                  disabled={!canManageCatalog || savingReason}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">التصنيف</label>
                <input
                  list="quality-reason-categories"
                  value={reasonForm.category}
                  onChange={(e) => setReasonForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  disabled={!canManageCatalog || savingReason}
                />
                <datalist id="quality-reason-categories">
                  {categoryOptions.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">الشدة الافتراضية</label>
                <select
                  value={reasonForm.severityDefault}
                  onChange={(e) => setReasonForm((prev) => ({ ...prev, severityDefault: e.target.value as QualityDefectSeverity }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  disabled={!canManageCatalog || savingReason}
                >
                  {SEVERITY_OPTIONS.map((severity) => (
                    <option key={severity.value} value={severity.value}>
                      {severity.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={reasonForm.isActive}
                  onChange={(e) => setReasonForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  disabled={!canManageCatalog || savingReason}
                />
                <span>نشط</span>
              </label>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={!canManageCatalog || savingReason} className="flex-1">
                  <span className="material-icons-round text-sm">{savingReason ? 'hourglass_top' : 'save'}</span>
                  <span>{reasonForm.id ? 'حفظ التعديل' : 'إضافة السبب'}</span>
                </Button>
                {reasonForm.id && (
                  <Button type="button" variant="outline" onClick={resetReasonForm}>
                    إلغاء
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <Card className="xl:col-span-2" title="قائمة أسباب العيوب">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-right py-2 px-2">الكود</th>
                    <th className="text-right py-2 px-2">السبب</th>
                    <th className="text-right py-2 px-2">التصنيف</th>
                    <th className="text-right py-2 px-2">الشدة</th>
                    <th className="text-right py-2 px-2">الحالة</th>
                    <th className="text-right py-2 px-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {reasons.map((reason) => (
                    <tr key={reason.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 px-2 font-mono text-xs">{reason.code}</td>
                      <td className="py-2 px-2">{reason.labelAr}</td>
                      <td className="py-2 px-2">{reason.category}</td>
                      <td className="py-2 px-2">{SEVERITY_OPTIONS.find((item) => item.value === reason.severityDefault)?.label}</td>
                      <td className="py-2 px-2">
                        <Badge variant={reason.isActive ? 'success' : 'neutral'}>
                          {reason.isActive ? 'نشط' : 'معطل'}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap gap-1">
                          <Button variant="outline" className="!px-2 !py-1" onClick={() => onEditReason(reason)}>
                            تعديل
                          </Button>
                          <Button
                            variant="outline"
                            className="!px-2 !py-1"
                            onClick={() => onDeleteReason(reason.id)}
                            disabled={!canManageCatalog}
                          >
                            حذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {reasons.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 dark:text-slate-400">
                        لا توجد أسباب عيوب حتى الآن.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'inspectionTemplates' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Card className="xl:col-span-1" title="إضافة/تعديل قالب فحص">
            <form className="space-y-3" onSubmit={saveTemplate}>
              <input
                value={templateForm.name}
                onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="اسم القالب"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                disabled={!canManageSettings}
              />
              <select
                value={templateForm.productId}
                onChange={(e) => setTemplateForm((p) => ({ ...p, productId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                disabled={!canManageSettings}
              >
                <option value="">كل المنتجات</option>
                {rawProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={templateForm.lineId}
                onChange={(e) => setTemplateForm((p) => ({ ...p, lineId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                disabled={!canManageSettings}
              >
                <option value="">كل الخطوط</option>
                {rawLines.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <input
                value={templateForm.checklistCsv}
                onChange={(e) => setTemplateForm((p) => ({ ...p, checklistCsv: e.target.value }))}
                placeholder="Checklist CSV"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                disabled={!canManageSettings}
              />
              <input
                value={templateForm.criticalChecksCsv}
                onChange={(e) => setTemplateForm((p) => ({ ...p, criticalChecksCsv: e.target.value }))}
                placeholder="Critical Checks CSV"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                disabled={!canManageSettings}
              />
              <Button type="submit" disabled={!canManageSettings}>حفظ القالب</Button>
            </form>
          </Card>
          <Card className="xl:col-span-2" title="قوالب الفحص">
            <div className="space-y-2">
              {inspectionTemplates.map((tpl) => (
                <div key={tpl.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm">{tpl.name}</p>
                    <p className="text-xs text-slate-500">Checklist: {tpl.checklist.join(', ') || '-'}</p>
                    <p className="text-xs text-slate-500">Critical: {tpl.criticalChecks.join(', ') || '-'}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      className="!px-2 !py-1"
                      onClick={() => setTemplateForm({
                        id: tpl.id,
                        name: tpl.name,
                        productId: tpl.productId ?? '',
                        lineId: tpl.lineId ?? '',
                        checklistCsv: tpl.checklist.join(', '),
                        criticalChecksCsv: tpl.criticalChecks.join(', '),
                        isActive: tpl.isActive,
                      })}
                    >
                      تعديل
                    </Button>
                    <Button
                      variant="outline"
                      className="!px-2 !py-1"
                      disabled={!canManageSettings}
                      onClick={async () => {
                        await qualitySettingsService.removeInspectionTemplate(tpl.id);
                        await loadData();
                      }}
                    >
                      حذف
                    </Button>
                  </div>
                </div>
              ))}
              {inspectionTemplates.length === 0 && <p className="text-sm text-slate-500">لا توجد قوالب فحص.</p>}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'samplingPlans' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Card className="xl:col-span-1" title="إضافة/تعديل خطة معاينة">
            <form className="space-y-3" onSubmit={saveSampling}>
              <select
                value={samplingForm.productId}
                onChange={(e) => setSamplingForm((p) => ({ ...p, productId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                disabled={!canManageSettings}
              >
                <option value="">كل المنتجات</option>
                {rawProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={samplingForm.lineId}
                onChange={(e) => setSamplingForm((p) => ({ ...p, lineId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                disabled={!canManageSettings}
              >
                <option value="">كل الخطوط</option>
                {rawLines.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <input
                type="number"
                value={samplingForm.frequencyMinutes}
                onChange={(e) => setSamplingForm((p) => ({ ...p, frequencyMinutes: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                disabled={!canManageSettings}
                placeholder="تكرار المعاينة بالدقائق"
              />
              <input
                type="number"
                value={samplingForm.sampleSize}
                onChange={(e) => setSamplingForm((p) => ({ ...p, sampleSize: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                disabled={!canManageSettings}
                placeholder="حجم العينة"
              />
              <Button type="submit" disabled={!canManageSettings}>حفظ خطة المعاينة</Button>
            </form>
          </Card>
          <Card className="xl:col-span-2" title="خطط المعاينة">
            <div className="space-y-2">
              {samplingPlans.map((plan) => (
                <div key={plan.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-bold">كل {plan.frequencyMinutes} دقيقة - عينة {plan.sampleSize}</p>
                    <p className="text-xs text-slate-500">Product: {plan.productId || 'الكل'} | Line: {plan.lineId || 'الكل'}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      className="!px-2 !py-1"
                      onClick={() => setSamplingForm({
                        id: plan.id,
                        productId: plan.productId ?? '',
                        lineId: plan.lineId ?? '',
                        frequencyMinutes: plan.frequencyMinutes,
                        sampleSize: plan.sampleSize,
                        isActive: plan.isActive,
                      })}
                    >
                      تعديل
                    </Button>
                    <Button
                      variant="outline"
                      className="!px-2 !py-1"
                      disabled={!canManageSettings}
                      onClick={async () => {
                        await qualitySettingsService.removeSamplingPlan(plan.id);
                        await loadData();
                      }}
                    >
                      حذف
                    </Button>
                  </div>
                </div>
              ))}
              {samplingPlans.length === 0 && <p className="text-sm text-slate-500">لا توجد خطط معاينة.</p>}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'reworkPolicies' && (
        <Card title="سياسات إعادة التشغيل">
          <div className="space-y-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={reworkPolicies.autoCreateReworkOnFail}
                onChange={(e) => setReworkPolicies((p) => ({ ...p, autoCreateReworkOnFail: e.target.checked }))}
                disabled={!canManageSettings}
              />
              <span>إنشاء Rework تلقائي عند الفشل</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={reworkPolicies.allowDirectScrap}
                onChange={(e) => setReworkPolicies((p) => ({ ...p, allowDirectScrap: e.target.checked }))}
                disabled={!canManageSettings}
              />
              <span>السماح بتحويل مباشر إلى Scrap</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={reworkPolicies.requireCapaForCritical}
                onChange={(e) => setReworkPolicies((p) => ({ ...p, requireCapaForCritical: e.target.checked }))}
                disabled={!canManageSettings}
              />
              <span>إلزام CAPA للعيوب الحرجة</span>
            </label>
            <div className="flex justify-end">
              <Button onClick={saveReworkPolicies} disabled={!canManageSettings}>حفظ سياسات Rework</Button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'printTemplates' && (
        <Card title="قوالب الطباعة">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={printTemplates.headerText}
              onChange={(e) => setPrintTemplates((p) => ({ ...p, headerText: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              placeholder="Header"
              disabled={!canManageSettings}
            />
            <input
              value={printTemplates.footerText}
              onChange={(e) => setPrintTemplates((p) => ({ ...p, footerText: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              placeholder="Footer"
              disabled={!canManageSettings}
            />
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={printTemplates.showSignatureInspector}
                onChange={(e) => setPrintTemplates((p) => ({ ...p, showSignatureInspector: e.target.checked }))}
                disabled={!canManageSettings}
              />
              <span>توقيع المفتش</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={printTemplates.showSignatureSupervisor}
                onChange={(e) => setPrintTemplates((p) => ({ ...p, showSignatureSupervisor: e.target.checked }))}
                disabled={!canManageSettings}
              />
              <span>توقيع مشرف الخط</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold md:col-span-2">
              <input
                type="checkbox"
                checked={printTemplates.showSignatureQualityManager}
                onChange={(e) => setPrintTemplates((p) => ({ ...p, showSignatureQualityManager: e.target.checked }))}
                disabled={!canManageSettings}
              />
              <span>توقيع مدير الجودة</span>
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={savePrintTemplates} disabled={!canManageSettings}>حفظ قالب الطباعة</Button>
          </div>
        </Card>
      )}
    </div>
  );
};


