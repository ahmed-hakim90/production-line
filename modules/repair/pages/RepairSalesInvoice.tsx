import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, Trash2, XCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { SearchableSelect } from '@/components/UI';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import { repairInvoiceActiveChipType } from '../lib/repairSemanticStatus';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { resolveUserRepairBranchIds, type FirestoreUserWithRepair, type RepairBranch, type RepairSalesInvoice, type RepairSalesInvoiceLine, type RepairSparePart, type RepairSparePartStock } from '../types';
import { resolveRepairAccessContext } from '../utils/repairAccessContext';
import { repairBranchService } from '../services/repairBranchService';
import { sparePartsService } from '../services/sparePartsService';
import { repairSalesInvoiceService } from '../services/repairSalesInvoiceService';
import { materialService } from '../../manufacturing/services/materialService';
import { isMaterialAvailableForSpareParts } from '../../manufacturing/utils/isMaterialAvailableForSpareParts';
import type { Material } from '../../manufacturing/types';
import { stockService } from '../../inventory/services/stockService';
import {
  buildRepairSalesInvoicePartOptions,
  type RepairSalesInvoicePartOption,
} from '../lib/repairSalesInvoicePartOptions';
import { normalizeWhatsAppPhone } from '../utils/customerPhone';
import { exportHRData } from '../../../utils/exportExcel';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { CustomerPicker } from '@/modules/customers/components/CustomerPicker';
import { customerService } from '@/modules/customers/services/customerService';
import type { Customer } from '@/modules/customers/types';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { KPICard } from '@/src/components/erp/KPICard';
import { RepairSalesInvoicePrint } from '../components/RepairSalesInvoicePrint';
import { useManagedPrint } from '../../../utils/printManager';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);
const PAGE_SIZE = 20;

type DraftLine = RepairSalesInvoiceLine & { key: string; materialId?: string };

export const RepairSalesInvoicePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { dir } = useAppDirection();
  const { can } = usePermission();
  const canCreate = can('repair.salesInvoice.create');
  const canView = canCreate || can('repair.salesInvoice.view');
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const repairCtx = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile: user,
        userRoleName,
        systemSettings,
        permissions: userPermissions,
      }),
    [user, userRoleName, systemSettings, userPermissions],
  );

  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [parts, setParts] = useState<RepairSparePart[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [warehouseQtyByMaterialId, setWarehouseQtyByMaterialId] = useState<Map<string, number>>(new Map());
  const [stockRows, setStockRows] = useState<RepairSparePartStock[]>([]);
  const [selectedOptionValue, setSelectedOptionValue] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [discountType, setDiscountType] = useState<'none' | 'amount' | 'percent'>('none');
  const [discountValue, setDiscountValue] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [latestInvoices, setLatestInvoices] = useState<RepairSalesInvoice[]>([]);
  const [lastSavedInvoiceId, setLastSavedInvoiceId] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<RepairSalesInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const printRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const invoice = String(searchParams.get('invoice') || '').trim();
    if (invoice) setSearch(invoice);
  }, [searchParams]);

  const activeBranch = useMemo(
    () => branches.find((branch) => branch.id === branchId) || null,
    [branches, branchId],
  );
  const allowedBranches = useMemo(() => {
    if (repairCtx.canViewAllBranches) return branches;
    const baseUserBranchIds = resolveUserRepairBranchIds(user);
    const userId = String(user?.id || '').trim();
    const employeeId = String(currentEmployee?.id || '').trim();
    return branches.filter((branch) => {
      const id = String(branch.id || '');
      if (!id) return false;
      if (baseUserBranchIds.includes(id)) return true;
      if (userId && (branch.technicianIds || []).includes(userId)) return true;
      if (employeeId && (branch.technicianIds || []).includes(employeeId)) return true;
      if (employeeId && String(branch.managerEmployeeId || '') === employeeId) return true;
      return false;
    });
  }, [branches, repairCtx.canViewAllBranches, currentEmployee?.id, user]);

  useEffect(() => {
    void repairBranchService.list().then(setBranches).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    void customerService.listAll({ includeInactive: false }).then(setCustomers).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    void materialService.getAll()
      .then((rows) => setMaterials(rows.filter(
        (m) => m.isActive !== false && m.id && isMaterialAvailableForSpareParts(m),
      )))
      .catch(() => setMaterials([]));
  }, []);

  useEffect(() => {
    if (!allowedBranches.length) {
      setBranchId('');
      setLoading(false);
      return;
    }
    const isCurrentAllowed = allowedBranches.some((branch) => branch.id === branchId);
    if (isCurrentAllowed) return;
    setBranchId(String(allowedBranches[0].id || ''));
  }, [allowedBranches, branchId]);

  useEffect(() => {
    if (!branchId) return;
    let mounted = true;
    setLoading(true);
    void (async () => {
      try {
        const warehouseId = String(activeBranch?.warehouseId || '').trim();
        const [partRows, stock, invoices, balances] = await Promise.all([
          sparePartsService.listParts(branchId),
          sparePartsService.listStock(branchId, warehouseId || undefined),
          repairSalesInvoiceService.list(branchId),
          warehouseId ? stockService.getBalances(warehouseId) : Promise.resolve([]),
        ]);
        if (!mounted) return;
        setParts(partRows);
        setStockRows(stock);
        setLatestInvoices(invoices);
        const map = new Map<string, number>();
        for (const row of balances) {
          if (row.itemType === 'material') {
            map.set(row.itemId, Number(row.quantity || 0));
          }
        }
        setWarehouseQtyByMaterialId(map);
      } catch (e: unknown) {
        if (!mounted) return;
        setParts([]);
        setStockRows([]);
        setLatestInvoices([]);
        setWarehouseQtyByMaterialId(new Map());
        toast.error(e instanceof Error && e.message ? e.message : 'تعذر تحميل بيانات الفواتير.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [branchId, activeBranch?.warehouseId]);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0),
    [lines],
  );
  const discountAmount = useMemo(() => {
    const value = Math.max(0, Number(discountValue || 0));
    return discountType === 'percent' ? Math.min(total, Math.round(total * value) / 100)
      : discountType === 'amount' ? Math.min(total, value) : 0;
  }, [discountType, discountValue, total]);
  const netTotal = Math.max(0, Math.round((total - discountAmount) * 100) / 100);
  const stockByPartId = useMemo(() => {
    const map = new Map<string, number>();
    stockRows.forEach((row) => map.set(String(row.partId || ''), Number(row.quantity || 0)));
    return map;
  }, [stockRows]);

  const selectedCustomerType = useMemo(
    () => customers.find((c) => String(c.id || '') === String(customerId || ''))?.type ?? null,
    [customers, customerId],
  );

  const partOptionsList = useMemo(
    () =>
      buildRepairSalesInvoicePartOptions({
        parts,
        materials,
        customerType: selectedCustomerType,
        warehouseQtyByMaterialId,
        legacyQtyByPartId: stockByPartId,
        formatQty: fmt,
      }),
    [parts, materials, selectedCustomerType, warehouseQtyByMaterialId, stockByPartId],
  );

  const partOptions = useMemo(
    () => partOptionsList.map((opt) => ({ value: opt.value, label: opt.label })),
    [partOptionsList],
  );

  const selectedOption: RepairSalesInvoicePartOption | null = useMemo(
    () => partOptionsList.find((opt) => opt.value === selectedOptionValue) || null,
    [partOptionsList, selectedOptionValue],
  );

  // When customer type changes, refresh unit price from the tiered master price.
  useEffect(() => {
    if (!selectedOptionValue) return;
    const opt = partOptionsList.find((row) => row.value === selectedOptionValue);
    if (opt && opt.salePrice > 0) {
      setPrice(String(opt.salePrice));
    }
  }, [selectedCustomerType, selectedOptionValue, partOptionsList]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = fromDateFilter ? new Date(`${fromDateFilter}T00:00:00`) : null;
    const to = toDateFilter ? new Date(`${toDateFilter}T23:59:59`) : null;
    return latestInvoices.filter((invoice) => {
      const invoiceNo = String(invoice.invoiceNo || '').toLowerCase();
      const customer = String(invoice.customerName || '').toLowerCase();
      const phone = String(invoice.customerPhone || '').toLowerCase();
      const createdAt = new Date(invoice.createdAt);
      const cancelled = (invoice.status || 'active') === 'cancelled';
      const matchSearch = !q || invoiceNo.includes(q) || customer.includes(q) || phone.includes(q);
      const matchStatus =
        statusFilter === 'all'
        || (statusFilter === 'cancelled' && cancelled)
        || (statusFilter === 'active' && !cancelled);
      const matchFrom = !from || createdAt >= from;
      const matchTo = !to || createdAt <= to;
      return matchSearch && matchStatus && matchFrom && matchTo;
    });
  }, [latestInvoices, search, statusFilter, fromDateFilter, toDateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedInvoices = filteredInvoices.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, fromDateFilter, toDateFilter, branchId]);

  const printableInvoice = useMemo(() => {
    if (!filteredInvoices.length && !latestInvoices.length) return null;
    const pool = filteredInvoices.length ? filteredInvoices : latestInvoices;
    if (!lastSavedInvoiceId) return pool[0] || null;
    return pool.find((row) => row.id === lastSavedInvoiceId) || pool[0] || null;
  }, [filteredInvoices, latestInvoices, lastSavedInvoiceId]);

  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings: printTemplate,
    documentTitle: printableInvoice?.invoiceNo ? `فاتورة-${printableInvoice.invoiceNo}` : 'فاتورة-بيع',
  });

  const listStats = useMemo(() => {
    const active = filteredInvoices.filter((inv) => (inv.status || 'active') !== 'cancelled');
    const cancelled = filteredInvoices.length - active.length;
    const sum = active
      .filter((inv) => ['posted', 'active'].includes(String(inv.status || 'active')))
      .reduce((acc, inv) => acc + Number(inv.total || 0), 0);
    return { count: filteredInvoices.length, active: active.length, cancelled, sum };
  }, [filteredInvoices]);

  const managerBranchIds = useMemo(() => {
    const employeeId = String(currentEmployee?.id || '').trim();
    if (!employeeId) return new Set<string>();
    return new Set(
      branches
        .filter((branch) => String(branch.managerEmployeeId || '') === employeeId)
        .map((branch) => String(branch.id || ''))
        .filter(Boolean),
    );
  }, [branches, currentEmployee?.id]);
  const canEditByRole = can('repair.salesInvoice.edit');
  const canCancelByRole = can('repair.salesInvoice.cancel');
  const canManageInvoiceByBranch = (invoiceBranchId: string) => managerBranchIds.has(String(invoiceBranchId || ''));
  const canEditInvoice = (invoice: RepairSalesInvoice) => canEditByRole || canManageInvoiceByBranch(invoice.branchId);
  const canCancelInvoice = (invoice: RepairSalesInvoice) => canCancelByRole || canManageInvoiceByBranch(invoice.branchId);
  const isCancelledInvoice = (invoice: RepairSalesInvoice | null | undefined) =>
    (invoice?.status || 'active') === 'cancelled';
  const invoiceStatusLabel = (invoice: RepairSalesInvoice) => ({
    draft: 'مسودة',
    pending_discount_approval: 'بانتظار اعتماد الخصم',
    ready_to_post: 'جاهزة للترحيل',
    posted: 'مرحّلة',
    cancelled: 'ملغاة/معكوسة',
  }[String(invoice.status || '')] || 'قديمة مرحّلة');

  const selectPart = (optionValue: string) => {
    setSelectedOptionValue(optionValue);
    const opt = partOptionsList.find((row) => row.value === optionValue);
    if (opt && opt.salePrice > 0) {
      setPrice(String(opt.salePrice));
    } else if (!optionValue) {
      setPrice('');
    }
  };

  const availableQtyForOption = (opt: RepairSalesInvoicePartOption | null): number => {
    if (!opt) return 0;
    return Number(opt.availableQty || 0);
  };

  const ensurePartIdForOption = async (opt: RepairSalesInvoicePartOption): Promise<{
    partId: string;
    partName: string;
    materialId?: string;
  }> => {
    if (opt.source === 'legacy_part') {
      const partId = String(opt.partId || '').trim();
      if (!partId) throw new Error('القطعة غير صالحة.');
      return { partId, partName: opt.partName };
    }
    const materialId = String(opt.materialId || '').trim();
    if (!materialId) throw new Error('المكوّن غير صالح.');
    const existingPartId = String(opt.partId || '').trim();
    if (existingPartId) {
      return { partId: existingPartId, partName: opt.partName, materialId };
    }
    const linked = parts.find(
      (part) => String(part.materialId || part.rawMaterialId || '').trim() === materialId,
    );
    if (linked?.id) {
      return { partId: String(linked.id), partName: linked.name || opt.partName, materialId };
    }
    const material = materials.find((row) => String(row.id || '') === materialId);
    const createdId = await sparePartsService.createPart({
      branchId,
      name: opt.partName || String(material?.name || materialId),
      code: String(material?.code || ''),
      category: 'بيع',
      unit: opt.unit || material?.baseUnit || 'قطعة',
      minStock: 0,
      materialId,
      defaultSalePrice: opt.salePrice,
    });
    if (!createdId) throw new Error('تعذر تجهيز القطعة في كتالوج الفرع.');
    const refreshed = await sparePartsService.listParts(branchId);
    setParts(refreshed);
    return { partId: createdId, partName: opt.partName, materialId };
  };

  const addLine = async () => {
    const opt = selectedOption;
    if (!opt || !branchId) return;
    const quantity = Math.max(1, Number(qty || 0));
    const available = availableQtyForOption(opt);
    const draftKey = opt.source === 'material'
      ? `material:${opt.materialId}`
      : `part:${opt.partId}`;
    const alreadyInDraft = lines
      .filter((line) => {
        if (opt.source === 'material' && opt.materialId) {
          return String(line.materialId || '') === opt.materialId
            || String(line.partId || '') === String(opt.partId || '');
        }
        return String(line.partId || '') === String(opt.partId || '');
      })
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    if (quantity + alreadyInDraft > available) {
      toast.error('الكمية المطلوبة أكبر من الرصيد المتاح لهذه القطعة.');
      return;
    }
    const unitPrice = Math.max(0, Number(opt.salePrice || price || 0));
    if (!Number.isFinite(unitPrice)) {
      toast.error('أدخل سعر وحدة صحيحًا.');
      return;
    }
    setAddingLine(true);
    try {
      const ensured = await ensurePartIdForOption(opt);
      const lineTotal = quantity * unitPrice;
      setLines((prev) => [
        ...prev,
        {
          key: `${draftKey}-${Date.now()}`,
          partId: ensured.partId,
          partName: ensured.partName,
          materialId: ensured.materialId,
          quantity,
          unitPrice,
          lineTotal,
        },
      ]);
      setSelectedOptionValue('');
      setQty('1');
      setPrice('');
    } catch (e: unknown) {
      toast.error(e instanceof Error && e.message ? e.message : 'تعذر إضافة البند.');
    } finally {
      setAddingLine(false);
    }
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  };

  const updateLine = (key: string, patch: Partial<Pick<DraftLine, 'quantity'>>) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const quantity = Math.max(1, Number(patch.quantity ?? line.quantity));
        const unitPrice = Math.max(0, Number(line.unitPrice));
        return { ...line, quantity, unitPrice, lineTotal: quantity * unitPrice };
      }),
    );
  };

  const branchNameById = (id: string) => branches.find((b) => b.id === id)?.name || '-';
  const getErrorMessage = (error: unknown, fallback: string): string => (
    error instanceof Error && error.message ? error.message : fallback
  );

  const resetDraft = () => {
    setEditingInvoiceId(null);
    setLines([]);
    setCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setSelectedOptionValue('');
    setQty('1');
    setPrice('');
    setDiscountType('none');
    setDiscountValue('0');
    setPaymentMethod('cash');
  };

  const applyInvoiceCustomer = (customer: Customer | null) => {
    if (!customer) {
      setCustomerId('');
      return;
    }
    setCustomerId(String(customer.id || ''));
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
  };

  const startEditInvoice = (invoice: RepairSalesInvoice) => {
    if (isCancelledInvoice(invoice)) {
      toast.error('لا يمكن تعديل فاتورة ملغاة.');
      return;
    }
    if (!canEditInvoice(invoice)) {
      toast.error('ليس لديك صلاحية تعديل هذه الفاتورة.');
      return;
    }
    if (['posted', 'cancelled'].includes(String(invoice.status || ''))) {
      toast.error('الفاتورة المرحّلة لا تعدّل؛ التصحيح يتم بالعكس ثم إصدار جديد.');
      return;
    }
    setEditingInvoiceId(invoice.id || null);
    setBranchId(invoice.branchId || '');
    setCustomerId(invoice.customerId || '');
    setCustomerName(invoice.customerName || '');
    setCustomerPhone(invoice.customerPhone || '');
    setNotes(invoice.notes || '');
    setDiscountType(invoice.discountType || 'none');
    setDiscountValue(String(invoice.discountValue || 0));
    setPaymentMethod(invoice.paymentMethod || 'cash');
    setLines(
      (invoice.lines || []).map((line, index) => ({
        key: `${line.partId}-${Date.now()}-${index}`,
        partId: line.partId,
        partName: line.partName,
        materialId: line.materialId,
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
        lineTotal: Number(line.lineTotal || 0),
      })),
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmCancelInvoice = async () => {
    if (!cancelTarget?.id) return;
    if (!canCancelInvoice(cancelTarget)) {
      toast.error('ليس لديك صلاحية إلغاء هذه الفاتورة.');
      return;
    }
    if (isCancelledInvoice(cancelTarget)) {
      toast.error('الفاتورة ملغاة بالفعل.');
      return;
    }
    setCancelling(true);
    try {
      await repairSalesInvoiceService.cancelInvoice({
        id: cancelTarget.id,
        cancelledBy: user?.id || '',
        cancelledByName: user?.displayName || user?.email || 'system',
        cancelReason: cancelReason.trim(),
      });
      toast.success('تم إلغاء الفاتورة وعكس الحركات.');
      if (editingInvoiceId === cancelTarget.id) resetDraft();
      setCancelTarget(null);
      setCancelReason('');
      const [invoices, partRows, stock] = await Promise.all([
        repairSalesInvoiceService.list(branchId),
        sparePartsService.listParts(branchId),
        sparePartsService.listStock(branchId, activeBranch?.warehouseId || undefined),
      ]);
      setLatestInvoices(invoices);
      setParts(partRows);
      setStockRows(stock);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, 'تعذر إلغاء الفاتورة.'));
    } finally {
      setCancelling(false);
    }
  };

  const handleSaveInvoice = async () => {
    if (!canCreate && !editingInvoiceId) {
      toast.error('ليس لديك صلاحية إنشاء فاتورة.');
      return;
    }
    if (saving) return;
    try {
      if (lines.length === 0) {
        toast.error('لا توجد بنود للحفظ.');
        return;
      }
      if (!customerId) {
        toast.error('اختيار العميل مطلوب قبل حفظ الفاتورة.');
        return;
      }
      for (const line of lines) {
        const materialId = String(line.materialId || '').trim();
        const available = materialId
          ? Number(warehouseQtyByMaterialId.get(materialId) || 0)
          : Number(stockByPartId.get(String(line.partId || '')) || 0);
        const othersQty = lines
          .filter((l) => l.key !== line.key && (
            (materialId && String(l.materialId || '') === materialId)
            || (!materialId && l.partId === line.partId)
          ))
          .reduce((sum, l) => sum + Number(l.quantity || 0), 0);
        // عند التعديل الرصيد يعكس المخزون الحالي بعد الفاتورة الأصلية؛ الخادم يتحقق نهائيًا.
        if (!editingInvoiceId && Number(line.quantity || 0) + othersQty > available) {
          toast.error(`الكمية غير متاحة للقطعة: ${line.partName}`);
          return;
        }
      }
      setSaving(true);
      const invoiceLines = lines.map((line) => ({
        partId: line.partId,
        partName: line.partName,
        ...(line.materialId ? { materialId: line.materialId } : {}),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      }));
      if (editingInvoiceId) {
        const invoice = latestInvoices.find((row) => row.id === editingInvoiceId);
        if (!invoice) {
          toast.error('تعذر تحميل الفاتورة للتعديل.');
          return;
        }
        if (!canEditInvoice(invoice)) {
          toast.error('ليس لديك صلاحية تعديل هذه الفاتورة.');
          return;
        }
        await repairSalesInvoiceService.updateInvoice({
          id: editingInvoiceId,
          branchId,
          warehouseId: activeBranch?.warehouseId,
          warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeBranch?.warehouseCode,
          lines: invoiceLines,
          customerId: customerId || undefined,
          customerName,
          customerPhone,
          notes,
          discountType,
          discountValue: Number(discountValue || 0),
          paymentMethod,
          updatedBy: user?.id || '',
          updatedByName: user?.displayName || user?.email || 'system',
        });
        toast.success(discountAmount > 0 ? 'تم إنشاء إصدار جديد وإرساله لاعتماد الخصم.' : 'تم تحديث المسودة وأصبحت جاهزة للترحيل.');
        setLastSavedInvoiceId(editingInvoiceId);
      } else {
        const invoiceId = await repairSalesInvoiceService.create({
          branchId,
          warehouseId: activeBranch?.warehouseId,
          warehouseName: activeBranch?.name ? `مخزن ${activeBranch.name}` : activeBranch?.warehouseCode,
          lines: invoiceLines,
          customerId: customerId || undefined,
          customerName,
          customerPhone,
          notes,
          discountType,
          discountValue: Number(discountValue || 0),
          paymentMethod,
          createdBy: user?.id || '',
          createdByName: user?.displayName || user?.email || 'system',
        });
        toast.success(discountAmount > 0 ? 'تم حفظ المسودة وإرسال الخصم لاعتماد الإدارة.' : 'تم حفظ المسودة وهي جاهزة للترحيل.');
        setLastSavedInvoiceId(invoiceId || null);
      }
      resetDraft();
      const [invoices, partRows, stock] = await Promise.all([
        repairSalesInvoiceService.list(branchId),
        sparePartsService.listParts(branchId),
        sparePartsService.listStock(branchId, activeBranch?.warehouseId || undefined),
      ]);
      setLatestInvoices(invoices);
      setParts(partRows);
      setStockRows(stock);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, 'تعذر حفظ الفاتورة.'));
    } finally {
      setSaving(false);
    }
  };

  const refreshInvoiceData = async () => {
    const [invoices, partRows, stock] = await Promise.all([
      repairSalesInvoiceService.list(branchId),
      sparePartsService.listParts(branchId),
      sparePartsService.listStock(branchId, activeBranch?.warehouseId || undefined),
    ]);
    setLatestInvoices(invoices);
    setParts(partRows);
    setStockRows(stock);
  };

  const handlePostInvoice = async (invoice: RepairSalesInvoice) => {
    if (!invoice.id || saving) return;
    setSaving(true);
    try {
      await repairSalesInvoiceService.postInvoice(invoice.id);
      toast.success('تم ترحيل الفاتورة ذريًا إلى المخزون والخزينة والقيد اليومي.');
      setLastSavedInvoiceId(invoice.id);
      await refreshInvoiceData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'تعذر ترحيل الفاتورة.'));
    } finally {
      setSaving(false);
    }
  };

  const handleResolveInvoiceDiscount = async (invoice: RepairSalesInvoice, approve: boolean) => {
    if (!invoice.id || saving) return;
    setSaving(true);
    try {
      await repairSalesInvoiceService.resolveDiscount(invoice.id, approve, approve ? '' : 'رفض الخصم من الإدارة');
      toast.success(approve ? 'تم اعتماد الخصم والفاتورة جاهزة للترحيل.' : 'تم رفض الخصم وإعادة الفاتورة للمسودة.');
      await refreshInvoiceData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'تعذر تسجيل قرار الخصم.'));
    } finally {
      setSaving(false);
    }
  };

  const exportPrintableInvoicePdf = async (showSuccessToast = true): Promise<boolean> => {
    if (!printableInvoice || !printRef.current) {
      toast.error('لا توجد فاتورة جاهزة للتصدير.');
      return false;
    }
    setIsExportingPdf(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imageData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const imageHeight = (canvas.height * availableWidth) / canvas.width;
      if (imageHeight <= availableHeight) {
        pdf.addImage(imageData, 'PNG', margin, margin, availableWidth, imageHeight);
      } else {
        const ratio = availableHeight / imageHeight;
        pdf.addImage(imageData, 'PNG', margin, margin, availableWidth * ratio, availableHeight);
      }
      const safeInvoiceNo = String(printableInvoice.invoiceNo || 'invoice').replace(/[^\w-]/g, '_');
      pdf.save(`invoice-${safeInvoiceNo}.pdf`);
      if (showSuccessToast) toast.success('تم تصدير PDF بنجاح.');
      return true;
    } catch {
      toast.error('تعذر تصدير PDF حاليًا.');
      return false;
    } finally {
      setIsExportingPdf(false);
    }
  };

  const buildWhatsAppInvoiceText = (invoice: RepairSalesInvoice, includePdfHint = false) => {
    const invoiceLines = (invoice.lines || [])
      .slice(0, 8)
      .map((line, index) => `${index + 1}) ${line.partName} - ${fmt(line.quantity)} × ${fmt(line.unitPrice)} = ${fmt(line.lineTotal)} جنيه`)
      .join('\n');
    const branchName = branchNameById(invoice.branchId);
    return [
      'السلام عليكم،',
      'تفاصيل فاتورة بيع قطع الغيار:',
      '',
      `رقم الفاتورة: ${invoice.invoiceNo}`,
      `الفرع: ${branchName}`,
      `العميل: ${invoice.customerName || 'عميل نقدي'}`,
      `الهاتف: ${invoice.customerPhone || '-'}`,
      `الإجمالي: ${fmt(Number(invoice.total || 0))} جنيه`,
      '',
      'البنود:',
      invoiceLines || '-',
      invoice.notes ? `\nملاحظات: ${invoice.notes}` : '',
      includePdfHint
        ? '\nتم تجهيز نسخة PDF على جهازك. رجاءً أرفق الملف يدويًا داخل واتساب قبل الإرسال.'
        : '',
    ]
      .filter((line) => line !== '')
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const openWhatsApp = (message: string, phone: string | undefined) => {
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    const target = normalizedPhone ? `https://wa.me/${normalizedPhone}` : 'https://wa.me/';
    const url = `${target}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShareWhatsAppText = () => {
    if (!printableInvoice) {
      toast.error('لا توجد فاتورة جاهزة للمشاركة.');
      return;
    }
    openWhatsApp(buildWhatsAppInvoiceText(printableInvoice), printableInvoice.customerPhone);
  };

  const handleShareWhatsAppWithPdfHint = async () => {
    if (!printableInvoice) {
      toast.error('لا توجد فاتورة جاهزة للمشاركة.');
      return;
    }
    const exported = await exportPrintableInvoicePdf(false);
    if (!exported) return;
    openWhatsApp(buildWhatsAppInvoiceText(printableInvoice, true), printableInvoice.customerPhone);
    toast.success('تم تجهيز PDF وفتح واتساب.');
  };

  const handleCreateNewInvoice = () => {
    resetDraft();
    toast.success('تم تجهيز نموذج فاتورة جديدة.');
  };

  const handleExportInvoicesExcel = () => {
    if (filteredInvoices.length === 0) {
      toast.error('لا توجد فواتير مطابقة للتصدير.');
      return;
    }
    const rows = filteredInvoices.map((invoice, index) => ({
      '#': index + 1,
      'رقم الفاتورة': invoice.invoiceNo || '-',
      'الحالة': isCancelledInvoice(invoice) ? 'ملغاة' : 'نشطة',
      'التاريخ': new Date(invoice.createdAt).toLocaleString('ar-EG'),
      'الفرع': branchNameById(invoice.branchId),
      'اسم العميل': invoice.customerName || 'عميل نقدي',
      'الهاتف': invoice.customerPhone || '-',
      'عدد البنود': Number(invoice.lines?.length || 0),
      'الإجمالي': Number(invoice.total || 0),
      'ملاحظات': invoice.notes || '',
      'منشئ الفاتورة': invoice.createdByName || '-',
    }));
    const dateLabel = new Date().toISOString().slice(0, 10);
    exportHRData(rows, 'فواتير-بيع-قطع-غيار', `فواتير-بيع-قطع-غيار-${dateLabel}`);
    toast.success('تم تصدير ملف Excel بنجاح.');
  };

  if (!canView) {
    return (
      <div className="erp-ds-clean space-y-5 p-4 md:p-6" dir={dir}>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض فواتير بيع قطع الغيار.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-5 p-4 md:p-6 repair-invoice-page" dir={dir}>
      <div className="no-print">
        <PageHeader
          title="فاتورة بيع قطع غيار"
          subtitle={editingInvoiceId ? 'تعديل مسودة بإصدار جديد قبل الترحيل' : 'مسودة ثم اعتماد الخصم ثم ترحيل ذري للمخزون والخزينة والحسابات'}
          icon="receipt_long"
          primaryAction={canCreate ? {
            label: 'فاتورة جديدة',
            icon: 'add',
            onClick: handleCreateNewInvoice,
          } : undefined}
          moreActions={[
            {
              label: 'طباعة A4',
              icon: 'print',
              group: 'تصدير',
              hidden: !printableInvoice,
              onClick: () => handlePrint(),
            },
            {
              label: isExportingPdf ? 'جارٍ تصدير PDF...' : 'تصدير PDF',
              icon: 'file_download',
              group: 'تصدير',
              hidden: !printableInvoice,
              disabled: isExportingPdf,
              onClick: () => { void exportPrintableInvoicePdf(); },
            },
            {
              label: 'واتساب (نص)',
              icon: 'notifications_active',
              group: 'مشاركة',
              hidden: !printableInvoice,
              onClick: handleShareWhatsAppText,
            },
            {
              label: 'واتساب + PDF',
              icon: 'download',
              group: 'مشاركة',
              hidden: !printableInvoice,
              disabled: isExportingPdf,
              onClick: () => { void handleShareWhatsAppWithPdfHint(); },
            },
            {
              label: 'تصدير Excel',
              icon: 'download',
              group: 'تصدير',
              hidden: filteredInvoices.length === 0,
              onClick: handleExportInvoicesExcel,
            },
          ]}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 no-print">
        <KPICard label="نتائج الفلتر" value={fmt(listStats.count)} iconType="metric" color="indigo" loading={loading} />
        <KPICard label="فواتير نشطة" value={fmt(listStats.active)} iconType="metric" color="green" loading={loading} />
        <KPICard label="ملغاة" value={fmt(listStats.cancelled)} iconType="metric" color="red" loading={loading} />
        <KPICard label="إجمالي المرحّل" value={fmt(listStats.sum)} unit="ج.م" iconType="money" color="amber" loading={loading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7 no-print">
          {editingInvoiceId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
              <span className="font-medium text-sky-800">تعديل فاتورة محفوظة — احفظ لتطبيق التغييرات على المخزون والخزينة.</span>
              <Button variant="outline" size="sm" onClick={resetDraft}>إلغاء التعديل</Button>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">بيانات الفاتورة</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>الفرع</Label>
                <Select value={branchId} onValueChange={setBranchId} disabled={Boolean(editingInvoiceId)}>
                  <SelectTrigger className="mt-2"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                  <SelectContent>
                    {allowedBranches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id || ''}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ملاحظات الفاتورة</Label>
                <Input
                  className="mt-2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="تظهر في نسخة الطباعة"
                />
              </div>
              <div className="md:col-span-2">
                <CustomerPicker
                  customers={customers}
                  valueId={customerId}
                  canCreate={can('customers.create') || canCreate}
                  actor={{
                    userId: String(user?.id || ''),
                    userName: String(user?.displayName || user?.email || 'مستخدم'),
                  }}
                  onSelect={applyInvoiceCustomer}
                  onCreated={(created) => {
                    setCustomers((prev) => {
                      if (prev.some((c) => c.id === created.id)) return prev;
                      return [...prev, created];
                    });
                  }}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  مطلوب — تُربط الفاتورة ببطاقة العميل وتظهر ضمن تحليله المالي.
                </p>
              </div>
              <div>
                <Label>اسم العميل (عرض)</Label>
                <Input
                  className="mt-2"
                  value={customerName}
                  readOnly
                  placeholder="يُملأ من ماستر العميل"
                />
              </div>
              <div>
                <Label>الهاتف</Label>
                <Input
                  className="mt-2"
                  type="tel"
                  value={customerPhone}
                  readOnly
                  placeholder="01xxxxxxxxx"
                />
              </div>
              <div>
                <Label>وسيلة الدفع</Label>
                <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="card">بطاقة</SelectItem>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>نوع الخصم</Label>
                  <Select value={discountType} onValueChange={(value) => setDiscountType(value as typeof discountType)}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون خصم</SelectItem>
                      <SelectItem value="amount">مبلغ</SelectItem>
                      <SelectItem value="percent">نسبة %</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>قيمة الخصم</Label>
                  <Input className="mt-2" type="number" min={0} max={discountType === 'percent' ? 100 : undefined} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} disabled={discountType === 'none'} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => { setDiscountType('percent'); setDiscountValue('100'); }}
                  >
                    خصم كامل 100%
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">إضافة بند</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-12 md:items-end">
                <div className="md:col-span-5">
                  <Label>القطعة</Label>
                  <div className="mt-2">
                    <SearchableSelect
                      options={partOptions}
                      value={selectedOptionValue}
                      onChange={selectPart}
                      placeholder="ابحث واختر قطعة من التسعير/المخزون"
                    />
                  </div>
                  {!loading && partOptions.length === 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      لا توجد مواد أو قطع مسعّرة في الماستر/كتالوج الفرع. سعّر المكوّنات من المواد التصنيعية أو أضفها لمخزون المركز.
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <Label>الكمية</Label>
                  <Input className="mt-2" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
                <div className="md:col-span-3">
                  <Label>
                    سعر الوحدة
                    {selectedCustomerType === 'trader' ? ' (تاجر)' : ' (مستهلك)'}
                  </Label>
                  <Input className="mt-2 bg-muted" type="number" value={selectedOption?.salePrice || price} readOnly aria-readonly="true" />
                </div>
                <div className="md:col-span-2">
                  <Button
                    className="w-full"
                    onClick={() => void addLine()}
                    disabled={!selectedOptionValue || addingLine || (!canCreate && !editingInvoiceId)}
                  >
                    {addingLine ? '...' : 'إضافة'}
                  </Button>
                </div>
              </div>
              {selectedOption && (
                <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  القطعة: <span className="font-medium text-foreground">{selectedOption.partName}</span>
                  <span className="mx-2">|</span>
                  المتاح: <span className="font-medium text-foreground tabular-nums">{fmt(availableQtyForOption(selectedOption))}</span>
                  {selectedOption.salePrice > 0 && (
                    <>
                      <span className="mx-2">|</span>
                      السعر:{' '}
                      <span className="font-medium text-foreground tabular-nums">{fmt(selectedOption.salePrice)}</span>
                      {selectedCustomerType === 'trader' ? ' (تاجر)' : ' (مستهلك)'}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="!p-0 overflow-hidden">
            <div className="border-b px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">بنود الفاتورة</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{lines.length} بند — الإجمالي {fmt(total)} ج.م</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleSaveInvoice()}
                  disabled={!branchId || lines.length === 0 || saving || (!canCreate && !editingInvoiceId)}
                >
                  {saving ? 'جارٍ الحفظ...' : editingInvoiceId ? 'تحديث الفاتورة' : 'حفظ الفاتورة'}
                </Button>
                {editingInvoiceId && (
                  <Button variant="outline" onClick={resetDraft} disabled={saving}>إلغاء التعديل</Button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto erp-table-scroll">
              <table className="erp-table w-full min-w-[700px] text-right border-collapse">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th w-12">#</th>
                    <th className="erp-th">القطعة</th>
                    <th className="erp-th text-center w-28">الكمية</th>
                    <th className="erp-th text-center w-36">سعر الوحدة</th>
                    <th className="erp-th text-center">الإجمالي</th>
                    <th className="erp-th text-center w-16">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {lines.map((line, index) => (
                    <tr key={line.key}>
                      <td className="px-4 py-2.5 tabular-nums">{index + 1}</td>
                      <td className="px-4 py-2.5 font-medium">{line.partName}</td>
                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min={1}
                          className="h-8 text-center tabular-nums"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="block text-center tabular-nums">{fmt(line.unitPrice)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold tabular-nums">{fmt(line.lineTotal)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Button variant="ghost" size="icon" onClick={() => removeLine(line.key)} aria-label="حذف السطر">
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>
                        أضف بنودًا من القطع أعلاه لبدء الفاتورة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {lines.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3 text-sm">
                <span className="text-muted-foreground">عدد البنود: <strong className="text-foreground">{lines.length}</strong></span>
                <div className="text-left tabular-nums">
                  <div>الإجمالي: {fmt(total)} ج.م</div>
                  {discountAmount > 0 && <div className="text-rose-700">الخصم: -{fmt(discountAmount)} ج.م</div>}
                  <div className="text-lg font-bold">الصافي: {fmt(netTotal)} ج.م</div>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <Card className="no-print">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">معاينة وإجراءات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => handlePrint()} disabled={!printableInvoice}>
                  طباعة A4
                </Button>
                <Button variant="outline" size="sm" onClick={() => void exportPrintableInvoicePdf()} disabled={!printableInvoice || isExportingPdf}>
                  {isExportingPdf ? 'جارٍ التصدير...' : 'PDF'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleShareWhatsAppText} disabled={!printableInvoice}>
                  واتساب
                </Button>
                <Button variant="outline" size="sm" onClick={() => void handleShareWhatsAppWithPdfHint()} disabled={!printableInvoice || isExportingPdf}>
                  واتساب + PDF
                </Button>
              </div>
              {printableInvoice ? (
                <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-foreground">{printableInvoice.invoiceNo}</span>
                    <ErpStatusBadge
                      label={invoiceStatusLabel(printableInvoice)}
                      type={repairInvoiceActiveChipType(isCancelledInvoice(printableInvoice))}
                    />
                  </div>
                  <div className="text-muted-foreground">
                    {printableInvoice.customerName || 'عميل نقدي'} — {fmt(Number(printableInvoice.total || 0))} ج.م
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">احفظ فاتورة أو اختر واحدة من القائمة لعرض المعاينة.</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                مشاركة واتساب + PDF تولّد الملف ثم تفتح واتساب برسالة جاهزة لإرفاق الملف يدويًا.
              </p>
            </CardContent>
          </Card>

          <div className="overflow-auto rounded-lg border bg-white shadow-sm max-h-[70vh]">
            <RepairSalesInvoicePrint
              ref={printRef}
              invoice={printableInvoice}
              branchName={printableInvoice ? branchNameById(printableInvoice.branchId) : activeBranch?.name}
              printSettings={printTemplate}
            />
            {!printableInvoice && (
              <div className="px-4 py-16 text-center text-sm text-muted-foreground">
                لا توجد فاتورة للمعاينة حاليًا.
              </div>
            )}
          </div>
        </div>
      </div>

      <Card className="!p-0 overflow-hidden no-print">
        <SmartFilterBar
          pageId="repair-sales-invoices"
          searchPlaceholder="بحث برقم الفاتورة أو العميل أو الهاتف..."
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'status',
              placeholder: 'كل الحالات',
              options: [
                { value: 'active', label: 'نشطة' },
                { value: 'cancelled', label: 'ملغاة' },
              ],
            },
          ]}
          quickFilterValues={{ status: statusFilter }}
          onQuickFilterChange={(key, value) => {
            if (key === 'status') {
              setStatusFilter(value === 'active' || value === 'cancelled' ? value : 'all');
            }
          }}
          advancedFilters={[
            { key: 'from', label: 'من تاريخ', type: 'date', placeholder: 'من تاريخ' },
            { key: 'to', label: 'إلى تاريخ', type: 'date', placeholder: 'إلى تاريخ' },
          ]}
          advancedFilterValues={{
            from: fromDateFilter || 'all',
            to: toDateFilter || 'all',
          }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'from') setFromDateFilter(value === 'all' ? '' : value);
            if (key === 'to') setToDateFilter(value === 'all' ? '' : value);
          }}
          extra={(
            <Button variant="outline" size="sm" onClick={handleExportInvoicesExcel} disabled={filteredInvoices.length === 0}>
              تصدير Excel
            </Button>
          )}
          className="mb-0 border-0 rounded-none"
        />
        <div className="overflow-x-auto erp-table-scroll">
          <table className="erp-table w-full min-w-[980px] text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">رقم الفاتورة</th>
                <th className="erp-th">العميل</th>
                <th className="erp-th">الهاتف</th>
                <th className="erp-th">التاريخ</th>
                <th className="erp-th text-center">الحالة</th>
                <th className="erp-th text-center">البنود</th>
                <th className="erp-th text-center">الإجمالي</th>
                <th className="erp-th text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={`inv-skel-${i}`}>
                  <td className="px-4 py-3" colSpan={8}><Skeleton className="h-5 w-full rounded-md" /></td>
                </tr>
              ))}
              {!loading && pagedInvoices.map((row) => {
                const selected = printableInvoice?.id === row.id;
                const cancelled = isCancelledInvoice(row);
                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer ${selected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                    onClick={() => setLastSavedInvoiceId(row.id || null)}
                  >
                    <td className="px-4 py-2.5">
                      <Badge variant="outline">{row.invoiceNo}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-medium">{row.customerName || 'عميل نقدي'}</td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{row.customerPhone || '—'}</td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString('ar-EG')}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <ErpStatusBadge
                        label={invoiceStatusLabel(row)}
                        type={repairInvoiceActiveChipType(cancelled)}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{Number(row.lines?.length || 0)}</td>
                    <td className="px-4 py-2.5 text-center font-semibold tabular-nums">{fmt(Number(row.total || 0))}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {['draft', 'pending_discount_approval', 'ready_to_post'].includes(String(row.status || '')) && canEditInvoice(row) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditInvoice(row)}
                            aria-label="تعديل الفاتورة"
                            title="تعديل"
                          >
                            <Pencil className="h-4 w-4 text-sky-600" />
                          </Button>
                        )}
                        {row.status === 'pending_discount_approval' && can('repair.discounts.approve') && (
                          <>
                            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void handleResolveInvoiceDiscount(row, true)}>اعتماد</Button>
                            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void handleResolveInvoiceDiscount(row, false)}>رفض</Button>
                          </>
                        )}
                        {row.status === 'ready_to_post' && canCreate && (
                          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void handlePostInvoice(row)}>ترحيل</Button>
                        )}
                        {row.status === 'posted' && canCancelInvoice(row) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setCancelTarget(row);
                              setCancelReason('');
                            }}
                            aria-label="إلغاء الفاتورة"
                            title="إلغاء (عكس المخزون والخزينة)"
                          >
                            <XCircle className="h-4 w-4 text-rose-600" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredInvoices.length === 0 && (
                <tr>
                  <td className="px-4 py-12 text-center text-muted-foreground" colSpan={8}>
                    لا توجد فواتير مطابقة للفلاتر الحالية.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={filteredInvoices.length}
          onPageChange={setPage}
          itemLabel="فاتورة"
        />
      </Card>

      <Dialog open={Boolean(cancelTarget)} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <DialogContent dir={dir}>
          <DialogHeader>
            <DialogTitle>إلغاء الفاتورة</DialogTitle>
            <DialogDescription>
              سيتم عكس خصم المخزون وحركة الخزينة المرتبطة. هذا ليس حذفًا نهائيًا.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">رقم الفاتورة:</span> <strong>{cancelTarget?.invoiceNo}</strong></div>
            <div><span className="text-muted-foreground">الإجمالي:</span> <strong className="tabular-nums">{fmt(Number(cancelTarget?.total || 0))} ج.م</strong></div>
            <div>
              <Label>سبب الإلغاء (اختياري)</Label>
              <Input className="mt-1" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="مثال: خطأ في البنود" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>تراجع</Button>
            <Button variant="destructive" onClick={() => void confirmCancelInvoice()} disabled={cancelling}>
              {cancelling ? 'جارٍ الإلغاء...' : 'تأكيد الإلغاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepairSalesInvoicePage;
