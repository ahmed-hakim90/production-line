import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { repairBranchService } from '../services/repairBranchService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import { resolveUserRepairBranchIds, type FirestoreUserWithRepair, type RepairBranch, type RepairTreasuryEntry, type RepairTreasurySession } from '../types';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);

export const RepairTreasury: React.FC = () => {
  const { can } = usePermission();
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [sessions, setSessions] = useState<RepairTreasurySession[]>([]);
  const [entries, setEntries] = useState<RepairTreasuryEntry[]>([]);
  const [openingBalance, setOpeningBalance] = useState('0');
  const [closingBalance, setClosingBalance] = useState('0');
  const [entryType, setEntryType] = useState<'INCOME' | 'EXPENSE' | 'TRANSFER_OUT' | 'TRANSFER_IN'>('INCOME');
  const [entryAmount, setEntryAmount] = useState('0');
  const [entryNote, setEntryNote] = useState('');
  const allowedBranches = useMemo(() => {
    if (can('repair.branches.manage')) return branches;
    const baseUserBranchIds = resolveUserRepairBranchIds(user);
    const userId = String(user?.id || '').trim();
    const employeeId = String(currentEmployee?.id || '').trim();
    return branches.filter((branch) => {
      const id = String(branch.id || '');
      if (!id) return false;
      if (baseUserBranchIds.includes(id)) return true;
      if (userId && (branch.technicianIds || []).includes(userId)) return true;
      if (employeeId && String(branch.managerEmployeeId || '') === employeeId) return true;
      return false;
    });
  }, [branches, can, currentEmployee?.id, user]);

  const load = async (selectedBranchId: string, options?: { suppressToast?: boolean }) => {
    if (!selectedBranchId) return;
    try {
      const [rowsSessions, rowsEntries] = await Promise.all([
        repairTreasuryService.listSessions(selectedBranchId),
        repairTreasuryService.listEntries(selectedBranchId),
      ]);
      setSessions(rowsSessions);
      setEntries(rowsEntries);
    } catch (e: any) {
      setSessions([]);
      setEntries([]);
      if (!options?.suppressToast) {
        toast.error(e?.message || 'تعذر تحميل بيانات خزينة الصيانة.');
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const rows = await repairBranchService.list();
        if (!mounted) return;
        setBranches(rows);
        const defaultBranch = rows[0]?.id || '';
        setBranchId(defaultBranch);
        if (!defaultBranch) {
          setSessions([]);
          setEntries([]);
          return;
        }
        await load(defaultBranch, { suppressToast: true });
      } catch (e: any) {
        if (!mounted) return;
        setBranches([]);
        setBranchId('');
        setSessions([]);
        setEntries([]);
        toast.error(e?.message || 'ليس لديك صلاحية للوصول إلى بيانات خزينة الصيانة.');
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!allowedBranches.length) {
      setBranchId('');
      setSessions([]);
      setEntries([]);
      return;
    }
    const isCurrentAllowed = allowedBranches.some((branch) => branch.id === branchId);
    if (isCurrentAllowed) return;
    const next = String(allowedBranches[0].id || '');
    setBranchId(next);
    void load(next, { suppressToast: true });
  }, [allowedBranches, branchId]);

  const openSession = useMemo(
    () => sessions.find((s) => s.status === 'open') || null,
    [sessions],
  );

  const sessionEntries = useMemo(
    () => entries.filter((entry) => !openSession?.id || entry.sessionId === openSession.id),
    [entries, openSession?.id],
  );

  const computedBalance = useMemo(() => {
    if (!openSession) return 0;
    const deltas = sessionEntries.reduce((sum, entry) => {
      if (entry.entryType === 'OPENING') return sum + Number(entry.amount || 0);
      if (entry.entryType === 'INCOME' || entry.entryType === 'TRANSFER_IN') return sum + Number(entry.amount || 0);
      if (entry.entryType === 'EXPENSE' || entry.entryType === 'TRANSFER_OUT') return sum - Number(entry.amount || 0);
      return sum;
    }, 0);
    return deltas;
  }, [openSession, sessionEntries]);

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-sky-50 to-white">
        <CardContent className="pt-6">
          <h1 className="text-2xl font-bold">خزينة الصيانة</h1>
          <p className="text-sm text-muted-foreground mt-1">فتح وتقفيل الخزينة اليومية وتسجيل المصروفات والتحويلات.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 grid md:grid-cols-3 gap-2 items-end">
          <div>
            <Label>الفرع</Label>
            <Select value={branchId} onValueChange={(value) => { setBranchId(value); void load(value); }}>
              <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
              <SelectContent>
                {allowedBranches.map((branch) => <SelectItem key={branch.id} value={branch.id || ''}>{branch.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm rounded border p-2">
            <div className="text-muted-foreground">حالة الخزينة</div>
            <div className="font-bold">{openSession ? 'مفتوحة' : 'مقفلة'}</div>
          </div>
          <div className="text-sm rounded border p-2">
            <div className="text-muted-foreground">الرصيد الحالي (حسابي)</div>
            <div className="font-bold text-emerald-600">{fmt(computedBalance)}</div>
          </div>
        </CardContent>
      </Card>

      {!openSession ? (
        <Card>
          <CardHeader><CardTitle>فتح خزينة</CardTitle></CardHeader>
          <CardContent className="flex items-end gap-2">
            <div className="max-w-xs">
              <Label>رصيد افتتاحي</Label>
              <Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
            </div>
            <Button onClick={async () => {
              try {
                await repairTreasuryService.openSession({
                  branchId,
                  openingBalance: Number(openingBalance || 0),
                  openedBy: user?.id || '',
                  openedByName: user?.displayName || user?.email || 'system',
                });
                toast.success('تم فتح الخزينة.');
                await load(branchId);
              } catch (e: any) {
                toast.error(e?.message || 'تعذر فتح الخزينة.');
              }
            }} disabled={!branchId}>
              فتح
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>إضافة حركة خزينة</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-2 items-end">
              <div>
                <Label>نوع الحركة</Label>
                <Select value={entryType} onValueChange={(v) => setEntryType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOME">إيراد</SelectItem>
                    <SelectItem value="EXPENSE">مصروف</SelectItem>
                    <SelectItem value="TRANSFER_OUT">تحويل للخزينة الرئيسية</SelectItem>
                    <SelectItem value="TRANSFER_IN">تحويل وارد من الرئيسي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المبلغ</Label>
                <Input type="number" value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} />
              </div>
              <div>
                <Label>ملاحظة</Label>
                <Input value={entryNote} onChange={(e) => setEntryNote(e.target.value)} />
              </div>
              <Button onClick={async () => {
                try {
                  await repairTreasuryService.addEntry({
                    branchId,
                    entryType,
                    amount: Number(entryAmount || 0),
                    note: entryNote,
                    createdBy: user?.id || '',
                    createdByName: user?.displayName || user?.email || 'system',
                  });
                  setEntryNote('');
                  toast.success('تم تسجيل الحركة.');
                  await load(branchId);
                } catch (e: any) {
                  toast.error(e?.message || 'تعذر تسجيل الحركة.');
                }
              }}>
                إضافة
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>تقفيل الخزينة</CardTitle></CardHeader>
            <CardContent className="flex items-end gap-2">
              <div className="max-w-xs">
                <Label>رصيد الإقفال الفعلي</Label>
                <Input type="number" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} />
              </div>
              <Button variant="destructive" onClick={async () => {
                try {
                  await repairTreasuryService.closeSession({
                    branchId,
                    closingBalance: Number(closingBalance || 0),
                    closedBy: user?.id || '',
                    closedByName: user?.displayName || user?.email || 'system',
                  });
                  toast.success('تم تقفيل الخزينة.');
                  await load(branchId);
                } catch (e: any) {
                  toast.error(e?.message || 'تعذر تقفيل الخزينة.');
                }
              }}>
                تقفيل
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader><CardTitle>آخر الحركات</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {entries.slice(0, 20).map((entry) => (
            <div key={entry.id} className="rounded border px-2 py-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{entry.entryType}</Badge>
                <span>{entry.note || '—'}</span>
              </div>
              <div className="font-mono">{fmt(entry.amount)}</div>
            </div>
          ))}
          {entries.length === 0 && <div className="text-muted-foreground">لا توجد حركات بعد.</div>}
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairTreasury;
