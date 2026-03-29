import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { Card } from '../UI';
import { Button } from '@/components/UI';

const BUILD_VERSION = __APP_VERSION__;

type ClientVersionSettingsSectionProps = {
  isAdmin: boolean;
  saving: boolean;
  localMinimumClientVersion: string;
  setLocalMinimumClientVersion: (v: string) => void;
  localForceClientUpdate: boolean;
  setLocalForceClientUpdate: (v: boolean) => void;
  localClientUpdateMessageAr: string;
  setLocalClientUpdateMessageAr: (v: string) => void;
  onSave: () => void;
};

export const ClientVersionSettingsSection: React.FC<ClientVersionSettingsSectionProps> = ({
  isAdmin,
  saving,
  localMinimumClientVersion,
  setLocalMinimumClientVersion,
  localForceClientUpdate,
  setLocalForceClientUpdate,
  localClientUpdateMessageAr,
  setLocalClientUpdateMessageAr,
  onSave,
}) => {
  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">إصدار تطبيق الويب</h3>
          <p className="page-subtitle text-[var(--color-text-muted)] text-sm">
            فرض تحديث للمستخدمين ذوي الإصدار الأقدم من الحد المحدد (بعد نشر build جديد على الاستضافة).
          </p>
        </div>
        <Button type="button" onClick={onSave} disabled={saving} className="w-full sm:w-auto justify-center">
          {saving && <Loader2 size={14} className="animate-spin" />}
          <Save size={14} />
          حفظ
        </Button>
      </div>

      <Card className="bg-white border-slate-200 rounded-xl shadow-none">
        <div className="space-y-4">
          <div className="rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] px-4 py-3 text-sm">
            <span className="text-[var(--color-text-muted)]">إصدار البناء الحالي (من آخر نشر): </span>
            <span className="font-mono font-semibold text-[var(--color-text)]">{BUILD_VERSION}</span>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">أقل إصدار مسموح (x.y.z)</span>
            <input
              type="text"
              dir="ltr"
              className="w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-mono"
              placeholder="مثال: 4.0.80"
              value={localMinimumClientVersion}
              onChange={(e) => setLocalMinimumClientVersion(e.target.value)}
            />
            <span className="text-xs text-[var(--color-text-muted)]">
              يجب أن يطابق صيغة الإصدار في package.json بعد النشر.
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-[var(--color-border)]"
              checked={localForceClientUpdate}
              onChange={(e) => setLocalForceClientUpdate(e.target.checked)}
            />
            <span className="text-sm font-medium text-[var(--color-text)]">تفعيل التحديث الإجباري</span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">رسالة للمستخدم (اختياري)</span>
            <textarea
              className="w-full min-h-[88px] rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm resize-y"
              placeholder="مثال: تم إصلاح مشكلة في التقارير. يرجى التحديث."
              value={localClientUpdateMessageAr}
              onChange={(e) => setLocalClientUpdateMessageAr(e.target.value)}
            />
          </label>

          <p className="text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 bg-amber-50 dark:bg-amber-900/20">
            تنبيه: ارفع الحد الأدنى فقط بعد نشر build يحمل نفس الرقم أو أعلى، وإلا سيُحتجز المستخدمون في حلقة تحديث.
          </p>
        </div>
      </Card>
    </div>
  );
};
