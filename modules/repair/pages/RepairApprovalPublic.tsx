import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isConfigured, submitRepairApprovalPublicCallable } from '../../../services/firebase';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

export const RepairApprovalPublic: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug = '' } = useParams<{ tenantSlug: string }>();
  const [searchParams] = useSearchParams();
  const jobId = useMemo(() => String(searchParams.get('job') || '').trim(), [searchParams]);
  const token = useMemo(() => String(searchParams.get('token') || '').trim(), [searchParams]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!jobId || !token) {
      setError('الرابط غير مكتمل. تأكد من نسخ الرابط كاملًا من رسالة الواتساب.');
    }
  }, [jobId, token]);

  const submit = async (decision: 'approved' | 'rejected') => {
    if (!isConfigured) return;
    if (!tenantSlug.trim() || !jobId || !token) {
      setError('بيانات الرابط غير كافية.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await submitRepairApprovalPublicCallable({
        tenantSlug: tenantSlug.trim(),
        jobId,
        token,
        decision,
        note: decision === 'rejected' ? note : undefined,
      });
      setDone(decision);
    } catch (e: any) {
      setError(e?.message || 'تعذر تنفيذ الطلب.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4" dir={dir}>
      <div className="max-w-lg mx-auto space-y-4">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>موافقة العميل على التقدير</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {done ? (
              <p className="text-emerald-700 font-medium">
                {done === 'approved' ? 'تم تسجيل موافقتكم. شكراً لكم.' : 'تم تسجيل الرفض. يمكنكم التواصل مع الفرع.'}
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  تأكيد أو رفض تقدير الإصلاح المرتبط بهذا الرابط. لا يُطلب تسجيل دخول.
                </p>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="space-y-2">
                  <Label htmlFor="rej-note">ملاحظة عند الرفض (اختياري)</Label>
                  <Input
                    id="rej-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="سبب الرفض أو استفسار"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    className="flex-1 min-h-12"
                    disabled={loading || !jobId || !token}
                    onClick={() => void submit('approved')}
                  >
                    موافقة على التقدير
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 min-h-12"
                    disabled={loading || !jobId || !token}
                    onClick={() => void submit('rejected')}
                  >
                    رفض
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RepairApprovalPublic;
