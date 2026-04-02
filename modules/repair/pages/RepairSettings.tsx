import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '../../../store/useAppStore';
import { toast } from '../../../components/Toast';
import { resolveRepairSettings } from '../config/repairSettings';

export const RepairSettings: React.FC = () => {
  const systemSettings = useAppStore((s) => s.systemSettings);
  const updateSystemSettings = useAppStore((s) => s.updateSystemSettings);
  const resolved = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const [saving, setSaving] = useState(false);
  const [statuses, setStatuses] = useState(() => resolved.workflow.statuses);
  const [initialStatusId, setInitialStatusId] = useState(resolved.workflow.initialStatusId);
  const [openStatusIds, setOpenStatusIds] = useState<string[]>(resolved.workflow.openStatusIds);
  const [timezone, setTimezone] = useState(resolved.treasury.autoClose.timezone || 'Africa/Cairo');
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(Boolean(resolved.treasury.autoClose.enabled));
  const [blockIfPrevDayOpen, setBlockIfPrevDayOpen] = useState(Boolean(resolved.treasury.autoClose.blockOperationsIfPrevDayOpen));

  const onSave = async () => {
    setSaving(true);
    try {
      await updateSystemSettings({
        ...systemSettings,
        repairSettings: {
          ...(systemSettings.repairSettings || {}),
          access: resolved.access,
          workflow: {
            statuses: statuses.map((status, idx) => ({ ...status, order: idx + 1 })),
            initialStatusId,
            openStatusIds,
          },
          defaults: {
            ...(systemSettings.repairSettings?.defaults || {}),
            defaultWarranty: resolved.defaults.defaultWarranty,
            defaultMinStock: resolved.defaults.defaultMinStock,
            defaultSlaHours: resolved.defaults.defaultSlaHours,
          },
          treasury: {
            autoClose: {
              enabled: autoCloseEnabled,
              mode: 'scheduled_midnight',
              timezone,
              blockOperationsIfPrevDayOpen: blockIfPrevDayOpen,
            },
          },
        },
      });
      toast.success('تم حفظ إعدادات الصيانة.');
    } catch (error: any) {
      toast.error(error?.message || 'تعذر حفظ إعدادات الصيانة.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>إعدادات حالات الطلب</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {statuses.map((status, index) => (
            <div key={status.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end border rounded p-2">
              <div><Label>المعرف</Label><Input value={status.id} onChange={(e) => setStatuses((prev) => prev.map((s, i) => i === index ? { ...s, id: e.target.value.trim() } : s))} /></div>
              <div><Label>الاسم</Label><Input value={status.label} onChange={(e) => setStatuses((prev) => prev.map((s, i) => i === index ? { ...s, label: e.target.value } : s))} /></div>
              <div><Label>اللون</Label><Input value={status.color} onChange={(e) => setStatuses((prev) => prev.map((s, i) => i === index ? { ...s, color: e.target.value } : s))} /></div>
              <label className="text-sm"><input type="checkbox" className="me-2" checked={status.isTerminal} onChange={(e) => setStatuses((prev) => prev.map((s, i) => i === index ? { ...s, isTerminal: e.target.checked } : s))} />نهائية</label>
              <label className="text-sm"><input type="checkbox" className="me-2" checked={status.isEnabled} onChange={(e) => setStatuses((prev) => prev.map((s, i) => i === index ? { ...s, isEnabled: e.target.checked } : s))} />مفعلة</label>
              <Button variant="destructive" onClick={() => setStatuses((prev) => prev.filter((_, i) => i !== index))}>حذف</Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setStatuses((prev) => [...prev, { id: `custom_${Date.now()}`, label: 'حالة جديدة', color: '#64748b', order: prev.length + 1, isTerminal: false, isEnabled: true }])}>
            إضافة حالة
          </Button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>الحالة الابتدائية</Label>
              <select className="w-full mt-2 border rounded px-3 py-2" value={initialStatusId} onChange={(e) => setInitialStatusId(e.target.value)}>
                {statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
              </select>
            </div>
            <div>
              <Label>الحالات المفتوحة</Label>
              <div className="mt-2 space-y-1">
                {statuses.map((status) => (
                  <label key={`open-${status.id}`} className="block text-sm">
                    <input
                      type="checkbox"
                      className="me-2"
                      checked={openStatusIds.includes(status.id)}
                      onChange={(e) => setOpenStatusIds((prev) => (
                        e.target.checked ? Array.from(new Set([...prev, status.id])) : prev.filter((id) => id !== status.id)
                      ))}
                    />
                    {status.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>سياسة الخزينة</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="text-sm"><input type="checkbox" className="me-2" checked={autoCloseEnabled} onChange={(e) => setAutoCloseEnabled(e.target.checked)} />تفعيل الإغلاق التلقائي منتصف الليل</label>
          <label className="text-sm"><input type="checkbox" className="me-2" checked={blockIfPrevDayOpen} onChange={(e) => setBlockIfPrevDayOpen(e.target.checked)} />منع العمليات إذا خزينة اليوم السابق مفتوحة</label>
          <div>
            <Label>Timezone</Label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-2" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ إعدادات الصيانة'}</Button>
      </div>
    </div>
  );
};

export default RepairSettings;

