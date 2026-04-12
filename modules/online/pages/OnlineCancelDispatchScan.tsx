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

/** قارئ الباركود (wedge): أقصر من شاشة المسح العادية لتقليل انتظار آخر حرف. */
const WEDGE_DEBOUNCE_MS = 160;

/** نافذة مسح أعلى قليلًا لخطوط 1D على صفحة الإلغاء فقط. */
function cancelDispatchQrbox(viewfinderWidth: number, viewfinderHeight: number) {
  const w = Math.min(320, Math.floor(viewfinderWidth * 0.92));
  const h = Math.min(240, Math.floor(viewfinderHeight * 0.55));
  return { width: Math.max(220, w), height: Math.max(140, h) };
}

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
 * Dedicated flow: scan or enter a barcode; if shipment is at warehouse, cancel is applied immediately
 * (no second button). Other statuses are shown without destructive action.
 */
export const OnlineCancelDispatchScan: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);

  const allowed =
    Boolean(uid) && (can('onlineDispatch.cancelFromWarehouseQueue') || can('onlineDispatch.manage'));

  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [cameraPriming, setCameraPriming] = useState(false);
  const [lookupRow, setLookupRow] = useState<(OnlineDispatchShipment & { id: string }) | null>(null);
  const [lookupMissing, setLookupMissing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wedgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupGenRef = useRef(0);
  /** يمنع تكرار فك تشفير الكاميرا قبل انتهاء البحث + الإلغاء بالكامل. */
  const scanPipelineLockRef = useRef(false);

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

  const processBarcodeForCancel = useCallback(
    async (raw: string) => {
      if (!uid) return;
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

        if (!row) {
          setLookupRow(null);
          setLookupMissing(true);
          return;
        }

        setLookupMissing(false);

        if (row.status === 'cancelled') {
          setLookupRow(row);
          return;
        }

        if (row.status === 'pending' || row.status === 'handed_to_post') {
          setLookupRow(row);
          return;
        }

        if (row.status !== 'at_warehouse') {
          setLookupRow(row);
          return;
        }

        await onlineDispatchService.cancelWarehouseShipment(uid, row.id);
        if (gen !== lookupGenRef.current) return;

        toast.success('تم تسجيل الإلغاء من التسليم — لن تُحسب الشحنة في انتظار البوسطة');
        const updated = await onlineDispatchService.getByBarcode(row.barcode);
        if (gen !== lookupGenRef.current) return;
        setLookupRow(updated ?? { ...row, status: 'cancelled' });
        setValue('');
      } catch (e) {
        if (gen !== lookupGenRef.current) return;
        const msg = e instanceof Error ? e.message : 'فشلت العملية';
        const refetched = await onlineDispatchService.getByBarcode(normalized).catch(() => null);
        if (refetched?.status === 'cancelled') {
          setLookupRow(refetched);
          setValue('');
          return;
        }
        toast.error(msg);
        setLookupRow(null);
        setLookupMissing(false);
      } finally {
        if (gen === lookupGenRef.current) setBusy(false);
        inputRef.current?.focus();
      }
    },
    [uid],
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
      void processBarcodeForCancel(value);
    }, WEDGE_DEBOUNCE_MS);
    return () => {
      if (wedgeTimerRef.current) {
        clearTimeout(wedgeTimerRef.current);
        wedgeTimerRef.current = null;
      }
    };
  }, [value, inputMode, busy, processBarcodeForCancel]);

  const onCameraDecoded = useCallback(
    (text: string) => {
      if (scanPipelineLockRef.current) return;
      scanPipelineLockRef.current = true;
      setValue(text);
      void processBarcodeForCancel(text).finally(() => {
        scanPipelineLockRef.current = false;
      });
    },
    [processBarcodeForCancel],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void processBarcodeForCancel(value);
    }
  };

  if (!allowed) {
    return <Navigate to="/online" replace />;
  }

  return (
    <div className="erp-page max-w-lg mx-auto space-y-6 px-2 sm:px-0">
      <PageHeader
        title="إلغاء من التسليم (مسح)"
        subtitle="امسح أو أدخل الباركود: إن كانت الشحنة عند المخزن يُسجَّل الإلغاء من التسليم تلقائيًا دون زر إضافي."
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
            الكاميرا أو قارئ USB: بعد قراءة باركود صالح يُنفَّذ البحث ثم الإلغاء فورًا للشحنات المسجّلة عند المخزن فقط.
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
                onClick={() => void processBarcodeForCancel(value)}
              >
                {busy ? (
                  <>
                    <Loader2 className="ms-2 h-4 w-4 animate-spin" aria-hidden />
                    جاري البحث أو تسجيل الإلغاء…
                  </>
                ) : (
                  'بحث / تنفيذ'
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <OnlineCameraBarcodeScanner
                active={inputMode === 'camera'}
                fps={18}
                qrbox={cancelDispatchQrbox}
                onDecoded={onCameraDecoded}
                onScannerError={(m) => toast.error(m)}
              />
              <p className="text-center text-xs text-muted-foreground">
                بعد قراءة الباركود يُنفَّذ الإلغاء تلقائيًا إن كانت الشحنة عند المخزن؛ أبقِ الكاميرا ثابتة حتى تظهر النتيجة.
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
              <p className="text-center text-sm text-muted-foreground">أدخل باركودًا أو امسح بالكاميرا.</p>
            ) : busy ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                جاري البحث أو تسجيل الإلغاء…
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
                    الشحنة ما زالت في انتظار أول مسح للمخزن — لا يُسجَّل إلغاء من التسليم من هذه الشاشة.
                  </p>
                ) : null}
                {lookupRow.status === 'handed_to_post' ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    تم تسليم هذه الشحنة للبوسطة مسبقًا — لا يمكن إلغاءها من التسليم من هنا.
                  </p>
                ) : null}
                {lookupRow.status === 'cancelled' ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    هذه الشحنة ملغاة من التسليم (لا تُحسب في انتظار البوسطة). إن أعدت مسح نفس الباركود ستظهر هذه
                    الحالة دون رسالة خطأ.
                  </p>
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
