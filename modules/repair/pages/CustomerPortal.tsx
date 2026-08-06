import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, ClipboardList, LogOut, PackagePlus, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import {
  createCustomerServiceRequestCallable,
  customerPortalLoginCallable,
  getCustomerPortalHomeCallable,
  lookupPortalProductCallable,
  type CustomerPortalHomeResult,
} from '../../auth/services/firebase';
import {
  CUSTOMER_REQUEST_STATUS_LABELS,
  REPLACEMENT_STATUS_LABELS,
  formatRepairOpsDate,
} from '../lib/repairCustomerOpsLabels';
import { mergePortalScannedLine } from '../lib/repairCustomerCustody';
import {
  repairCustomerRequestStatusChipType,
  repairReplacementStatusChipType,
} from '../lib/repairSemanticStatus';
import { REPAIR_JOB_STATUS_LABELS } from '../types';

type PortalLine = {
  productId: string;
  name: string;
  code: string;
  barcode: string;
  quantity: number;
  note: string;
};

const sessionKey = (slug: string) => `customer_portal_session_${slug}`;

const portalStatusMeta = (kind: string, status: string): { label: string; type: 'success' | 'warning' | 'danger' | 'info' | 'muted' } => {
  if (kind === 'طلب عميل') {
    const key = status as keyof typeof CUSTOMER_REQUEST_STATUS_LABELS;
    return {
      label: CUSTOMER_REQUEST_STATUS_LABELS[key] || status || '—',
      type: repairCustomerRequestStatusChipType(status),
    };
  }
  if (kind === 'استبدال') {
    const key = status as keyof typeof REPLACEMENT_STATUS_LABELS;
    return {
      label: REPLACEMENT_STATUS_LABELS[key] || status || '—',
      type: repairReplacementStatusChipType(status),
    };
  }
  const jobLabel = (REPAIR_JOB_STATUS_LABELS as Record<string, string>)[status];
  if (status === 'ready' || status === 'delivered' || status === 'converted') return { label: jobLabel || status, type: 'success' };
  if (status === 'waiting_approval' || status === 'waiting_parts' || status === 'pending_approval') {
    return { label: jobLabel || status, type: 'warning' };
  }
  if (status === 'unrepairable' || status === 'cancelled' || status === 'rejected') {
    return { label: jobLabel || status, type: 'danger' };
  }
  return { label: jobLabel || status || '—', type: 'info' };
};

export const CustomerPortal: React.FC = () => {
  const { tenantSlug = '' } = useParams<{ tenantSlug: string }>();
  const [customerCode, setCustomerCode] = useState('');
  const [pin, setPin] = useState('');
  const [token, setToken] = useState(() => sessionStorage.getItem(sessionKey(tenantSlug)) || '');
  const [home, setHome] = useState<CustomerPortalHomeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'requests' | 'timeline' | 'profile'>('requests');
  const [barcode, setBarcode] = useState('');
  const [lines, setLines] = useState<PortalLine[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  const loadHome = useCallback(async (sessionToken: string) => {
    setLoading(true);
    try {
      const result = await getCustomerPortalHomeCallable(sessionToken);
      setHome(result);
    } catch (e: unknown) {
      sessionStorage.removeItem(sessionKey(tenantSlug));
      setToken('');
      setHome(null);
      toast.error(e instanceof Error ? e.message : 'انتهت جلسة البورتال.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (token) void loadHome(token);
  }, [token, loadHome]);

  const login = async () => {
    if (!customerCode.trim() || !/^\d{6}$/.test(pin)) return;
    setLoading(true);
    try {
      const result = await customerPortalLoginCallable({
        tenantSlug,
        customerCode: customerCode.trim().toUpperCase(),
        pin,
      });
      sessionStorage.setItem(sessionKey(tenantSlug), result.sessionToken);
      setToken(result.sessionToken);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر تسجيل الدخول.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(sessionKey(tenantSlug));
    setToken('');
    setHome(null);
  };

  const resolveBarcode = useCallback(async (value: string) => {
    const raw = value.trim();
    if (!token || !raw) return;
    try {
      const result = await lookupPortalProductCallable({ sessionToken: token, barcode: raw });
      setLines((current) =>
        mergePortalScannedLine(current, {
          productId: result.product.id,
          name: result.product.name,
          code: result.product.code,
          barcode: result.product.barcode,
        }),
      );
      setBarcode('');
      toast.success(`تمت إضافة ${result.product.name}.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'الباركود غير مسجل.');
    }
  }, [token]);

  useEffect(() => {
    if (!scannerOpen) return;
    let cancelled = false;
    void import('html5-qrcode').then(async ({ Html5Qrcode }) => {
      if (cancelled) return;
      const scanner = new Html5Qrcode('customer-portal-scanner');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 140 } },
        async (decodedText) => {
          await scanner.stop().catch(() => undefined);
          scanner.clear();
          scannerRef.current = null;
          setScannerOpen(false);
          await resolveBarcode(decodedText);
        },
        () => undefined,
      ).catch(() => {
        setScannerOpen(false);
        toast.error('تعذر تشغيل الكاميرا. استخدم إدخال الباركود يدويًا.');
      });
    });
    return () => {
      cancelled = true;
      void scannerRef.current?.stop().catch(() => undefined);
    };
  }, [scannerOpen, resolveBarcode]);

  const submitRequest = async () => {
    if (!lines.length) return;
    setLoading(true);
    try {
      const result = await createCustomerServiceRequestCallable({
        sessionToken: token,
        lines: lines.map((line) => ({ barcode: line.barcode, quantity: line.quantity, note: line.note })),
      });
      toast.success(`تم إنشاء الطلب ${result.requestNo}.`);
      setLines([]);
      await loadHome(token);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر إنشاء الطلب.');
    } finally {
      setLoading(false);
    }
  };

  const combined = useMemo(() => {
    type PortalRow = {
      id?: string;
      kind: 'طلب عميل' | 'طلب صيانة' | 'استبدال';
      label: string;
      status?: string;
      createdAt?: string;
      updatedAt?: string;
    };
    const all: PortalRow[] = [
      ...(home?.requests || []).map((row) => ({
        id: row.id,
        kind: 'طلب عميل' as const,
        label: String(row.requestNo || ''),
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      ...(home?.jobs || []).map((row) => ({
        id: row.id,
        kind: 'طلب صيانة' as const,
        label: String(row.receiptNo || ''),
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      ...(home?.replacements || []).map((row) => ({
        id: row.id,
        kind: 'استبدال' as const,
        label: String(row.receiptNo || ''),
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    ];
    return all.sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
    );
  }, [home]);

  const requestUnitsCount = useMemo(
    () => lines.reduce((total, line) => total + Math.max(1, Number(line.quantity) || 1), 0),
    [lines],
  );

  if (!token || !home) {
    return (
      <div className="min-h-screen bg-slate-50 p-4" dir="rtl">
        <div className="mx-auto flex min-h-[80vh] max-w-md items-center">
          <Card className="w-full shadow-sm">
            <CardHeader>
              <CardTitle className="text-center text-2xl">بوابة العميل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                أدخل كود العميل ورمز PIN للمتابعة وإنشاء طلبات الصيانة.
              </p>
              <div className="space-y-1.5">
                <Label>كود العميل</Label>
                <Input
                  dir="ltr"
                  value={customerCode}
                  onChange={(e) => setCustomerCode(e.target.value.toUpperCase())}
                  placeholder="مثال: C-1001"
                />
              </div>
              <div className="space-y-1.5">
                <Label>رمز PIN (6 أرقام)</Label>
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                />
              </div>
              <Button
                className="w-full"
                disabled={loading || !customerCode.trim() || pin.length !== 6}
                onClick={() => void login()}
              >
                {loading ? 'جاري الدخول…' : 'دخول'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-6" dir="rtl">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <h1 className="text-2xl font-bold">مرحبًا، {home.customer.name}</h1>
              <p className="text-sm text-muted-foreground">كود العميل: {home.customer.code}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadHome(token)}>
                <RefreshCw className="ms-1 size-4" />
                تحديث
              </Button>
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="ms-1 size-4" />
                خروج
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <Button variant={tab === 'requests' ? 'default' : 'outline'} onClick={() => setTab('requests')}>
            <ClipboardList className="ms-1 size-4" />
            طلباتي
          </Button>
          <Button variant={tab === 'timeline' ? 'default' : 'outline'} onClick={() => setTab('timeline')}>
            <RefreshCw className="ms-1 size-4" />
            التحديثات
          </Button>
          <Button variant={tab === 'profile' ? 'default' : 'outline'} onClick={() => setTab('profile')}>
            <UserRound className="ms-1 size-4" />
            ملفي
          </Button>
        </div>

        {tab === 'requests' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackagePlus className="size-5" />
                  إنشاء طلب صيانة واحد
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                  امسح كل منتجاتك وأضفها هنا، ثم اضغط «حفظ وإرسال الطلب» مرة واحدة. كل المنتجات ستُحفظ داخل نفس الطلب.
                </div>
                <div className="flex gap-2">
                  <Input
                    dir="ltr"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void resolveBarcode(barcode);
                    }}
                    placeholder="امسح أو اكتب باركود العبوة"
                  />
                  <Button type="button" onClick={() => void resolveBarcode(barcode)}>إضافة للطلب</Button>
                  <Button type="button" variant="outline" onClick={() => setScannerOpen(true)}>
                    <Camera className="size-4" />
                  </Button>
                </div>
                {scannerOpen && (
                  <div className="rounded-lg border bg-black p-2">
                    <div id="customer-portal-scanner" className="min-h-56" />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div className="font-semibold">منتجات الطلب</div>
                  <div className="text-sm text-muted-foreground">
                    {lines.length} منتج · {requestUnitsCount} وحدة
                  </div>
                </div>
                <div className="space-y-2">
                  {lines.map((line) => (
                    <div
                      key={line.productId}
                      className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_120px_2fr_auto] md:items-center"
                    >
                      <div>
                        <div className="font-medium">{line.name}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">{line.barcode}</div>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((rows) =>
                            rows.map((r) =>
                              r.productId === line.productId
                                ? { ...r, quantity: Math.max(1, Number(e.target.value) || 1) }
                                : r,
                            ),
                          )
                        }
                      />
                      <Input
                        value={line.note}
                        onChange={(e) =>
                          setLines((rows) =>
                            rows.map((r) =>
                              r.productId === line.productId ? { ...r, note: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="ملاحظة المنتج أو وصف العطل"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setLines((rows) => rows.filter((r) => r.productId !== line.productId))}
                      >
                        <Trash2 className="size-4 text-rose-600" />
                      </Button>
                    </div>
                  ))}
                </div>
                {lines.length === 0 && (
                  <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                    لم تُضف منتجات بعد. كل باركود تمسحه سيُضاف إلى نفس الطلب، وتكرار نفس الباركود يزيد الكمية.
                  </div>
                )}
                <Button
                  type="button"
                  className="w-full"
                  size="lg"
                  disabled={loading || lines.length === 0}
                  onClick={() => void submitRequest()}
                >
                  {loading
                    ? 'جاري حفظ الطلب…'
                    : lines.length === 0
                      ? 'أضف المنتجات أولًا ثم احفظ الطلب'
                      : `حفظ وإرسال الطلب (${requestUnitsCount} وحدة)`}
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-2">
              {combined.length === 0 ? (
                <Card className="md:col-span-2">
                  <CardContent className="py-10 text-center text-muted-foreground">
                    لا توجد طلبات بعد. أنشئ طلبًا جديدًا من الأعلى.
                  </CardContent>
                </Card>
              ) : (
                combined.map((row) => {
                  const status = portalStatusMeta(row.kind, String(row.status || ''));
                  return (
                    <Card key={`${row.kind}-${row.id}`}>
                      <CardContent className="space-y-3 pt-5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">{row.label || row.id}</div>
                            <div className="text-xs text-muted-foreground">{row.kind}</div>
                          </div>
                          <ErpStatusBadge label={status.label} type={status.type} />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatRepairOpsDate(String(row.updatedAt || row.createdAt || ''))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </>
        )}

        {tab === 'timeline' && (
          <Card>
            <CardHeader>
              <CardTitle>آخر التحديثات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(home.events || []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تحديثات بعد.</p>
              ) : (
                home.events.map((event) => (
                  <div key={event.id} className="border-r-2 border-primary pr-3">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-sm text-muted-foreground">{event.message}</div>
                    <div className="text-xs text-muted-foreground">{formatRepairOpsDate(event.createdAt)}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'profile' && (
          <Card>
            <CardHeader>
              <CardTitle>بياناتي</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>الكود</Label>
                <p>{home.customer.code}</p>
              </div>
              <div>
                <Label>الاسم</Label>
                <p>{home.customer.name}</p>
              </div>
              <div>
                <Label>الهاتف</Label>
                <p dir="ltr" className="text-right">{home.customer.phone || '—'}</p>
              </div>
              <div>
                <Label>العنوان</Label>
                <p>{home.customer.address || '—'}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CustomerPortal;
