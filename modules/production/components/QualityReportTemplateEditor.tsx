import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QualityCheckTemplate } from '../services/workOrderCycleService';

export function QualityReportTemplateEditor({
  initialTemplate = [],
  disabled = false,
  onSave,
}: {
  initialTemplate?: QualityCheckTemplate[];
  disabled?: boolean;
  onSave: (template: QualityCheckTemplate[]) => Promise<void>;
}) {
  const [template, setTemplate] = useState<QualityCheckTemplate[]>(initialTemplate);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newInputType, setNewInputType] = useState<'number' | 'text'>('number');
  const [newMinValue, setNewMinValue] = useState('');
  const [newMaxValue, setNewMaxValue] = useState('');
  const [newRequired, setNewRequired] = useState(true);

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
    </fieldset>
  );
}
