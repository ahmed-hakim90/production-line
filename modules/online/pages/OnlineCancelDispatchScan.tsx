import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '../../../components/PageHeader';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import {
  isValidDispatchBarcode,
  normalizeBostaBarcode,
  onlineDispatchService,
} from '../services/onlineDispatchService';
import { OnlineCameraBarcodeScanner } from '../components/OnlineCameraBarcodeScanner';
import { OnlineDispatchStatusBadge } from '../components/OnlineDispatchStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '../../../components/Toast';
import { cn } from '@/lib/utils';
import { Loader2, ScanLine } from 'lucide-react';
import type { OnlineDispatchShipment } from '../../../types';

const WEDGE_DEBOUNCE_MS = 400;

async function preflightCameraPermission(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('المتصفح لا يدعم الكاميرا أو الموقع ليس آمناً (استخدم HTTPS)');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
  });
  stream.getTracks().forEach((t) => t.stop());
}

function cameraPreflightErrorMessage(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      return 'لم يُسمح بالكاميرا — اسمح للموقع من إعدادات المتصفح أو أيقونة القفل بجانب العنوان';
    }
    if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
      return 'لم يُعثر على كاميرا على هذا الجهاز';
    }
    if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
      return 'الكاميرا مستخدمة من تطبيق آخر أو غير متاحة';
    }
  }
  return e instanceof Error ? e.message : 'تعذر الوصول للكاميرا';
}

type InputMode = 'manual' | 'camera';

/**
 * Dedicated flow: scan or enter a barcode, look up an existing shipment, and cancel from the
 * warehouse handoff queue (at_warehouse → cancelled) so it is no longer counted as awaiting post.
 */
export const OnlineCancelDispatchScan: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);

  const allowed =
    Boolean(uid) && (can('onlineDispatch.cancelFromWarehouseQueue') || can('onlineDispatch.manage'));

  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [cameraPriming, setCameraPriming] = useState(false);
  const [lookupRow, setLookupRow] = useState<(OnlineDispatchShipment & { id: string }) | null>(null);
  const [lookupMissing, setLookupMissing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wedgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupGenRef = useRef(0);
  const cameraScanLockRef = useRef(false);

  const selectCameraMode = useCallback(async () => {
    if (inputMode === 'camera') return;
    setCameraPriming(true);
    try {
      await preflightCameraPermission();
      setInputMode('camera');
    } catch (e) {
      toast.error(cameraPreflightErrorMessage(e));
    } finally {
      setCameraPriming(false);
    }
  }, [inputMode]);

  useEffect(() => {
    if (inputMode === 'manual') {
      inputRef.current?.focus();
    }
  }, [inputMode]);

  const runLookup = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setLookupRow(null);
        setLookupMissing(false);
        return;
      }
      const normalized = normalizeBostaBarcode(trimmed);
      if (!isValidDispatchBarcode(normalized)) {
        setLookupRow(null);
        setLookupMissing(false);
        return;
      }
      const gen = ++lookupGenRef.current;
      setBusy(true);
      try {
        const row = await onlineDispatchService.getByBarcode(normalized);
        if (gen !== lookupGenRef.current) return;
        setLookupRow(row);
        setLookupMissing(!row);
      } catch (e) {
        if (gen !== lookupGenRef.current) return;
        toast.error(e instanceof Error ? e.message : 'تعذر البحث');
        setLookupRow(null);
        setLookupMissing(false);
      } finally {
        if (gen === lookupGenRef.current) setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (inputMode !== 'manual' || busy) {
      if (wedgeTimerRef.current) {
        clearTimeout(wedgeTimerRef.current);
        wedgeTimerRef.current = null;
      }
      return;
    }
    const normalized = normalizeBostaBarcode(value);
    if (!isValidDispatchBarcode(normalized)) {
      setLookupRow(null);
      setLookupMissing(false);
      return;
    }
    if (wedgeTimerRef.current) clearTimeout(wedgeTimerRef.current);
    wedgeTimerRef.current = setTimeout(() => {
      wedgeTimerRef.current = null;
      void runLookup(value);
    }, WEDGE_DEBOUNCE_MS);
    return () => {
      if (wedgeTimerRef.current) {
        clearTimeout(wedgeTimerRef.current);
        wedgeTimerRef.current = null;
      }
    };
  }, [value, inputMode, busy, runLookup]);

  const onCameraDecoded = useCallback(
    (text: string) => {
      if (cameraScanLockRef.current) return;
      cameraScanLockRef.current = true;
      setValue(text);
      void runLookup(text).finally(() => {
        cameraScanLockRef.current = false;
      });
    },
    [runLookup],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void runLookup(value);
    }
  };

  const confirmCancel = async () => {
    if (!uid || !lookupRow || lookupRow.status !== 'at_warehouse') return;
    setCancelBusy(true);
    try {
      await onlineDispatchService.cancelWarehouseShipment(uid, lookupRow.id);
      toast.success('تم تسجيل الإلغاء من التسليم — لن تُحسب الشحنة في انتظار البوسطة');
      const updated = await onlineDispatchService.getByBarcode(lookupRow.barcode);
      setLookupRow(updated ?? { ...lookupRow, status: 'cancelled' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الإلغاء');
    } finally {
      setCancelBusy(false);
      inputRef.current?.focus();
    }
  };

  if (!allowed) {
    return <Navigate to="/online" replace />;
  }

  const showCancelButton = lookupRow?.status === 'at_warehouse';

  return (
    <div className="erp-page max-w-lg mx-auto space-y-6 px-2 sm:px-0">
      <PageHeader
        title="إلغاء من التسليم (مسح)"
        subtitle="ابحث بالباركود عن شحنة مسجّلة عند المخزن ثم سجّل إلغاءها من مسار التسليم للبوسطة إن لزم."
        icon="block"
        secondaryAction={{
          label: can('onlineDispatch.view') || can('onlineDispatch.manage') ? 'لوحة الأونلاين' : 'الرئيسية',
          icon: 'layout_dashboard',
          onClick: () =>
            navigate(
              can('onlineDispatch.view') || can('onlineDispatch.manage') ? '/online' : '/',
            ),
        }}
      />

      <Card className="shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-4 sm:px-6">
          <CardTitle className="text-base font-semibold">الباركود</CardTitle>
          <CardDescription className="text-xs">
            أدخل الرمز أو امسحه بالكاميرا؛ يُعرض السجل الحالي إن وُجد.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant={inputMode === 'manual' ? 'default' : 'outline'}
              className="h-12 flex-1 text-base"
              onClick={() => setInputMode('manual')}
            >
              إدخال / قارئ باركود
            </Button>
            <Button
              type="button"
              variant={inputMode === 'camera' ? 'default' : 'outline'}
              className="h-12 flex-1 text-base"
              disabled={busy || cameraPriming}
              onClick={() => void selectCameraMode()}
            >
              {cameraPriming ? 'جاري طلب الكاميرا…' : 'كاميرا الموبايل'}
            </Button>
          </div>

          {inputMode === 'manual' ? (
            <div className="space-y-2">
              <Label htmlFor="online-cancel-scan-barcode" className="text-xs text-muted-foreground">
                الباركود
              </Label>
              <Input
                id="online-cancel-scan-barcode"
                ref={inputRef}
                dir="ltr"
                className="font-mono text-base"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="BOSTA_… أو امسح القارئ"
                autoComplete="off"
              />
              <Button
                type="button"
                className="w-full"
                disabled={busy || !normalizeBostaBarcode(value).trim()}
                onClick={() => void runLookup(value)}
              >
                {busy ? (
                  <>
                    <Loader2 className="ms-2 h-4 w-4 animate-spin" aria-hidden />
                    جاري البحث…
                  </>
                ) : (
                  'بحث'
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <OnlineCameraBarcodeScanner
                active={inputMode === 'camera'}
                onDecoded={onCameraDecoded}
                onScannerError={(m) => toast.error(m)}
              />
              <p className="text-center text-xs text-muted-foreground">
                وجّه الكاميرا نحو الباركود؛ بعد القراءة يُعرض النتيجة أدناه.
              </p>
            </div>
          )}

          <div
            className={cn(
              'rounded-lg border bg-muted/20 px-4 py-4 shadow-sm',
              lookupRow?.status === 'at_warehouse' && 'border-amber-500/40',
              lookupRow?.status === 'cancelled' && 'border-rose-500/30',
            )}
            aria-live="polite"
          >
            {!value.trim() && !lookupRow && !lookupMissing ? (
              <p className="text-center text-sm text-muted-foreground">أدخل باركودًا للبحث.</p>
            ) : busy ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                جاري البحث…
              </div>
            ) : lookupMissing ? (
              <p className="text-center text-sm font-medium text-destructive">الباركود غير مسجّل في النظام.</p>
            ) : lookupRow ? (
              <div className="space-y-3 text-right">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold dir-ltr">{lookupRow.barcode}</span>
                  <OnlineDispatchStatusBadge status={lookupRow.status} />
                </div>
                {lookupRow.status === 'pending' ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    الشحنة ما زالت في انتظار أول مسح للمخزن — لا حاجة لإلغاء من التسليم من هذه الشاشة.
                  </p>
                ) : null}
                {lookupRow.status === 'handed_to_post' ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    تم تسليم هذه الشحنة للبوسطة مسبقًا — لا يمكن إلغاءها من التسليم من هنا.
                  </p>
                ) : null}
                {lookupRow.status === 'cancelled' ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    هذه الشحنة مسجّلة مسبقًا كملغاة من التسليم.
                  </p>
                ) : null}
                {showCancelButton ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full"
                    disabled={cancelBusy}
                    onClick={() => void confirmCancel()}
                  >
                    {cancelBusy ? (
                      <>
                        <Loader2 className="ms-2 h-4 w-4 animate-spin" aria-hidden />
                        جاري التسجيل…
                      </>
                    ) : (
                      'تسجيل إلغاء من التسليم'
                    )}
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">أدخل باركودًا صالحًا للبحث.</p>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <ScanLine className="h-4 w-4 shrink-0" aria-hidden />
            <span>يُنصح باستخدام هذه الشاشة فقط بعد التأكد من إلغاء الطلب في بوسطة أو عدم تنفيذه.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
