import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { toast } from '../../../components/Toast';
import { withTenantPath } from '../../../lib/tenantPaths';
import { customerDepositCustomerService } from '../services/customerDepositCustomerService';
import { customerDepositBankAccountService } from '../services/customerDepositBankAccountService';
import { customerDepositEntryService } from '../services/customerDepositEntryService';
import { CustomerDepositStatusBadge } from '../components/CustomerDepositStatusBadge';
import type { CustomerDepositEntry } from '../types';
import { normalizeBankAccountNumber, normalizeCustomerCode } from '../utils/normalize';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const fmtMoney = (n: number) =>
  (Number(n) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RECENT_COUNT = 10;
/** القائمة المنسدلة لا تحمّل آلاف السجلات؛ البحث بالكود يجلب عميلًا واحدًا فقط. */
const DEPOSIT_FORM_CUSTOMERS_LIMIT = 500;
const DEPOSIT_FORM_BANKS_LIMIT = 200;

type PresetCustomerLoadStatus = 'idle' | 'loading' | 'success' | 'failed';

export const CustomerDepositNewPage: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tp = (path: string) => withTenantPath(tenantSlug, path);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const presetCustomerIdParam = (searchParams.get('customerId') ?? '').trim();

  const [customers, setCustomers] = useState<{ id: string; code: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; accountNumber: string; bankLabel: string }[]>([]);

  const [amount, setAmount] = useState('');
  const [depositorName, setDepositorName] = useState('');
  const [depositorAccountNumber, setDepositorAccountNumber] = useState('');
  const [customerCodeInput, setCustomerCodeInput] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerNameSnapshot, setCustomerNameSnapshot] = useState('');
  const [customerCodeSnapshot, setCustomerCodeSnapshot] = useState('');
  const [companyBankAccountId, setCompanyBankAccountId] = useState('');
  const [bankLabelSnapshot, setBankLabelSnapshot] = useState('');
  const [accountNumberInput, setAccountNumberInput] = useState('');
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [recentDeposits, setRecentDeposits] = useState<CustomerDepositEntry[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [presetCustomerLoadStatus, setPresetCustomerLoadStatus] =
    useState<PresetCustomerLoadStatus>('idle');

  useEffect(() => {
    if (!presetCustomerIdParam) {
      setPresetCustomerLoadStatus('idle');
      return;
    }
    let cancelled = false;
    setPresetCustomerLoadStatus('loading');
    void (async () => {
      const c = await customerDepositCustomerService.getById(presetCustomerIdParam);
      if (cancelled) return;
      if (!c) {
        toast.error('العميل غير موجود');
        setPresetCustomerLoadStatus('failed');
        setSearchParams({}, { replace: true });
        return;
      }
      setCustomerId(c.id);
      setCustomerNameSnapshot(c.name);
      setCustomerCodeSnapshot(c.code);
      setCustomerCodeInput(c.code);
      setCustomers((prev) =>
        prev.some((x) => x.id === c.id) ? prev : [...prev, { id: c.id, code: c.code, name: c.name }],
      );
      setPresetCustomerLoadStatus('success');
    })();
    return () => {
      cancelled = true;
    };
  }, [presetCustomerIdParam, setSearchParams]);

  useEffect(() => {
    void (async () => {
      const [c, a] = await Promise.all([
        customerDepositCustomerService.getActive({ limit: DEPOSIT_FORM_CUSTOMERS_LIMIT }),
        customerDepositBankAccountService.getActive({ limit: DEPOSIT_FORM_BANKS_LIMIT }),
      ]);
      setCustomers(c.map((x) => ({ id: x.id, code: x.code, name: x.name })));
      setAccounts(
        a.map((x) => ({ id: x.id, accountNumber: x.accountNumber, bankLabel: x.bankLabel })),
      );
    })();
  }, []);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const list = await customerDepositEntryService.listRecent(RECENT_COUNT);
      setRecentDeposits(list.slice(0, RECENT_COUNT));
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const presetCustomerLocked = useMemo(
    () => Boolean(presetCustomerIdParam) && presetCustomerLoadStatus === 'success',
    [presetCustomerIdParam, presetCustomerLoadStatus],
  );

  const clearPresetCustomer = useCallback(() => {
    setSearchParams({}, { replace: true });
    setCustomerId('');
    setCustomerNameSnapshot('');
    setCustomerCodeSnapshot('');
    setCustomerCodeInput('');
    setPresetCustomerLoadStatus('idle');
  }, [setSearchParams]);

  const canSave = useMemo(() => {
    if (!customerId.trim() || !companyBankAccountId.trim()) return false;
    if (!depositorName.trim() || !depositDate.trim()) return false;
    const amt = Number(amount);
    if (!amount.trim() || Number.isNaN(amt) || amt <= 0) return false;
    return true;
  }, [amount, companyBankAccountId, customerId, depositDate, depositorName]);

  const resolveCustomerByCode = async () => {
    const code = normalizeCustomerCode(customerCodeInput);
    if (!code) {
      toast.error('أدخل كود العميل');
      return;
    }
    const c = await customerDepositCustomerService.findByCode(code);
    if (!c) {
      toast.error('لا يوجد عميل بهذا الكود');
      return;
    }
    setCustomerId(c.id);
    setCustomerNameSnapshot(c.name);
    setCustomerCodeSnapshot(c.code);
    setCustomers((prev) =>
      prev.some((x) => x.id === c.id) ? prev : [...prev, { id: c.id, code: c.code, name: c.name }],
    );
    toast.success('تم جلب بيانات العميل');
  };

  const resolveBankByAccount = async () => {
    const norm = normalizeBankAccountNumber(accountNumberInput);
    if (!norm) {
      toast.error('أدخل رقم الحساب');
      return;
    }
    const acc = await customerDepositBankAccountService.findByAccountNumber(accountNumberInput);
    if (!acc) {
      toast.error('لا يوجد حساب بهذا الرقم في الماستر');
      return;
    }
    setCompanyBankAccountId(acc.id);
    setBankLabelSnapshot(acc.bankLabel);
    setAccountNumberInput(acc.accountNumber);
    setAccounts((prev) =>
      prev.some((x) => x.id === acc.id)
        ? prev
        : [...prev, { id: acc.id, accountNumber: acc.accountNumber, bankLabel: acc.bankLabel }],
    );
    toast.success('تم جلب بيانات البنك');
  };

  const onSelectCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setCustomerNameSnapshot(c.name);
      setCustomerCodeSnapshot(c.code);
      setCustomerCodeInput(c.code);
    }
  };

  const onSelectAccount = (id: string) => {
    setCompanyBankAccountId(id);
    const a = accounts.find((x) => x.id === id);
    if (a) {
      setBankLabelSnapshot(a.bankLabel);
      setAccountNumberInput(a.accountNumber);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !companyBankAccountId) {
      toast.error('اختر العميل وحساب البنك (أو استخدم البحث بالكود / رقم الحساب)');
      return;
    }
    setBusy(true);
    try {
      const id = await customerDepositEntryService.create({
        amount: Number(amount),
        depositorName,
        depositorAccountNumber,
        customerId,
        customerCodeSnapshot,
        customerNameSnapshot,
        companyBankAccountId,
        bankLabelSnapshot,
        depositDate,
      });
      if (!id) throw new Error('فشل الإنشاء');
      toast.success('تم تسجيل الإيداع — يمكنك تسجيل التالي');
      setAmount('');
      setDepositorName('');
      setDepositorAccountNumber('');
      setDepositDate(new Date().toISOString().slice(0, 10));
      void loadRecent();
      requestAnimationFrame(() => {
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erp-page mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="إيداع جديد"
        subtitle={
          presetCustomerLocked
            ? `للعميل: ${customerCodeSnapshot} — ${customerNameSnapshot}`
            : 'يُسجّل كـ «معلق» حتى تأكيد الخزينة'
        }
        icon="landmark"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="border-b bg-muted/30 px-4 py-4 sm:px-6">
            <CardTitle className="text-base font-semibold">نموذج الإيداع</CardTitle>
            <CardDescription className="text-xs">
              {presetCustomerLocked
                ? 'تم تحديد العميل من صفحة الكشف. أكمل بيانات الإيداع والبنك أدناه.'
                : `«جلب بالكود» يستعلم عن عميل واحد فقط. القائمة تعرض حتى ${DEPOSIT_FORM_CUSTOMERS_LIMIT} عميلًا نشطًا — لباقي العملاء أدخل الكود واضغط جلب.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">القيمة</Label>
                <Input
                  ref={amountInputRef}
                  id="deposit-amount-input"
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">بيانات المودع</Label>
                <Input required value={depositorName} onChange={(e) => setDepositorName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">رقم حساب المودع (اختياري)</Label>
                <Input value={depositorAccountNumber} onChange={(e) => setDepositorAccountNumber(e.target.value)} />
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <Label className="text-xs text-muted-foreground">العميل</Label>
                {presetCustomerIdParam && presetCustomerLoadStatus === 'loading' ? (
                  <p className="text-sm text-muted-foreground">جاري تحميل بيانات العميل…</p>
                ) : presetCustomerLocked ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      <span className="font-mono tabular-nums" dir="ltr">
                        {customerCodeSnapshot}
                      </span>
                      <span className="text-muted-foreground"> — </span>
                      {customerNameSnapshot}
                    </p>
                    <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={clearPresetCustomer}>
                      تغيير العميل
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Input
                        id="deposit-customer-code-fetch"
                        placeholder="كود العميل"
                        aria-label="كود العميل للجلب"
                        value={customerCodeInput}
                        onChange={(e) => setCustomerCodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void resolveCustomerByCode();
                          }
                        }}
                      />
                      <Button type="button" variant="default" onClick={() => void resolveCustomerByCode()}>
                        جلب
                      </Button>
                    </div>
                    <Select
                      value={customerId || '__none__'}
                      onValueChange={(v) => {
                        if (v === '__none__') {
                          setCustomerId('');
                          setCustomerNameSnapshot('');
                          setCustomerCodeSnapshot('');
                          return;
                        }
                        onSelectCustomer(v);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="أو اختر من القائمة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.code} — {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {customerNameSnapshot ? (
                      <p className="text-sm text-emerald-600">{customerNameSnapshot}</p>
                    ) : null}
                  </>
                )}
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <Label className="text-xs text-muted-foreground">حساب الشركة في البنك</Label>
                <div className="flex gap-2">
                  <Input
                    id="deposit-bank-account-fetch"
                    placeholder="رقم الحساب"
                    aria-label="رقم الحساب للجلب"
                    value={accountNumberInput}
                    onChange={(e) => setAccountNumberInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void resolveBankByAccount();
                      }
                    }}
                  />
                  <Button type="button" variant="default" onClick={() => void resolveBankByAccount()}>
                    جلب
                  </Button>
                </div>
                <Select
                  value={companyBankAccountId || '__none__'}
                  onValueChange={(v) => {
                    if (v === '__none__') {
                      setCompanyBankAccountId('');
                      setBankLabelSnapshot('');
                      return;
                    }
                    onSelectAccount(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="أو اختر من القائمة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.accountNumber} — {a.bankLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {bankLabelSnapshot && <p className="text-sm text-emerald-600">{bankLabelSnapshot}</p>}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">تاريخ الإيداع</Label>
                <Input type="date" required value={depositDate} onChange={(e) => setDepositDate(e.target.value)} />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="submit" disabled={busy || !canSave}>
                  حفظ
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link to={tp('/customers/deposits')}>إلغاء</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="lg:col-span-1">
          <Card className="shadow-sm lg:sticky lg:top-4">
            <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-4">
              <CardTitle className="text-sm font-semibold">آخر {RECENT_COUNT} إيداعات</CardTitle>
              <CardDescription className="text-xs">الأحدث أولًا حسب تاريخ الإيداع.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recentLoading ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">جاري التحميل…</p>
              ) : recentDeposits.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">لا توجد إيداعات بعد.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {recentDeposits.map((d) => (
                    <li key={d.id}>
                      <Link
                        to={tp(`/customers/deposits/${d.id}`)}
                        className="block px-4 py-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-xs text-muted-foreground">
                              {typeof d.depositSerial === 'number' && d.depositSerial >= 1
                                ? `رقم ${d.depositSerial} — `
                                : ''}
                              {d.depositDate}
                            </p>
                            <p className="text-sm font-semibold tabular-nums">{fmtMoney(Number(d.amount) || 0)}</p>
                            <p className="truncate text-xs text-muted-foreground">{d.customerNameSnapshot}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{d.bankLabelSnapshot}</p>
                          </div>
                          <CustomerDepositStatusBadge status={d.status} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
};
