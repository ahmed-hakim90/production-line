import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { Card, Button } from '../UI';

const BUILD_VERSION = __APP_VERSION__;

type ClientVersionSettingsSectionProps = {
  isAdmin: boolean;
  saving: boolean;
  /** القيم الحالية كما وردت من Firestore (`system_settings/global`) بعد آخر تحميل */
  firestoreMinimumClientVersion?: string;
  firestoreForceClientUpdate?: boolean;
  firestoreClientUpdateMessageAr?: string;
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
  firestoreMinimumClientVersion,
  firestoreForceClientUpdate,
  firestoreClientUpdateMessageAr,
  localMinimumClientVersion,
  setLocalMinimumClientVersion,
  localForceClientUpdate,
  setLocalForceClientUpdate,
  localClientUpdateMessageAr,
  setLocalClientUpdateMessageAr,
  onSave,
}) => {
  if (!isAdmin) return null;

  const savedMinTrimmed = (firestoreMinimumClientVersion ?? '').trim();
  const savedMsgTrimmed = (firestoreClientUpdateMessageAr ?? '').trim();
  const savedForce = firestoreForceClientUpdate === true;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">إصدار العميل الويب</h3>
          <p className="page-subtitle text-[var(--color-text-muted)] text-sm">
            فرض تحديث للمستخدمين ذوي الإصدار الأقدم من الحد المحدد (بعد نشر build جديد على الاستضافة). من يملك صلاحية{' '}
            <span className="font-medium text-[var(--color-text)]">إدارة الأدوار</span> لا تُعرض له شاشة التحديث الإجباري ويمكنه
            تصحيح الإعداد من هنا إن لزم.
          </p>
        </div>
        <Button type="button" onClick={onSave} disabled={saving} className="w-full sm:w-auto justify-center">
          {saving && <Loader2 size={14} className="animate-spin" />}
          <Save size={14} />
          حفظ
        </Button>
      </div>

      <Card className="bg-[var(--color-card)] border-[var(--color-border)] rounded-xl shadow-none">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <span className="material-icons-round text-primary text-xl">cloud</span>
            آخر نسخة مسجّلة في Firebase
          </div>
          <p className="text-xs text-[var(--color-text-muted)] -mt-1">
            من مستند <span className="font-mono dir-ltr inline-block">system_settings / global</span> — القيم المحفوظة حالياً على الخادم (ليست مسودة التحرير).
          </p>
          <div className="rounded-lg border border-border bg-accent px-4 py-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[var(--color-text-muted)] shrink-0">أقل إصدار مسموح:</span>
              <span className="font-mono font-bold text-[var(--color-text)] dir-ltr">
                {savedMinTrimmed || '— غير محدد'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[var(--color-text-muted)]">التحديث الإجباري:</span>
              <span className={savedForce ? 'font-semibold text-primary' : 'text-[var(--color-text-muted)]'}>
                {savedForce ? 'مفعّل' : 'غير مفعّل'}
              </span>
            </div>
            {savedMsgTrimmed ? (
              <div className="pt-1 border-t border-border/70">
                <span className="text-xs text-[var(--color-text-muted)] block mb-1">الرسالة المحفوظة</span>
                <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">{savedMsgTrimmed}</p>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="bg-[var(--color-card)] border-[var(--color-border)] rounded-xl shadow-none">
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
              يجب أن تطابق صيغة الإصدار في package.json بعد النشر.
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

          <p className="text-xs text-accent-foreground border border-border rounded-lg px-3 py-2 bg-accent">
            تنبيه: ارفع الحد الأدنى فقط بعد نشر build يحمل نفس الرقم أو أعلى، وإلا سيُحتجز المستخدمون في حلقة تحديث.
          </p>
        </div>
      </Card>
    </div>
  );
};
