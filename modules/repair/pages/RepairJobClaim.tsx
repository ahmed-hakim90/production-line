import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { withTenantPath } from '@/lib/tenantPaths';
import { repairTechnicianService } from '../services/repairTechnicianService';

export const RepairJobClaim: React.FC = () => {
  const { jobId = '', tenantSlug = '' } = useParams<{ jobId: string; tenantSlug?: string }>();
  const navigate = useNavigate();
  const started = useRef(false);
  const [state, setState] = useState<'claiming' | 'done' | 'error'>('claiming');
  const [message, setMessage] = useState('جاري التحقق من الطلب وإسناده لك…');

  const claim = useCallback(async () => {
    setState('claiming');
    setMessage('جاري التحقق من الطلب وإسناده لك…');
    try {
      const result = await repairTechnicianService.claimFromQr(jobId);
      setState('done');
      setMessage(result.claimed ? 'تم إسناد الطلب لك. جاري فتح شاشة العمل…' : 'الطلب مسند لك بالفعل. جاري فتحه…');
      window.setTimeout(() => navigate(withTenantPath(tenantSlug, `/repair/jobs/${jobId}/workspace`), { replace: true }), 500);
    } catch (error: unknown) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'تعذر استلام الطلب.');
    }
  }, [jobId, navigate, tenantSlug]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void claim();
  }, [claim]);

  const Icon = state === 'claiming' ? Loader2 : state === 'done' ? CheckCircle2 : TriangleAlert;
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-2 rounded-full bg-muted p-3">
            <Icon className={`size-8 ${state === 'claiming' ? 'animate-spin text-primary' : state === 'done' ? 'text-emerald-600' : 'text-rose-600'}`} />
          </div>
          <CardTitle>استلام طلب صيانة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          {state === 'error' ? (
            <div className="flex justify-center gap-2">
              <Button type="button" onClick={() => void claim()}>إعادة المحاولة</Button>
              <Button type="button" variant="outline" onClick={() => navigate(withTenantPath(tenantSlug, '/repair/my-jobs'))}>طلباتي</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};
