import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { db, isConfigured } from '../../../services/firebase';
import { tenantService } from '../../../services/tenantService';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import type { FirestoreUserWithRepair } from '../types';
import type { RepairJobStatus } from '../types';
import { REPAIR_JOBS_COLLECTION } from '../collections';
import { StatusBadge } from '../components/StatusBadge';

export const RepairTrackPublic: React.FC = () => {
  const { can } = usePermission();
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const [tenantSlug, setTenantSlug] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const slug = String(params.get('slug') || '').trim();
    const receipt = String(params.get('receipt') || '').trim();
    const customerPhone = String(params.get('phone') || '').trim();
    if (slug) setTenantSlug(slug);
    if (receipt) setReceiptNo(receipt);
    if (customerPhone) setPhone(customerPhone);
  }, []);

  const search = async () => {
    if (!isConfigured) return;
    if (!userProfile || !can('repair.view')) {
      setError('التتبع يتطلب تسجيل الدخول بصلاحية عرض طلبات الصيانة.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const tenant = await tenantService.resolveSlug(tenantSlug.trim());
      if (!tenant?.exists || !tenant?.tenantId) {
        setError('الشركة غير موجودة.');
        return;
      }
      const q = query(
        collection(db, REPAIR_JOBS_COLLECTION),
        where('tenantId', '==', tenant.tenantId),
        where('receiptNo', '==', receiptNo.trim()),
        where('customerPhone', '==', phone.trim()),
      );
      const snap = await getDocs(q);
      const docRow = snap.docs[0];
      if (!docRow) {
        setError('لا يوجد طلب مطابق للبيانات المدخلة.');
        return;
      }
      setResult({ id: docRow.id, ...docRow.data() });
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'permission-denied') {
        setError('لا تملك صلاحية للوصول إلى بيانات التتبع.');
      } else {
        setError('تعذر تنفيذ البحث.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
          <CardContent className="pt-6">
            <h1 className="text-2xl font-bold">تتبع طلب الصيانة</h1>
            <p className="text-sm text-muted-foreground mt-1">أدخل بيانات الطلب لمعرفة الحالة الحالية بعد تسجيل الدخول.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>بيانات البحث</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-2">
            <div><Label>كود الشركة</Label><Input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} placeholder="company-slug" /></div>
            <div><Label>رقم الإيصال</Label><Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="REP-0001" /></div>
            <div><Label>رقم الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" /></div>
            <div className="md:col-span-3">
              <Button onClick={search} disabled={loading || !tenantSlug || !receiptNo || !phone}>
                {loading ? 'جاري البحث...' : 'تتبع'}
              </Button>
              {!userProfile && (
                <p className="mt-2 text-xs text-amber-700">يجب تسجيل الدخول أولًا للوصول إلى بيانات التتبع.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {error && <Card><CardContent className="pt-6 text-rose-600 text-sm">{error}</CardContent></Card>}

        {result && (
          <Card>
            <CardHeader><CardTitle>نتيجة التتبع</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span>الإيصال:</span>
                <Badge variant="outline">{result.receiptNo}</Badge>
              </div>
              <div>العميل: {result.customerName}</div>
              <div>الجهاز: {result.deviceBrand} {result.deviceModel}</div>
              <div className="flex items-center gap-2">
                <span>الحالة:</span>
                <StatusBadge status={(result.status as RepairJobStatus) || 'received'} />
              </div>
              <div>آخر تحديث: {result.updatedAt ? new Date(result.updatedAt).toLocaleString('ar-EG') : '—'}</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default RepairTrackPublic;
