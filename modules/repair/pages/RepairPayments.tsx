import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useParams } from "react-router-dom";
import {
  CheckCircle2,
  CreditCard,
  Download,
  FileCheck2,
  Printer,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OpsDashPanel } from "@/modules/dashboards/components/OperationsDashboardBoard";
import { RepairOpsPageShell } from "../components/RepairOpsPageShell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataPaginationFooter } from "@/src/components/erp/DataPaginationFooter";
import { SmartFilterBar } from "@/src/components/erp/SmartFilterBar";
import { StatusBadge as ErpStatusBadge } from "@/src/components/erp/StatusBadge";
import { toast } from "../../../components/Toast";
import { usePermission } from "../../../utils/permissions";
import { useManagedPrint } from "../../../utils/printManager";
import { exportToPDF } from "../../../utils/reportExport";
import { useAppStore } from "../../../store/useAppStore";
import { withTenantPath } from "@/lib/tenantPaths";
import { RepairPaymentPrint } from "../components/RepairPaymentPrint";
import { matchesRepairPaymentReadyJobSearch } from "../lib/repairPaymentReadyJobSearch";
import { daysSinceJobStatus } from "../lib/repairCustomerOpsLabels";
import { repairPaymentAuthChipType } from "../lib/repairSemanticStatus";
import { mapLegacyRepairStatus } from "../utils/repairWorkflowNormalize";
import { repairBranchService } from "../services/repairBranchService";
import { repairJobService } from "../services/repairJobService";
import { repairPaymentService } from "../services/repairPaymentService";
import type {
  FirestoreUserWithRepair,
  RepairBranch,
  RepairDiscountType,
  RepairFinancialApproval,
  RepairJob,
  RepairPayment,
  RepairPaymentAuthorization,
  RepairPaymentMethod,
} from "../types";
import {
  hasManufacturerWarrantyCoverage,
  isFullManufacturerWarrantyJob,
  isManufacturerWarrantyJob,
  isPartialManufacturerWarrantyJob,
  isWarrantySettlementAuth,
  manufacturerWarrantyScopeLabel,
} from "../lib/repairManufacturerWarranty";
import { resolveAccessibleRepairBranchIds } from "../lib/repairBranchAccess";
import { useAppDirection } from "@/src/shared/ui/layout/useAppDirection";

const money = (value: unknown) =>
  Number(value || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const READY_PAGE_SIZE = 20;
/** Zero-gross without warranty settlement = invalid pricing auth. */
const isZeroValueAuthorization = (authorization: RepairPaymentAuthorization) =>
  Number(authorization.grossAmount || 0) <= 0 && !isWarrantySettlementAuth(authorization);
const statusLabel = (status: string, authorization?: RepairPaymentAuthorization) => {
  if (authorization && isWarrantySettlementAuth(authorization)) {
    if (status === "paid") return "ضمان مصنّع — بدون تحصيل";
    if (status === "void") return "ملغى";
    return "إقفال ضمان";
  }
  return (
    {
      pending_approval: "بانتظار اعتماد الخصم",
      approved: "جاهز للتحصيل",
      partial: "مدفوع جزئيًا",
      paid: "مدفوع بالكامل",
      void: "ملغى",
    }[status] || status
  );
};

export const RepairPayments: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const user = useAppStore(
    (s) => s.userProfile,
  ) as FirestoreUserWithRepair | null;
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const printSettings = useAppStore((s) => s.systemSettings)?.printTemplate;
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [authorizations, setAuthorizations] = useState<
    RepairPaymentAuthorization[]
  >([]);
  const [approvals, setApprovals] = useState<RepairFinancialApproval[]>([]);
  const [payments, setPayments] = useState<RepairPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readySearch, setReadySearch] = useState("");
  const [readyBranchFilter, setReadyBranchFilter] = useState("all");
  const [readyPage, setReadyPage] = useState(1);
  const [prepareJob, setPrepareJob] = useState<RepairJob | null>(null);
  const [collectAuth, setCollectAuth] =
    useState<RepairPaymentAuthorization | null>(null);
  /** deposit = pre-delivery; receivable = post-delivery AR. */
  const [collectKind, setCollectKind] = useState<"deposit" | "receivable">(
    "deposit",
  );
  const [discountType, setDiscountType] = useState<RepairDiscountType>("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("0");
  const [method, setMethod] = useState<RepairPaymentMethod>("cash");
  const [printAuth, setPrintAuth] = useState<RepairPaymentAuthorization | null>(
    null,
  );
  const [printPayment, setPrintPayment] = useState<RepairPayment | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings,
    documentTitle:
      printPayment?.paymentNo || printAuth?.authorizationNo || "اذن-دفع-صيانة",
  });

  const canViewAllBranches = can("repair.branches.manage");
  const branchIds = useMemo(
    () =>
      resolveAccessibleRepairBranchIds({
        user,
        branches,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches,
      }),
    [branches, canViewAllBranches, currentEmployee?.id, user],
  );
  const jobById = useMemo(
    () => new Map(jobs.map((job) => [String(job.id || ""), job])),
    [jobs],
  );
  const branchById = useMemo(
    () => new Map(branches.map((branch) => [String(branch.id || ""), branch])),
    [branches],
  );
  const authById = useMemo(
    () => new Map(authorizations.map((row) => [String(row.id || ""), row])),
    [authorizations],
  );
  const currentAuthJobIds = useMemo(
    () =>
      new Set(
        authorizations
          .filter((row) => row.status !== "void" && !isZeroValueAuthorization(row))
          .map((row) => row.jobId),
      ),
    [authorizations],
  );
  const readyWithoutAuthorization = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.status === "ready" && job.id && !currentAuthJobIds.has(job.id),
      ),
    [jobs, currentAuthJobIds],
  );
  const filteredReadyWithoutAuthorization = useMemo(() => {
    const q = readySearch.trim();
    return readyWithoutAuthorization.filter((job) => {
      const branchId = String(job.branchId || "");
      if (readyBranchFilter !== "all" && branchId !== readyBranchFilter) {
        return false;
      }
      return matchesRepairPaymentReadyJobSearch(
        {
          receiptNo: job.receiptNo,
          customerName: job.customerName,
          customerPhone: job.customerPhone,
          productName: job.productName,
          deviceBrand: job.deviceBrand,
          deviceModel: job.deviceModel,
          serialNo: job.deviceSerial || job.jobProducts?.[0]?.serialNo,
          branchName: branchById.get(branchId)?.name || "",
        },
        q,
      );
    });
  }, [
    readyWithoutAuthorization,
    readySearch,
    readyBranchFilter,
    branchById,
  ]);
  const readyTotalPages = Math.max(
    1,
    Math.ceil(filteredReadyWithoutAuthorization.length / READY_PAGE_SIZE),
  );
  const safeReadyPage = Math.min(readyPage, readyTotalPages);
  const pagedReadyWithoutAuthorization = filteredReadyWithoutAuthorization.slice(
    (safeReadyPage - 1) * READY_PAGE_SIZE,
    safeReadyPage * READY_PAGE_SIZE,
  );
  const pendingApprovals = approvals.filter((row) => row.status === "pending");
  const openReceivableAuthorizations = useMemo(
    () =>
      authorizations.filter((auth) => {
        if (auth.status === "void") return false;
        if (isWarrantySettlementAuth(auth) || isZeroValueAuthorization(auth)) {
          return false;
        }
        if (!(Number(auth.balanceDue || 0) > 0.001)) return false;
        const job = jobById.get(auth.jobId);
        return (
          job?.status === "delivered" ||
          job?.status === "completed" ||
          job?.financialState === "delivered_on_credit"
        );
      }),
    [authorizations, jobById],
  );
  const openReceivableTotal = useMemo(
    () =>
      openReceivableAuthorizations.reduce(
        (sum, auth) => sum + Number(auth.balanceDue || 0),
        0,
      ),
    [openReceivableAuthorizations],
  );

  useEffect(() => {
    setReadyPage(1);
  }, [readySearch, readyBranchFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const branchRows = await repairBranchService.list();
      setBranches(branchRows);
      const allowed = resolveAccessibleRepairBranchIds({
        user,
        branches: branchRows,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches: can("repair.branches.manage"),
      });
      const canReadApprovals = can("repair.discounts.request")
        || can("repair.discounts.approve")
        || can("repair.credit.request")
        || can("repair.credit.approve");
      const [jobRows, authRows, approvalRows, paymentRows] = await Promise.all(
        [
          repairJobService.listByBranches(allowed),
          repairPaymentService.listAuthorizations(allowed),
          canReadApprovals ? repairPaymentService.listApprovals(allowed) : Promise.resolve([]),
          repairPaymentService.listPayments(undefined, allowed),
        ],
      );
      setJobs(jobRows);
      setAuthorizations(authRows);
      setApprovals(approvalRows);
      setPayments(paymentRows);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تحميل التحصيلات.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetPrepareForm = () => {
    setPrepareJob(null);
    setDiscountType("none");
    setDiscountValue("0");
    setReason("");
  };

  /** Re-price only — create flow skips this modal and prepares with no discount. */
  const openRepriceModal = (
    job: RepairJob,
    auth?: RepairPaymentAuthorization,
  ) => {
    setPrepareJob(job);
    setDiscountType(auth?.discountType || "none");
    setDiscountValue(String(auth?.discountValue || 0));
    setReason("");
  };

  const prepareAuthorization = async (
    job: RepairJob,
    options?: {
      discountType?: RepairDiscountType;
      discountValue?: number;
      reason?: string;
    },
  ) => {
    if (!job.id) return;
    const nextDiscountType = options?.discountType || "none";
    const nextDiscountValue = Number(options?.discountValue || 0);
    const nextReason = String(options?.reason || "").trim();
    setBusy(true);
    try {
      await repairPaymentService.prepare({
        jobId: job.id,
        discountType: nextDiscountType,
        discountValue: nextDiscountValue,
        reason: nextReason,
      });
      toast.success(
        nextDiscountType === "none"
          ? "تم تجهيز إذن الدفع وأصبح جاهزًا للتحصيل."
          : "تم تجهيز الإذن وإرسال الخصم لاعتماد الإدارة.",
      );
      resetPrepareForm();
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز الإذن.");
    } finally {
      setBusy(false);
    }
  };

  const openCollectDialog = (
    auth: RepairPaymentAuthorization,
    kind: "deposit" | "receivable",
  ) => {
    setCollectKind(kind);
    setCollectAuth(auth);
    setAmount(String(auth.balanceDue));
  };

  const collect = async () => {
    if (!collectAuth?.id) return;
    setBusy(true);
    try {
      const requestId =
        globalThis.crypto?.randomUUID?.() || `pay-${Date.now()}`;
      const payload = {
        authorizationId: collectAuth.id,
        amount: Number(amount || 0),
        method,
        requestId,
      };
      if (collectKind === "receivable") {
        await repairPaymentService.collectReceivable(payload);
        toast.success("تم تحصيل الذمة وخصمها من ذمم العملاء.");
      } else {
        await repairPaymentService.collect(payload);
        toast.success("تم تسجيل الدفعة وترحيلها للخزينة والحسابات.");
      }
      setCollectAuth(null);
      setCollectKind("deposit");
      setAmount("0");
      await load();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تسجيل الدفعة.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resolveApproval = async (
    approval: RepairFinancialApproval,
    decision: "approved" | "rejected",
  ) => {
    if (!approval.id) return;
    setBusy(true);
    try {
      await repairPaymentService.resolveApproval({
        approvalId: approval.id,
        decision,
      });
      toast.success(
        decision === "approved" ? "تم اعتماد الطلب." : "تم رفض الطلب.",
      );
      await load();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تسجيل القرار.",
      );
    } finally {
      setBusy(false);
    }
  };

  const requestCredit = async (auth: RepairPaymentAuthorization) => {
    if (!auth.id) return;
    const why = window.prompt("اكتب سبب طلب التسليم برصيد:");
    if (!why?.trim()) return;
    setBusy(true);
    try {
      await repairPaymentService.requestCredit({
        authorizationId: auth.id,
        reason: why.trim(),
      });
      toast.success("تم إرسال طلب التسليم برصيد للإدارة.");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال الطلب.");
    } finally {
      setBusy(false);
    }
  };

  const deliver = async (auth: RepairPaymentAuthorization) => {
    const job = jobById.get(auth.jobId);
    if (
      !job?.id ||
      !window.confirm(`تأكيد تسليم المنتج للطلب #${auth.receiptNo}؟`)
    )
      return;
    setBusy(true);
    try {
      await repairPaymentService.deliver({
        jobId: job.id,
        warranty: job.warranty,
      });
      toast.success("تم التسليم وإصدار إذن التسليم بدون إنشاء تحصيل تلقائي.");
      await load();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تسليم المنتج.",
      );
    } finally {
      setBusy(false);
    }
  };

  const reversePayment = async (payment: RepairPayment) => {
    if (!payment.id) return;
    const why = window.prompt("اكتب سبب عكس الدفعة (إجباري):");
    if (!why?.trim()) return;
    setBusy(true);
    try {
      await repairPaymentService.reverse({
        paymentId: payment.id,
        reason: why.trim(),
      });
      toast.success("تم عكس الدفعة بقيد وخزينة عكسيين مرتبطين بالأصل.");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "تعذر عكس الدفعة.");
    } finally {
      setBusy(false);
    }
  };

  const startPrint = (
    auth: RepairPaymentAuthorization,
    payment?: RepairPayment,
  ) => {
    flushSync(() => {
      setPrintAuth(auth);
      setPrintPayment(payment || null);
    });
    handlePrint();
  };

  const exportDocument = (
    auth: RepairPaymentAuthorization,
    payment?: RepairPayment,
  ) => {
    flushSync(() => {
      setPrintAuth(auth);
      setPrintPayment(payment || null);
    });
    setExportingPdf(true);
    void exportToPDF(
      printRef.current,
      payment?.paymentNo || auth.authorizationNo || "repair-payment",
    )
      .then(() => toast.success("تم تنزيل ملف PDF."))
      .catch(() => toast.error("تعذر إنشاء ملف PDF."))
      .finally(() => setExportingPdf(false));
  };

  const renderAuthStatus = (auth: RepairPaymentAuthorization) => {
    const invalidPricing = isZeroValueAuthorization(auth);
    const warranty = isWarrantySettlementAuth(auth);
    return (
      <div className="flex min-w-0 flex-wrap gap-1">
        <ErpStatusBadge
          label={
            invalidPricing
              ? "غير صالح — بدون تسعير"
              : statusLabel(auth.status, auth)
          }
          type={repairPaymentAuthChipType(auth.status, {
            invalidPricing,
            warrantySettlement: warranty,
          })}
        />
        {warranty && !invalidPricing && auth.status !== "void" ? (
          <ErpStatusBadge label="ضمان مصنّع" type="info" />
        ) : null}
      </div>
    );
  };

  const renderAuthActions = (
    auth: RepairPaymentAuthorization,
    job: RepairJob | undefined,
  ) => {
    const isVoid = auth.status === "void";
    const canCollectDeposit =
      can("repair.payments.collect") &&
      !isWarrantySettlementAuth(auth) &&
      !isVoid &&
      job?.status === "ready" &&
      (auth.status === "approved" || auth.status === "partial");
    const canCollectReceivable =
      can("repair.payments.collect") &&
      !isWarrantySettlementAuth(auth) &&
      !isVoid &&
      Number(auth.balanceDue || 0) > 0.001 &&
      (job?.status === "delivered" ||
        job?.status === "completed" ||
        job?.financialState === "delivered_on_credit");

    return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {renderAuthStatus(auth)}
      {!isVoid ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => startPrint(auth)}
            title="طباعة إذن الدفع"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={exportingPdf}
            onClick={() => exportDocument(auth)}
            title="تنزيل إذن الدفع PDF"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : null}
      {job?.status === "ready" &&
      Number(auth.paidAmount || 0) === 0 &&
      !isVoid ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => openRepriceModal(job, auth)}
        >
          إعادة تسعير
        </Button>
      ) : null}
      {canCollectDeposit ? (
        <Button
          size="sm"
          onClick={() => openCollectDialog(auth, "deposit")}
        >
          <CreditCard className="ms-1 h-3.5 w-3.5" />
          تحصيل
        </Button>
      ) : null}
      {canCollectReceivable ? (
        <Button
          size="sm"
          onClick={() => openCollectDialog(auth, "receivable")}
        >
          <WalletCards className="ms-1 h-3.5 w-3.5" />
          تحصيل ذمة
        </Button>
      ) : null}
      {job?.status === "ready" &&
      can("repair.jobs.reception") &&
      !isZeroValueAuthorization(auth) &&
      !isVoid &&
      (auth.status === "paid" ||
        auth.creditApprovalStatus === "approved") ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void deliver(auth)}
        >
          تسليم المنتج
        </Button>
      ) : null}
      {job?.status === "ready" &&
      !isVoid &&
      auth.balanceDue > 0 &&
      auth.creditApprovalStatus !== "approved" &&
      can("repair.credit.request") &&
      branchById.get(auth.branchId)?.allowCreditDelivery !== false ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void requestCredit(auth)}
        >
          طلب تسليم برصيد
        </Button>
      ) : null}
      {job?.id ? (
        <Link
          to={withTenantPath(
            tenantSlug,
            `/repair/jobs/${job.id}`,
          )}
        >
          <Button size="sm" variant="ghost">
            فتح الطلب
          </Button>
        </Link>
      ) : null}
    </div>
    );
  };

  return (
    <RepairOpsPageShell
      eyebrow="التحصيل والتسليم"
      dir={dir}
      hero={[
        { key: "ready", label: "جاهز لإذن الدفع", value: readyWithoutAuthorization.length },
        { key: "pending", label: "بانتظار اعتماد", value: pendingApprovals.length, accent: pendingApprovals.length > 0 },
        {
          key: "collect",
          label: "جاهز للتحصيل",
          value: authorizations.filter((r) => r.status === "approved" || r.status === "partial").length,
        },
        {
          key: "ar",
          label: "ذمم مفتوحة",
          value: openReceivableAuthorizations.length,
          accent: openReceivableAuthorizations.length > 0,
        },
        {
          key: "paid",
          label: "مدفوع وجاهز للتسليم",
          value: authorizations.filter(
            (r) => r.status === "paid" && !isZeroValueAuthorization(r) && jobById.get(r.jobId)?.status === "ready",
          ).length,
        },
      ]}
      onRefresh={() => void load()}
      refreshing={loading}
    >

      {readyWithoutAuthorization.length > 0 ? (
        <OpsDashPanel title="طلبات جاهزة لتجهيز إذن الدفع" accent="repair" bodyClassName="p-0">
            <SmartFilterBar
              pageId="repair-payments-ready-auth"
              searchValue={readySearch}
              onSearchChange={setReadySearch}
              searchPlaceholder="بحث: رقم الإيصال، العميل، الهاتف، المنتج، الفرع..."
              quickFilters={[
                {
                  key: "branch",
                  placeholder: "كل الفروع",
                  options: branches
                    .filter((branch) =>
                      branchIds.includes(String(branch.id || "")),
                    )
                    .map((branch) => ({
                      value: String(branch.id || ""),
                      label: branch.name || String(branch.id || ""),
                    })),
                },
              ]}
              quickFilterValues={{ branch: readyBranchFilter }}
              onQuickFilterChange={(key, value) => {
                if (key === "branch") setReadyBranchFilter(value || "all");
              }}
            />
            <div className="space-y-2 px-4 pb-4">
              {pagedReadyWithoutAuthorization.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  لا توجد طلبات مطابقة لبحثك.
                </p>
              ) : (
                pagedReadyWithoutAuthorization.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold">
                        #{job.receiptNo} — {job.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {branchById.get(job.branchId)?.name || "—"} ·{" "}
                        {job.productName || job.deviceBrand}
                        {job.customerPhone ? ` · ${job.customerPhone}` : ""}
                      </p>
                      {(() => {
                        const readyDays = daysSinceJobStatus(job, "ready");
                        return readyDays != null ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            جاهز منذ {readyDays} يوم
                          </p>
                        ) : null;
                      })()}
                      {hasManufacturerWarrantyCoverage(job) ? (
                        <Badge variant="secondary" className="mt-1">
                          {isFullManufacturerWarrantyJob(job)
                            ? "داخل الضمان — بدون تحصيل"
                            : isPartialManufacturerWarrantyJob(job)
                              ? "ضمان مختلط — تحصيل غير الضمان"
                              : manufacturerWarrantyScopeLabel(job.warrantyScope, job.jobProducts)}
                        </Badge>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void prepareAuthorization(job)}
                    >
                      <FileCheck2 className="ms-1 h-4 w-4" />
                      {isManufacturerWarrantyJob(job)
                        ? "تجهيز إقفال الضمان"
                        : "تجهيز إذن الدفع"}
                    </Button>
                  </div>
                ))
              )}
              <DataPaginationFooter
                page={safeReadyPage}
                totalPages={readyTotalPages}
                totalItems={filteredReadyWithoutAuthorization.length}
                onPageChange={setReadyPage}
                itemLabel="طلب"
              />
            </div>
        </OpsDashPanel>
      ) : null}

      {pendingApprovals.length > 0 ? (
        <OpsDashPanel title="موافقات الإدارة" accent="repair">
          <div className="space-y-2">
            {pendingApprovals.map((approval) => (
              <div
                key={approval.id}
                className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold">
                    {approval.type === "discount"
                      ? "اعتماد خصم"
                      : "اعتماد تسليم برصيد"}{" "}
                    — {money(approval.requestedAmount)} ج.م
                  </p>
                  <p className="text-sm">{approval.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    طالب الاعتماد: {approval.requestedByName}
                  </p>
                </div>
                {can(
                  approval.type === "discount"
                    ? "repair.discounts.approve"
                    : "repair.credit.approve",
                ) ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void resolveApproval(approval, "approved")}
                    >
                      اعتماد
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void resolveApproval(approval, "rejected")}
                    >
                      رفض
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline">بانتظار الإدارة</Badge>
                )}
              </div>
            ))}
          </div>
        </OpsDashPanel>
      ) : null}

      {openReceivableAuthorizations.length > 0 ? (
        <OpsDashPanel
          title={`ذمم بعد التسليم · ${money(openReceivableTotal)} ج.م`}
          accent="repair"
          bodyClassName="p-0"
        >
          <div className="divide-y divide-[var(--color-border)]">
            {openReceivableAuthorizations.map((auth) => {
              const job = jobById.get(auth.jobId);
              return (
                <div
                  key={`ar-${auth.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">#{auth.receiptNo}</p>
                    <p className="text-xs text-muted-foreground">
                      {job?.customerName || "—"} · متبقي{" "}
                      <span className="font-medium tabular-nums text-foreground">
                        {money(auth.balanceDue)} ج.م
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {can("repair.payments.collect") ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => openCollectDialog(auth, "receivable")}
                      >
                        <WalletCards className="ms-1 h-3.5 w-3.5" />
                        تحصيل ذمة
                      </Button>
                    ) : null}
                    {job?.id ? (
                      <Link to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}>
                        <Button size="sm" variant="ghost">
                          فتح الطلب
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </OpsDashPanel>
      ) : null}

      <OpsDashPanel title="أذونات الدفع والتحصيل" accent="repair" bodyClassName="p-0">
          <div className="erp-mobile-card-list p-2 md:hidden">
            {authorizations.map((auth) => {
              const job = jobById.get(auth.jobId);
              return (
                <div
                  key={`m-${auth.id}`}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">{auth.authorizationNo}</p>
                      <p className="mt-0.5 text-sm font-semibold">#{auth.receiptNo}</p>
                      <p className="text-xs text-muted-foreground">{job?.customerName || "—"}</p>
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-[10px] text-muted-foreground">الإجمالي</dt>
                      <dd className="tabular-nums">{money(auth.grossAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-muted-foreground">الخصم</dt>
                      <dd className="tabular-nums text-muted-foreground">{money(auth.discountAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-muted-foreground">الصافي</dt>
                      <dd className="font-semibold tabular-nums">{money(auth.netAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-muted-foreground">المدفوع</dt>
                      <dd className="tabular-nums">{money(auth.paidAmount)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[10px] text-muted-foreground">المتبقي</dt>
                      <dd className="font-semibold tabular-nums">{money(auth.balanceDue)}</dd>
                    </div>
                  </dl>
                  <div className="mt-2">{renderAuthActions(auth, job)}</div>
                </div>
              );
            })}
            {!loading && authorizations.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لا توجد أذونات دفع بعد.
              </p>
            ) : null}
          </div>
          <div className="erp-desktop-table hidden overflow-x-auto md:block">
            <table className="table erp-table w-full min-w-[960px] text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">الإذن</th>
                  <th className="erp-th">الطلب / العميل</th>
                  <th className="erp-th">الإجمالي</th>
                  <th className="erp-th">الخصم</th>
                  <th className="erp-th">الصافي</th>
                  <th className="erp-th">المدفوع</th>
                  <th className="erp-th">المتبقي</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {authorizations.map((auth) => {
                  const job = jobById.get(auth.jobId);
                  const isVoid = auth.status === "void";
                  return (
                    <tr
                      key={auth.id}
                      className={`border-t ${isVoid ? "bg-muted/20 text-muted-foreground" : ""}`}
                    >
                      <td className="p-2 font-mono">{auth.authorizationNo}</td>
                      <td className="p-2">
                        <p className="font-semibold text-foreground">#{auth.receiptNo}</p>
                        <p className="text-xs text-muted-foreground">
                          {job?.customerName || "—"}
                        </p>
                        {job && mapLegacyRepairStatus(job.status) === "ready"
                          ? (() => {
                              const readyDays = daysSinceJobStatus(job, "ready");
                              return readyDays != null ? (
                                <p className="text-xs text-muted-foreground">
                                  جاهز منذ {readyDays} يوم
                                </p>
                              ) : null;
                            })()
                          : null}
                      </td>
                      <td className="p-2 tabular-nums">{money(auth.grossAmount)}</td>
                      <td className="p-2 tabular-nums text-muted-foreground">
                        {money(auth.discountAmount)}
                      </td>
                      <td className="p-2 font-semibold tabular-nums">
                        {money(auth.netAmount)}
                      </td>
                      <td className="p-2 tabular-nums">
                        {money(auth.paidAmount)}
                      </td>
                      <td className="p-2 tabular-nums font-medium">
                        {money(auth.balanceDue)}
                      </td>
                      <td className="p-2">{renderAuthStatus(auth)}</td>
                      <td className="p-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          {!isVoid ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startPrint(auth)}
                                title="طباعة إذن الدفع"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={exportingPdf}
                                onClick={() => exportDocument(auth)}
                                title="تنزيل إذن الدفع PDF"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : null}
                          {job?.status === "ready" &&
                          Number(auth.paidAmount || 0) === 0 &&
                          !isVoid ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => openRepriceModal(job, auth)}
                            >
                              إعادة تسعير
                            </Button>
                          ) : null}
                          {can("repair.payments.collect") &&
                          !isWarrantySettlementAuth(auth) &&
                          !isVoid &&
                          job?.status === "ready" &&
                          (auth.status === "approved" || auth.status === "partial") ? (
                            <Button
                              size="sm"
                              onClick={() => openCollectDialog(auth, "deposit")}
                            >
                              <CreditCard className="ms-1 h-3.5 w-3.5" />
                              تحصيل
                            </Button>
                          ) : null}
                          {can("repair.payments.collect") &&
                          !isWarrantySettlementAuth(auth) &&
                          !isVoid &&
                          Number(auth.balanceDue || 0) > 0.001 &&
                          (job?.status === "delivered" ||
                            job?.status === "completed" ||
                            job?.financialState === "delivered_on_credit") ? (
                            <Button
                              size="sm"
                              onClick={() => openCollectDialog(auth, "receivable")}
                            >
                              <WalletCards className="ms-1 h-3.5 w-3.5" />
                              تحصيل ذمة
                            </Button>
                          ) : null}
                          {job?.status === "ready" &&
                          can("repair.jobs.reception") &&
                          !isZeroValueAuthorization(auth) &&
                          !isVoid &&
                          (auth.status === "paid" ||
                            auth.creditApprovalStatus === "approved") ? (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => void deliver(auth)}
                            >
                              تسليم المنتج
                            </Button>
                          ) : null}
                          {job?.status === "ready" &&
                          !isVoid &&
                          auth.balanceDue > 0 &&
                          auth.creditApprovalStatus !== "approved" &&
                          can("repair.credit.request") &&
                          branchById.get(auth.branchId)?.allowCreditDelivery !== false ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void requestCredit(auth)}
                            >
                              طلب تسليم برصيد
                            </Button>
                          ) : null}
                          {job?.id ? (
                            <Link to={withTenantPath(tenantSlug, `/repair/jobs/${job.id}`)}>
                              <Button size="sm" variant="ghost">
                                فتح الطلب
                              </Button>
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && authorizations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="p-8 text-center text-muted-foreground"
                    >
                      لا توجد أذونات دفع بعد.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
      </OpsDashPanel>

      {payments.length > 0 ? (
        <OpsDashPanel title="آخر الإيصالات" accent="repair">
          <div className="flex flex-wrap gap-2">
            {payments.slice(0, 12).map((payment) => {
              const auth = authById.get(payment.authorizationId);
              return (
                <div
                  key={payment.id}
                  className="flex items-center gap-1 rounded-md border p-1"
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!auth}
                    onClick={() => auth && startPrint(auth, payment)}
                  >
                    <WalletCards className="ms-1 h-4 w-4" />
                    {payment.paymentNo} · {money(payment.amount)}
                  </Button>
                  {auth ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={exportingPdf}
                      onClick={() => exportDocument(auth, payment)}
                      title="تنزيل الإيصال PDF"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                  {payment.status !== "reversed" &&
                  can("repair.payments.reverse") ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void reversePayment(payment)}
                    >
                      عكس
                    </Button>
                  ) : null}
                  {payment.status === "reversed" ? (
                    <Badge variant="secondary">معكوس</Badge>
                  ) : null}
                </div>
              );
            })}
          </div>
        </OpsDashPanel>
      ) : null}

      <Dialog
        open={Boolean(prepareJob)}
        onOpenChange={(open) => !open && resetPrepareForm()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إعادة تسعير إذن الدفع</DialogTitle>
            <DialogDescription>
              يحسب الخادم الخدمات والقطع من جداول التسعير. أي خصم يُرسل للإدارة.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>نوع الخصم</Label>
              <Select
                value={discountType}
                onValueChange={(value) =>
                  setDiscountType(value as RepairDiscountType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون خصم</SelectItem>
                  <SelectItem value="amount">مبلغ ثابت</SelectItem>
                  <SelectItem value="percent">نسبة مئوية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {discountType !== "none" ? (
              <>
                <div>
                  <Label>
                    {discountType === "amount" ? "مبلغ الخصم" : "نسبة الخصم %"}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                  />
                </div>
                <div>
                  <Label>سبب الخصم</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetPrepareForm}>
              إلغاء
            </Button>
            <Button
              disabled={busy || !prepareJob}
              onClick={() =>
                prepareJob
                  ? void prepareAuthorization(prepareJob, {
                      discountType,
                      discountValue: Number(discountValue || 0),
                      reason,
                    })
                  : undefined
              }
            >
              {busy ? "جاري التجهيز…" : "حفظ التسعير"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(collectAuth)}
        onOpenChange={(open) => {
          if (!open) {
            setCollectAuth(null);
            setCollectKind("deposit");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {collectKind === "receivable" ? "تحصيل ذمة بعد التسليم" : "تسجيل دفعة"}
            </DialogTitle>
            <DialogDescription>
              الرصيد الحالي {money(collectAuth?.balanceDue)} ج.م.
              {collectKind === "receivable"
                ? " يُخصم من ذمم العملاء ويُرحَّل للخزينة."
                : " ستُرحل الدفعة للخزينة والقيد المحاسبي."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>المبلغ</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>وسيلة الدفع</Label>
              <Select
                value={method}
                onValueChange={(value) =>
                  setMethod(value as RepairPaymentMethod)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCollectAuth(null);
                setCollectKind("deposit");
              }}
            >
              إلغاء
            </Button>
            <Button disabled={busy} onClick={() => void collect()}>
              <CheckCircle2 className="ms-1 h-4 w-4" />
              {busy
                ? "جاري الترحيل…"
                : collectKind === "receivable"
                  ? "تأكيد تحصيل الذمة"
                  : "تأكيد التحصيل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        className="pointer-events-none fixed -left-[10000px] top-0"
        aria-hidden
      >
        <RepairPaymentPrint
          ref={printRef}
          authorization={printAuth}
          payment={printPayment}
          job={printAuth ? jobById.get(printAuth.jobId) : null}
          branch={printAuth ? branchById.get(printAuth.branchId) : null}
          printSettings={printSettings}
        />
      </div>
    </RepairOpsPageShell>
  );
};

export default RepairPayments;
