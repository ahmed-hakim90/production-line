import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useParams } from 'react-router-dom';
import { isConfigured, trackRepairJobPublicCallable } from '../../../services/firebase';
import type { RepairJobStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

export const RepairTrackPublic: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug = '' } = useParams<{ tenantSlug: string }>();
  const [receiptNo, setReceiptNo] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    receiptNo: string;
    customerName: string;
    deviceBrand: string;
    deviceModel: string;
    status: string;
    updatedAtMs: number;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const receipt = String(params.get('receipt') || '').trim();
    const customerPhone = String(params.get('phone') || '').trim();
    if (receipt) setReceiptNo(receipt);
    if (customerPhone) setPhone(customerPhone);
  }, []);

  const search = async () => {
    if (!isConfigured) return;
    if (!tenantSlug.trim()) {
      setError('رابط التتبع غير صالح (معرّف الشركة مفقود).');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await trackRepairJobPublicCallable({
        tenantSlug: tenantSlug.trim(),
        receiptNo: receiptNo.trim(),
        phone: phone.trim(),
      });
      if (!response.found) {
        const reason = 'reason' in response ? response.reason : 'not_found';
        if (reason === 'tenant_not_found') {
          setError('الشركة غير موجودة.');
          return;
        }
        if (reason === 'tenant_not_active') {
          setError('هذه الشركة غير متاحة للتتبع حاليًا.');
          return;
        }
        setError('لا يوجد طلب مطابق للبيانات المدخلة.');
        return;
      }
      if (!response.job?.receiptNo) {
        setError('الشركة غير موجودة.');
        return;
      }
      setResult(response.job);
    } catch {
      setError('تعذر تنفيذ البحث.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4" dir={dir}>
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
          <CardContent className="pt-6">
            <h1 className="text-2xl font-bold">تتبع طلب الصيانة</h1>
            <p className="text-sm text-muted-foreground mt-1">أدخل بيانات الطلب لمعرفة الحالة الحالية.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>بيانات البحث</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-2">
            <div><Label>رقم الإيصال</Label><Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="REP-0001" /></div>
            <div><Label>رقم الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" /></div>
            <div className="md:col-span-2">
              <Button onClick={search} disabled={loading || !receiptNo || !phone}>
                {loading ? 'جاري البحث...' : 'تتبع'}
              </Button>
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
              <div>آخر تحديث: {result.updatedAtMs ? new Date(result.updatedAtMs).toLocaleString('ar-EG') : '—'}</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default RepairTrackPublic;
