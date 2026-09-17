import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QualityCheckTemplate } from '../services/workOrderCycleService';
import { qualitySettingsService } from '../../quality/services/qualitySettingsService';
import type { QualityInspectionTemplate } from '@/types';

export function QualityReportTemplateView({ template }: { template: QualityCheckTemplate[] }) {
  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-4" aria-label="قالب فحص الجودة">
      <h2 className="font-semibold">قالب فحص الجودة لهذا الأمر</h2>
      <p className="text-sm text-muted-foreground">عرض للقراءة فقط. التعديل متاح لمدير الجودة أثناء مرحلة المسودة أو الاعتماد فقط.</p>
      <ol className="space-y-2">
        {template.map((check, idx) => (
          <li key={check.id} className="rounded-md bg-muted p-3">
            <p className="text-sm font-medium">{idx + 1}. {check.label}</p>
            <p className="text-xs text-muted-foreground">
              {check.inputType === 'number' ? 'أرقام' : 'نصوص'}
              {check.inputType === 'number' && check.minValue !== undefined && ` • من ${check.minValue}`}
              {check.inputType === 'number' && check.maxValue !== undefined && ` إلى ${check.maxValue}`}
              {check.required && ' • إلزامي'}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function QualityReportTemplateEditor({
  initialTemplate = [],
  disabled = false,
  onSave,
  productId,
  lineId,
}: {
  initialTemplate?: QualityCheckTemplate[];
  disabled?: boolean;
  onSave: (template: QualityCheckTemplate[]) => Promise<void>;
  productId?: string;
  lineId?: string;
  productName?: string;
  lineName?: string;
}) {
  const [template, setTemplate] = useState<QualityCheckTemplate[]>(initialTemplate);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newInputType, setNewInputType] = useState<'number' | 'text'>('number');
  const [newMinValue, setNewMinValue] = useState('');
  const [newMaxValue, setNewMaxValue] = useState('');
  const [newRequired, setNewRequired] = useState(true);

  const [centralTemplates, setCentralTemplates] = useState<QualityInspectionTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const [saveAsMessage, setSaveAsMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    qualitySettingsService.getSettingsHub().then(hub => {
      if (!cancelled) setCentralTemplates(hub.inspectionTemplates);
    });
    return () => { cancelled = true; };
  }, []);

  const matchingTemplates = centralTemplates.filter(candidate =>
    candidate.isActive !== false
    && (!candidate.productId || candidate.productId === productId)
    && (!candidate.lineId || candidate.lineId === lineId),
  );

  function handleLoadTemplate() {
    const selected = matchingTemplates.find(candidate => candidate.id === selectedTemplateId);
    if (!selected) return;
    const critical = new Set(selected.criticalChecks || []);
    const loaded: QualityCheckTemplate[] = (selected.checklist || []).map((label, idx) => ({
      id: `tpl-${selected.id}-${idx}-${Date.now()}`,
      label: critical.has(label) ? `${label} (حرج)` : label,
      inputType: 'text',
      required: true,
    }));
    setTemplate([...template, ...loaded]);
    setSelectedTemplateId('');
  }

  async function handleSaveAsTemplate() {
    if (!saveAsName.trim() || template.length === 0) return;
    setSaveAsBusy(true);
    setSaveAsMessage('');
    try {
      await qualitySettingsService.upsertInspectionTemplate({
        id: `tpl-${Date.now()}`,
        name: saveAsName.trim(),
        productId,
        lineId,
        checklist: template.map(check => check.label),
        criticalChecks: template.filter(check => check.required).map(check => check.label),
        isActive: true,
      });
      setSaveAsName('');
      setSaveAsMessage('تم حفظ القالب في موديول الجودة.');
    } catch (reason) {
      setSaveAsMessage((reason as Error).message || 'تعذر حفظ القالب.');
    } finally {
      setSaveAsBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    try {
      await onSave(template);
    } finally {
      setBusy(false);
    }
  }

  function handleAddCheck() {
    if (!newLabel.trim()) return;

    const newCheck: QualityCheckTemplate = {
      id: `check-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      label: newLabel.trim(),
      inputType: newInputType,
      required: newRequired,
    };

    if (newInputType === 'number') {
      if (newMinValue !== '') newCheck.minValue = Number(newMinValue);
      if (newMaxValue !== '') newCheck.maxValue = Number(newMaxValue);
    }

    setTemplate([...template, newCheck]);
    setNewLabel('');
    setNewInputType('number');
    setNewMinValue('');
    setNewMaxValue('');
    setNewRequired(true);
  }

  function handleRemoveCheck(id: string) {
    setTemplate(template.filter(check => check.id !== id));
  }

  return (
    <fieldset disabled={disabled} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <legend className="px-2 font-semibold">نموذج تقرير الجودة</legend>

      {template.length > 0 && (
        <div className="space-y-2 rounded-md bg-muted p-3">
          {template.map((check, idx) => (
            <div key={check.id} className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{idx + 1}. {check.label}</p>
                <p className="text-xs text-muted-foreground">
                  {check.inputType === 'number' ? 'أرقام' : 'نصوص'}
                  {check.inputType === 'number' && check.minValue !== undefined && ` • من ${check.minValue}`}
                  {check.inputType === 'number' && check.maxValue !== undefined && ` إلى ${check.maxValue}`}
                  {check.required && ' • إلزامي'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => handleRemoveCheck(check.id)}
                disabled={disabled}
                className="text-destructive"
              >
                حذف
              </Button>
            </div>
          ))}
        </div>
      )}

      {matchingTemplates.length > 0 && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="text-sm font-medium">قوالب الجودة المتاحة</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <select
              disabled={disabled}
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">اختر قالبًا…</option>
              {matchingTemplates.map(candidate => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
            <Button type="button" variant="outline" disabled={disabled || !selectedTemplateId} onClick={handleLoadTemplate}>
              تحميل القالب
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-md border border-border p-3">
        <p className="text-sm font-medium">إضافة معيار فحص جديد</p>

        <div>
          <label className="block text-sm mb-1">اسم المعيار</label>
          <Input
            disabled={disabled}
            placeholder="مثلاً: حجم المنتج"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm mb-1">نوع الإدخال</label>
            <select
              disabled={disabled}
              value={newInputType}
              onChange={e => {
                setNewInputType(e.target.value as 'number' | 'text');
                setNewMinValue('');
                setNewMaxValue('');
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="number">أرقام</option>
              <option value="text">نصوص</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={newRequired}
                onChange={e => setNewRequired(e.target.checked)}
              />
              <span className="text-sm">إلزامي</span>
            </label>
          </div>
        </div>

        {newInputType === 'number' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm mb-1">الحد الأدنى (اختياري)</label>
              <Input
                disabled={disabled}
                type="number"
                placeholder="0"
                value={newMinValue}
                onChange={e => setNewMinValue(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">الحد الأقصى (اختياري)</label>
              <Input
                disabled={disabled}
                type="number"
                placeholder="100"
                value={newMaxValue}
                onChange={e => setNewMaxValue(e.target.value)}
              />
            </div>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          disabled={disabled || !newLabel.trim()}
          onClick={handleAddCheck}
          className="w-full"
        >
          إضافة المعيار
        </Button>
      </div>

      <Button
        type="button"
        disabled={disabled || template.length === 0 || busy}
        onClick={() => void handleSave()}
        className="w-full"
      >
        حفظ نموذج الجودة
      </Button>

      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-sm font-medium">حفظ كقالب في موديول الجودة</p>
        <p className="text-xs text-muted-foreground">لإعادة استخدام هذه المعايير في أوامر شغل مستقبلية لنفس المنتج والخط.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            disabled={disabled}
            placeholder="اسم القالب"
            value={saveAsName}
            onChange={e => setSaveAsName(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || saveAsBusy || !saveAsName.trim() || template.length === 0}
            onClick={() => void handleSaveAsTemplate()}
          >
            حفظ كقالب
          </Button>
        </div>
        {saveAsMessage && <p className="text-sm text-muted-foreground">{saveAsMessage}</p>}
      </div>
    </fieldset>
  );
}
