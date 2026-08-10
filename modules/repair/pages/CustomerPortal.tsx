import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, LogOut, PackagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RepairOpsPageShell } from '../components/RepairOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import {
  createCustomerServiceRequestCallable,
  customerPortalLoginCallable,
  getCustomerPortalHomeCallable,
  lookupPortalProductCallable,
  type CustomerPortalHomeResult,
} from '../../auth/services/firebase';
import { CustomerPortalBottomBar } from '../components/CustomerPortalBottomBar';
import { type CustomerPortalTab } from '../lib/customerPortalBottomBar';
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
import { mapLegacyRepairStatus } from '../utils/repairStatusIds';

type PortalLine = {
  productId: string;
  name: string;
  code: string;
  barcode: string;
  /** Editable draft; normalize with `parsePortalLineQuantity` before submit/scan-merge. */
  quantity: string;
  note: string;
};

const sessionKey = (slug: string) => `customer_portal_session_${slug}`;

const parsePortalLineQuantity = (value: string): number =>
  Math.max(1, Math.round(Number(String(value).trim()) || 1));

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
  const canonical = mapLegacyRepairStatus(status);
  const jobLabel =
    (REPAIR_JOB_STATUS_LABELS as Record<string, string>)[canonical]
    || (REPAIR_JOB_STATUS_LABELS as Record<string, string>)[status];
  if (canonical === 'ready' || canonical === 'delivered' || status === 'converted') {
    return { label: jobLabel || status, type: 'success' };
  }
  if (canonical === 'waiting_approval' || canonical === 'waiting_parts' || status === 'pending_approval') {
    return { label: jobLabel || status, type: 'warning' };
  }
  if (canonical === 'unrepairable' || canonical === 'cancelled' || status === 'rejected') {
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
  const [tab, setTab] = useState<CustomerPortalTab>('requests');
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
      setLines((current) => {
        const merged = mergePortalScannedLine(
          current.map((line) => ({
            ...line,
            quantity: parsePortalLineQuantity(line.quantity),
          })),
          {
            productId: result.product.id,
            name: result.product.name,
            code: result.product.code,
            barcode: result.product.barcode,
          },
        );
        return merged.map((line) => ({ ...line, quantity: String(line.quantity) }));
      });
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
        lines: lines.map((line) => ({
          barcode: line.barcode,
          quantity: parsePortalLineQuantity(line.quantity),
          note: line.note,
        })),
      });
      toast.success(`تم إنشاء الطلب ${result.requestNo}.`);
      setLines([]);
      setTab('requests');
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
    () => lines.reduce((total, line) => total + parsePortalLineQuantity(line.quantity), 0),
    [lines],
  );

  if (!token || !home) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] p-4" dir="rtl">
        <RepairOpsPageShell className="mx-auto flex min-h-[80vh] max-w-md items-center" eyebrow="الصيانة" rangeLabel="بوابة العميل">
          <OpsDashPanel title="بوابة العميل" accent="repair">
            <div className="space-y-4">
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
            </div>
          </OpsDashPanel>
        </RepairOpsPageShell>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] p-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-[calc(5.5rem+env(safe-area-inset-bottom))]" dir="rtl">
      <RepairOpsPageShell
        className="mx-auto max-w-5xl"
        eyebrow="الصيانة"
        rangeLabel={`مرحبًا، ${home.customer.name} — كود العميل: ${home.customer.code}`}
        actions={(
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadHome(token)}>
            <RefreshCw className="ms-1 size-4" />
            تحديث
          </Button>
        )}
      >
        {tab === 'compose' && (
          <OpsDashPanel
            title="إنشاء طلب صيانة"
            accent="repair"
            action={<PackagePlus className="size-5 text-muted-foreground" aria-hidden />}
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.1)] p-3 text-sm text-[rgb(var(--color-primary))]">
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
                <Button type="button" onClick={() => void resolveBarcode(barcode)}>إضافة</Button>
                <Button type="button" variant="outline" aria-label="مسح بالكاميرا" onClick={() => setScannerOpen(true)}>
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
                    className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_120px_2fr_auto] md:items-end"
                  >
                    <div>
                      <div className="font-medium">{line.name}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{line.barcode}</div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">الكمية</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        dir="ltr"
                        value={line.quantity}
                        onChange={(e) => {
                          const value = e.target.value;
                          setLines((rows) =>
                            rows.map((r) =>
                              r.productId === line.productId ? { ...r, quantity: value } : r,
                            ),
                          );
                        }}
                        onBlur={() => {
                          setLines((rows) =>
                            rows.map((r) =>
                              r.productId === line.productId
                                ? { ...r, quantity: String(parsePortalLineQuantity(r.quantity)) }
                                : r,
                            ),
                          );
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">ملاحظة</Label>
                      <Input
                        value={line.note}
                        onChange={(e) =>
                          setLines((rows) =>
                            rows.map((r) =>
                              r.productId === line.productId ? { ...r, note: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="وصف العطل"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="حذف المنتج"
                      onClick={() => setLines((rows) => rows.filter((r) => r.productId !== line.productId))}
                    >
                      <Trash2 className="size-4 text-[rgb(var(--color-danger))]" />
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
            </div>
          </OpsDashPanel>
        )}

        {tab === 'requests' && (
          <div className="grid gap-3 md:grid-cols-2">
            {combined.length === 0 ? (
              <OpsDashPanel title="الطلبات" accent="repair" className="md:col-span-2">
                <div className="space-y-4 py-6 text-center">
                  <p className="text-muted-foreground">لا توجد طلبات بعد.</p>
                  <Button type="button" onClick={() => setTab('compose')}>
                    <PackagePlus className="ms-1 size-4" />
                    إنشاء طلب جديد
                  </Button>
                </div>
              </OpsDashPanel>
            ) : (
              combined.map((row) => {
                const status = portalStatusMeta(row.kind, String(row.status || ''));
                return (
                  <OpsDashPanel key={`${row.kind}-${row.id}`} title={row.label || row.id || '—'} accent="repair">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-xs text-muted-foreground">{row.kind}</div>
                        <ErpStatusBadge label={status.label} type={status.type} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatRepairOpsDate(String(row.updatedAt || row.createdAt || ''))}
                      </div>
                    </div>
                  </OpsDashPanel>
                );
              })
            )}
          </div>
        )}

        {tab === 'timeline' && (
          <OpsDashPanel title="آخر التحديثات" accent="repair">
            <div className="space-y-3">
              {(home.events || []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تحديثات بعد.</p>
              ) : (
                home.events.map((event) => (
                  <div key={event.id} className="border-r-2 border-[rgb(var(--color-primary))] pr-3">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-sm text-muted-foreground">{event.message}</div>
                    <div className="text-xs text-muted-foreground">{formatRepairOpsDate(event.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          </OpsDashPanel>
        )}

        {tab === 'profile' && (
          <OpsDashPanel title="بياناتي" accent="repair">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
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
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={logout}>
                <LogOut className="ms-1 size-4" />
                تسجيل الخروج
              </Button>
            </div>
          </OpsDashPanel>
        )}
      </RepairOpsPageShell>

      <CustomerPortalBottomBar
        activeTab={tab}
        onTabChange={setTab}
        requestsCount={combined.length}
        eventsCount={(home.events || []).length}
      />
    </div>
  );
};

export default CustomerPortal;
