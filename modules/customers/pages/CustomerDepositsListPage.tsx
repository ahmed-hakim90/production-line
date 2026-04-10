import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { withTenantPath } from '../../../lib/tenantPaths';
import {
  customerDepositEntryService,
  type CustomerDepositEntryListOrderField,
} from '../services/customerDepositEntryService';
import type { CustomerDepositEntry, DepositListNavState } from '../types';
import { CustomerDepositsDataTable } from '../components/CustomerDepositsDataTable';
import { CustomerDepositEntryDrawer } from '../components/CustomerDepositEntryDrawer';
import { CustomerDepositsKpisSection } from '../components/CustomerDepositsKpisSection';
import { CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE, useClientTablePagination } from '../hooks/useClientTablePagination';
import { OnlineDataPaginationFooter } from '../../online/components/OnlineDataPaginationFooter';
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

export type { DepositListNavState };

function startOfMonthYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function inDepositDateRange(e: CustomerDepositEntry, fromYmd: string, toYmd: string): boolean {
  const d = String(e.depositDate || '').trim();
  return d >= fromYmd && d <= toYmd;
}

function firestoreTsToMillis(ts: unknown): number {
  if (ts == null || typeof ts !== 'object') return 0;
  const t = ts as { toMillis?: () => number; toDate?: () => Date };
  if (typeof t.toMillis === 'function') {
    const m = t.toMillis();
    return typeof m === 'number' && !Number.isNaN(m) ? m : 0;
  }
  if (typeof t.toDate === 'function') {
    const d = t.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  }
  return 0;
}

/** لمقارنة نطاق التاريخ بنفس منطق depositDate (سلسلة YYYY-MM-DD). */
function entryUpdatedYmd(e: CustomerDepositEntry): string | null {
  const ms = firestoreTsToMillis(e.updatedAt);
  if (!ms) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function passesUpdatedAtRange(e: CustomerDepositEntry, fromYmd: string, toYmd: string): boolean {
  const ymd = entryUpdatedYmd(e);
  if (!ymd) return false;
  if (fromYmd && ymd < fromYmd) return false;
  if (toYmd && ymd > toYmd) return false;
  return true;
}

export const CustomerDepositsListPage: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const branding = useAppStore((s) => s.systemSettings.branding);

  const [rows, setRows] = useState<CustomerDepositEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [rangeFrom, setRangeFrom] = useState(startOfMonthYmd);
  const [rangeTo, setRangeTo] = useState(todayYmd);
  const [listOrder, setListOrder] = useState<CustomerDepositEntryListOrderField>('depositDate');
  const [updatedRangeFrom, setUpdatedRangeFrom] = useState('');
  const [updatedRangeTo, setUpdatedRangeTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await customerDepositEntryService.listRecent(800, { orderByField: listOrder });
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [listOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows.filter((r) => inDepositDateRange(r, rangeFrom, rangeTo));
    const uf = updatedRangeFrom.trim();
    const ut = updatedRangeTo.trim();
    if (uf || ut) {
      list = list.filter((r) => passesUpdatedAtRange(r, uf, ut));
    }
    const t = q.trim().toLowerCase();
    if (t) {
      list = list.filter(
        (r) =>
          r.depositorName.toLowerCase().includes(t) ||
          String(r.depositorAccountNumber || '')
            .toLowerCase()
            .includes(t) ||
          r.customerNameSnapshot.toLowerCase().includes(t) ||
          r.customerCodeSnapshot.toLowerCase().includes(t) ||
          r.bankLabelSnapshot.toLowerCase().includes(t),
      );
    }
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    return list;
  }, [rows, q, statusFilter, rangeFrom, rangeTo, updatedRangeFrom, updatedRangeTo]);

  const navIds = useMemo(() => filtered.map((r) => r.id), [filtered]);

  const navState: DepositListNavState = useMemo(() => ({ depositNavIds: navIds }), [navIds]);

  const tp = (path: string) => withTenantPath(tenantSlug, path);

  const filterResetKey = `${q}|${statusFilter}|${rangeFrom}|${rangeTo}|${updatedRangeFrom}|${updatedRangeTo}|${listOrder}`;
  const listPg = useClientTablePagination(filtered, CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE, filterResetKey);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEntryId, setDrawerEntryId] = useState<string | null>(null);

  const canNew = can('customerDeposits.create') || can('customerDeposits.manage');

  return (
    <div className="erp-page space-y-6">
      <PageHeader
        title="إيداعات العملاء — البنك"
        subtitle={
          branding?.factoryName
            ? `الشركة: ${branding.factoryName} — تسجيل ومتابعة الإيداعات والمطابقة`
            : 'تسجيل ومتابعة إيداعات البنك والمطابقة مع العملاء'
        }
        icon="landmark"
        primaryAction={
          canNew
            ? {
                label: 'إيداع جديد',
                icon: 'add',
                onClick: () => navigate(tp('/customers/deposits/new')),
              }
            : undefined
        }
        secondaryAction={
          can('customerDeposits.manage')
            ? {
                label: 'إعداد العملاء والبنوك',
                icon: 'settings',
                onClick: () => navigate(tp('/customers/deposits/master')),
              }
            : undefined
        }
      />

      <CustomerDepositsKpisSection
        entries={rows}
        dateFrom={rangeFrom}
        dateTo={rangeTo}
        onDateFromChange={setRangeFrom}
        onDateToChange={setRangeTo}
      />

      <Card className="shadow-sm">
        <CardHeader className="space-y-3 border-b bg-muted/30 px-4 py-4 sm:px-6">
          <div>
            <CardTitle className="text-base font-semibold">سجل الإيداعات</CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              يظهر كل إيداع ضمن نطاق تاريخ الإيداع أعلاه؛ يمكن ترتيب التحميل حسب تاريخ الإيداع أو آخر تعديل (أحدث 800
              سجلًا حسب الخيار). فلتر «آخر تعديل» يطبّق على الطبقة المحمّلة بعد فلتر تاريخ الإيداع. انقر صفًا لعرض
              التفاصيل في درج جانبي.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-4 pt-1">
            <div className="min-w-[200px] flex-1 space-y-2">
              <Label htmlFor="cd-deposits-search" className="text-xs text-muted-foreground">
                بحث (مودع، رقم حساب، عميل، بنك)
              </Label>
              <Input
                id="cd-deposits-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جزء من الاسم أو الرقم…"
              />
            </div>
            <div className="w-full space-y-2 sm:w-[200px]">
              <Label htmlFor="cd-deposits-status" className="text-xs text-muted-foreground">
                الحالة
              </Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
              >
                <SelectTrigger id="cd-deposits-status">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="pending">معلق</SelectItem>
                  <SelectItem value="confirmed">موكّد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full space-y-2 sm:w-[220px]">
              <Label htmlFor="cd-deposits-order" className="text-xs text-muted-foreground">
                ترتيب التحميل
              </Label>
              <Select
                value={listOrder}
                onValueChange={(v) => setListOrder(v as CustomerDepositEntryListOrderField)}
              >
                <SelectTrigger id="cd-deposits-order">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="depositDate">تاريخ الإيداع (الأحدث)</SelectItem>
                  <SelectItem value="updatedAt">آخر تعديل (الأحدث)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:max-w-md sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cd-updated-from" className="text-xs text-muted-foreground">
                  آخر تعديل من (اختياري)
                </Label>
                <Input
                  id="cd-updated-from"
                  type="date"
                  value={updatedRangeFrom}
                  onChange={(e) => setUpdatedRangeFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cd-updated-to" className="text-xs text-muted-foreground">
                  آخر تعديل إلى (اختياري)
                </Label>
                <Input
                  id="cd-updated-to"
                  type="date"
                  value={updatedRangeTo}
                  onChange={(e) => setUpdatedRangeTo(e.target.value)}
                />
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              تحديث القائمة
            </Button>
          </div>
        </CardHeader>
        <CardContent className="border-b bg-muted/20 px-4 py-4 sm:px-6">
          <p className="text-xs text-muted-foreground">عدد النتائج بعد الفلتر</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{filtered.length}</p>
        </CardContent>
        <CardContent className="p-0">
          <CustomerDepositsDataTable
            rows={listPg.slice}
            emptyMessage="لا توجد إيداعات مطابقة للفلتر"
            loading={loading}
            showLastUpdatedColumn={listOrder === 'updatedAt'}
            onRowClick={(r) => {
              setDrawerEntryId(r.id);
              setDrawerOpen(true);
            }}
          />
        </CardContent>
        <OnlineDataPaginationFooter
          page={listPg.page}
          totalPages={listPg.totalPages}
          totalItems={listPg.totalItems}
          onPageChange={listPg.setPage}
          itemLabel="إيداع"
        />
      </Card>

      <CustomerDepositEntryDrawer
        tenantSlug={tenantSlug}
        entryId={drawerEntryId}
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) setDrawerEntryId(null);
        }}
        navState={navState}
        navIds={navIds}
        onNavigate={setDrawerEntryId}
        onMutate={() => void load()}
      />
    </div>
  );
};
