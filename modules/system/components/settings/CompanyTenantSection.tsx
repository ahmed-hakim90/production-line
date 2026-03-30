import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import { useAppStore } from '@/store/useAppStore';
import { Card, Button } from '../UI';
import type { FirestoreTenant, ThemeSettings } from '@/types';

export const CompanyTenantSection: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const tenantId = useAppStore((s) => s.userProfile?.tenantId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!isConfigured || !tenantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'tenants', tenantId));
        if (cancelled) return;
        const d = snap.data() as FirestoreTenant | undefined;
        setName(d?.name ?? '');
        setPhone(d?.phone ?? '');
        setAddress(d?.address ?? '');
      } catch {
        if (!cancelled) setErr('تعذر تحميل بيانات الشركة');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const save = async () => {
    if (!isAdmin || !tenantId || !isConfigured) return;
    setSaving(true);
    setErr('');
    try {
      const themeSnap = await getDoc(doc(db, 'tenants', tenantId));
      const existingTheme = (themeSnap.data() as { theme?: ThemeSettings } | undefined)?.theme;
      await updateDoc(doc(db, 'tenants', tenantId), {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        ...(existingTheme ? { theme: existingTheme } : {}),
      });
      useAppStore.setState({ tenantCompanyName: name.trim() });
    } catch (e: any) {
      setErr(e?.message || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (!tenantId) return null;

  return (
    <Card title="بيانات الشركة" className="bg-white border-slate-200 rounded-xl shadow-none">
      {err ? <p className="text-sm text-rose-600 mb-3">{err}</p> : null}
      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">جاري التحميل...</p>
      ) : (
        <div className="space-y-3 max-w-xl">
          <div>
            <label className="block text-xs font-semibold mb-1">اسم الشركة</label>
            <input
              className="erp-input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">الهاتف</label>
            <input
              className="erp-input w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!isAdmin}
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">العنوان</label>
            <textarea
              className="erp-input w-full min-h-[72px]"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          {isAdmin ? (
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ بيانات الشركة'}
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
};
