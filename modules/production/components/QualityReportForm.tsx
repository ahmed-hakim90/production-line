import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QualityCheckTemplate } from '../services/workOrderCycleService';

export type QualityCheckResult = { checkId: string; label: string; value: string | number; notes?: string };

export function QualityReportForm({
  template,
  remainingQuantity,
  disabled = false,
  onSubmit,
}: {
  template: QualityCheckTemplate[];
  remainingQuantity: number;
  disabled?: boolean;
  onSubmit: (results: QualityCheckResult[], amounts: { inspectedQuantity: number; acceptedQuantity: number; rejectedQuantity: number }) => Promise<void>;
}) {
  const [results, setResults] = useState<Record<string, { value: string | number; notes: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inspected, setInspected] = useState('');
  const [accepted, setAccepted] = useState('');
  const [rejected, setRejected] = useState('0');

  function updateValue(checkId: string, value: string | number) {
    setResults(prev => ({
      ...prev,
      [checkId]: { ...prev[checkId], value, notes: prev[checkId]?.notes || '' },
    }));
  }

  function updateNotes(checkId: string, notes: string) {
    setResults(prev => ({
      ...prev,
      [checkId]: { ...prev[checkId], value: prev[checkId]?.value ?? '', notes },
    }));
  }

  async function handleSubmit() {
    setError('');
    const validation: string[] = [];
    if (!inspected || accepted === '' || rejected === '' || ![inspected, accepted, rejected].every(value => Number.isFinite(Number(value)) && Number(value) >= 0) || Number(inspected) <= 0 || Number(inspected) > remainingQuantity || Math.abs(Number(accepted) + Number(rejected) - Number(inspected)) > 0.000001) validation.push('المفحوص يجب أن يساوي المقبول والمرفوض وألا يتجاوز المتبقي.');

    for (const check of template) {
      const result = results[check.id];
      if (check.required && (result?.value === undefined || result.value === '' || (typeof result.value === 'string' && !result.value.trim()))) {
        validation.push(`${check.label} مطلوب`);
      }
      if (result?.value !== undefined && result.value !== '' && check.inputType === 'number') {
        const num = typeof result.value === 'number' ? result.value : Number(result.value);
        if (check.minValue !== undefined && num < check.minValue) {
          validation.push(`${check.label} يجب أن يكون ${check.minValue} على الأقل`);
        }
        if (check.maxValue !== undefined && num > check.maxValue) {
          validation.push(`${check.label} يجب أن لا يتجاوز ${check.maxValue}`);
        }
      }
    }

    if (validation.length > 0) {
      setError(validation.join('، '));
      return;
    }

    setBusy(true);
    try {
      const checkResults = template.filter(check => results[check.id]?.value !== undefined && results[check.id]?.value !== '').map(check => ({
        checkId: check.id,
        label: check.label,
        value: results[check.id]?.value ?? '',
        notes: results[check.id]?.notes || '',
      }));
      await onSubmit(checkResults, { inspectedQuantity: Number(inspected), acceptedQuantity: Number(accepted), rejectedQuantity: Number(rejected) });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!template.length) {
    return <p className="text-sm text-muted-foreground rounded-md bg-muted p-3">لا يوجد نموذج جودة معرّف لهذا الأمر بعد.</p>;
  }

  return (
    <fieldset disabled={disabled || busy} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <legend className="px-2 font-semibold">تقرير فحص الجودة</legend>
      <p className="text-sm">المتبقي للفحص: {remainingQuantity}. حفظ المشاركة لا يعتبر اعتمادًا من مدير الجودة.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>كمية المشاركة المفحوصة<Input type="number" min="0.001" max={remainingQuantity} step="0.001" value={inspected} onChange={e => setInspected(e.target.value)} /></label>
        <label>المقبول في المشاركة<Input type="number" min="0" step="0.001" showZero value={accepted} onChange={e => setAccepted(e.target.value)} /></label>
        <label>المرفوض في المشاركة<Input type="number" min="0" step="0.001" showZero value={rejected} onChange={e => setRejected(e.target.value)} /></label>
      </div>

      {error && <p role="alert" className="text-sm text-destructive rounded-md bg-destructive/10 p-2">{error}</p>}

      <div className="space-y-4">
        {template.map((check, idx) => (
          <div key={check.id} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <label htmlFor={`quality-${check.id}`} className="block text-sm font-medium">
                {idx + 1}. {check.label}
                {check.required && <span className="text-destructive ml-1">*</span>}
              </label>
              <span className="text-xs text-muted-foreground">
                {check.inputType === 'number' ? 'أرقام' : 'نصوص'}
                {check.inputType === 'number' && check.minValue !== undefined && ` (${check.minValue}`}
                {check.inputType === 'number' && check.minValue !== undefined && check.maxValue !== undefined && `-${check.maxValue})`}
              </span>
            </div>

            {check.inputType === 'number' ? (
              <Input
                id={`quality-${check.id}`}
                showZero
                type="number"
                inputMode="decimal"
                step="0.001"
                placeholder="أدخل الرقم"
                value={results[check.id]?.value ?? ''}
                onChange={e => updateValue(check.id, e.target.value ? Number(e.target.value) : '')}
                disabled={disabled || busy}
              />
            ) : (
              <Input
                id={`quality-${check.id}`}
                maxLength={2000}
                type="text"
                placeholder="أدخل النص"
                value={results[check.id]?.value ?? ''}
                onChange={e => updateValue(check.id, e.target.value)}
                disabled={disabled || busy}
              />
            )}

            <textarea
              aria-label={`ملاحظات ${check.label}`}
              placeholder="ملاحظات إضافية (اختياري)"
              value={results[check.id]?.notes ?? ''}
              onChange={e => updateNotes(check.id, e.target.value)}
              maxLength={500}
              className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled || busy}
            />
          </div>
        ))}
      </div>

      <Button type="button" disabled={disabled || busy} onClick={() => void handleSubmit()} className="w-full">
        حفظ المشاركة وإنهاء الحجز
      </Button>
    </fieldset>
  );
}
