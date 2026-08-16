import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useParams } from 'react-router-dom';
import { Check, Circle } from 'lucide-react';
import { PublicCustomerSurfaceShell } from '../components/PublicCustomerSurfaceShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { isConfigured, trackRepairJobPublicCallable, type PublicRepairTrackResult } from '../../../services/firebase';
import type { RepairJobStatus } from '../types';
import { REPAIR_JOB_STATUS_LABELS } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { mapLegacyRepairStatus } from '../utils/repairStatusIds';

const PUBLIC_TRACK_PROGRESS_STEPS: RepairJobStatus[] = [
  'received',
  'diagnosing',
  'diagnosed',
  'waiting_approval',
  'waiting_parts',
  'repairing',
  'testing',
  'ready',
  'delivered',
];

type TrackResult = Extract<PublicRepairTrackResult, { found: true }>['job'];

const resolveStepIndex = (status: string): number => {
  const canonical = mapLegacyRepairStatus(status);
  const idx = PUBLIC_TRACK_PROGRESS_STEPS.indexOf(canonical as RepairJobStatus);
  if (idx >= 0) return idx;
  if (canonical === 'cancelled' || canonical === 'unrepairable') return -2;
  return -1;
};

const formatMs = (ms?: number) => {
  if (!ms || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('ar-EG');
};

export const RepairTrackPublic: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug = '' } = useParams<{ tenantSlug: string }>();
  const [receiptNo, setReceiptNo] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState('');
  const autoSearchTriggered = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const receipt = String(params.get('receipt') || '').trim();
    const customerPhone = String(params.get('phone') || '').trim();
    if (receipt) setReceiptNo(receipt);
    if (customerPhone) setPhone(customerPhone);
  }, []);

  const search = useCallback(async () => {
    if (!isConfigured) return;
    if (!tenantSlug.trim()) {
      setError('رابط التتبع غير صالح (معرّف الشركة مفقود).');
      return;
    }
    const receipt = receiptNo.trim();
    const customerPhone = phone.trim();
    if (!receipt || !customerPhone) return;

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await trackRepairJobPublicCallable({
        tenantSlug: tenantSlug.trim(),
        receiptNo: receipt,
        phone: customerPhone,
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
        setError('لا يوجد طلب مطابق للبيانات المدخلة.');
        return;
      }
      setResult(response.job);
    } catch {
      setError('تعذر تنفيذ البحث.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, receiptNo, phone]);

  useEffect(() => {
    if (autoSearchTriggered.current) return;
    const receipt = receiptNo.trim();
    const customerPhone = phone.trim();
    if (!receipt || !customerPhone) return;
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlReceipt = String(params?.get('receipt') || '').trim();
    const urlPhone = String(params?.get('phone') || '').trim();
    if (urlReceipt !== receipt || urlPhone !== customerPhone) return;
    autoSearchTriggered.current = true;
    void search();
  }, [receiptNo, phone, search]);

  const currentStepIndex = useMemo(
    () => (result ? resolveStepIndex(result.status) : -1),
    [result],
  );

  const isTerminalBad = result?.status === 'cancelled' || result?.status === 'unrepairable';

  return (
    <PublicCustomerSurfaceShell
      title="تتبع طلب الصيانة"
      subtitle="أدخل رقم الإيصال والجوال لمعرفة الحالة"
      dir={dir}
      contentClassName="max-w-2xl"
    >
        <OpsDashPanel title="بيانات البحث" accent="repair">
          <div className="grid md:grid-cols-2 gap-2">
            <div><Label>رقم الإيصال</Label><Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="REP-0001" /></div>
            <div>
              <Label htmlFor="repair-track-phone">رقم الهاتف</Label>
              <Input
                id="repair-track-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
              />
            </div>
            <div className="md:col-span-2">
              <Button onClick={() => void search()} disabled={loading || !receiptNo || !phone}>
                {loading ? 'جاري البحث...' : 'تتبع'}
              </Button>
            </div>
          </div>
        </OpsDashPanel>

        {error ? (
          <OpsDashPanel accent="repair">
            <p className="text-[rgb(var(--color-danger))] text-sm">{error}</p>
          </OpsDashPanel>
        ) : null}

        {result && (
          <OpsDashPanel title="نتيجة التتبع" accent="repair">
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span>الإيصال:</span>
                <Badge variant="outline">{result.receiptNo}</Badge>
              </div>
              <div>العميل: {result.customerName}</div>
              <div>الجهاز: {result.deviceBrand} {result.deviceModel}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span>الحالة:</span>
                <StatusBadge status={(result.status as RepairJobStatus) || 'received'} />
                {result.statusLabel ? (
                  <span className="text-muted-foreground">({result.statusLabel})</span>
                ) : null}
              </div>

              {!isTerminalBad && currentStepIndex >= 0 ? (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="font-medium">مسار الطلب</div>
                  <div className="flex flex-wrap gap-2">
                    {PUBLIC_TRACK_PROGRESS_STEPS.map((step, idx) => {
                      const done = idx < currentStepIndex || (idx === currentStepIndex && step === 'delivered');
                      const active = idx === currentStepIndex;
                      return (
                        <div
                          key={step}
                          className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs border ${
                            active ? 'border-primary bg-primary/10 text-primary font-medium' : done ? 'border-[rgb(var(--color-success)/0.35)] bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]' : 'border-muted bg-muted/30 text-muted-foreground'
                          }`}
                        >
                          {done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          {REPAIR_JOB_STATUS_LABELS[step] || result.statusLabel || step}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {isTerminalBad ? (
                <div className="rounded-md border border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)] p-3 text-[rgb(var(--color-danger))]">
                  {REPAIR_JOB_STATUS_LABELS[result.status] || result.statusLabel || result.status}
                </div>
              ) : null}

              {Array.isArray(result.jobProducts) && result.jobProducts.length > 0 ? (
                <div className="space-y-2">
                  <div className="font-medium">المنتجات</div>
                  {result.jobProducts.map((row, idx) => (
                    <div key={`${row.name}-${idx}`} className="flex justify-between rounded border px-3 py-2">
                      <span>{row.name}</span>
                      <span className="text-muted-foreground">×{row.quantity}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {result.dueAtMs ? (
                <div>
                  <span className="text-muted-foreground">الموعد المتوقع: </span>
                  {formatMs(result.dueAtMs)}
                </div>
              ) : null}

              <div>
                <span className="text-muted-foreground">آخر تحديث: </span>
                {formatMs(result.updatedAtMs)}
              </div>

              {Array.isArray(result.statusHistory) && result.statusHistory.length > 0 ? (
                <div className="space-y-1 border-t pt-3">
                  <div className="font-medium">آخر التحديثات</div>
                  {result.statusHistory.slice(-5).reverse().map((entry, idx) => (
                    <div key={`${entry.status}-${entry.atMs}-${idx}`} className="flex justify-between text-xs text-muted-foreground">
                      <span>{REPAIR_JOB_STATUS_LABELS[entry.status] || entry.status}</span>
                      <span>{formatMs(entry.atMs)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </OpsDashPanel>
        )}
    </PublicCustomerSurfaceShell>
  );
};

export default RepairTrackPublic;
