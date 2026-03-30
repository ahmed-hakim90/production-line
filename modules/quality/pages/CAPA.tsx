import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import type { QualityCAPA } from '@/types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityNotificationService } from '../services/qualityNotificationService';
import { qualityPrintService } from '../services/qualityPrintService';
import { qualitySettingsService } from '../services/qualitySettingsService';
import { SingleCAPAPrint } from '../components/QualityReportPrint';

const STATUS_OPTIONS: QualityCAPA['status'][] = ['open', 'in_progress', 'done', 'closed'];
const STATUS_LABELS: Record<QualityCAPA['status'], string> = {
  open: 'مفتوح',
  in_progress: 'قيد التنفيذ',
  done: 'مكتمل',
  closed: 'مغلق',
};

export const CAPA: React.FC = () => {
  const { can } = usePermission();
  const canManageCapa = can('quality.capa.manage');
  const canPrint = can('quality.print');
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const workOrders = useAppStore((s) => s.workOrders);
  const lines = useAppStore((s) => s._rawLines);
  const products = useAppStore((s) => s._rawProducts);
  const [rows, setRows] = useState<QualityCAPA[]>([]);
  const [reasons, setReasons] = useState<{ code: string; labelAr: string }[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({ contentRef: printRef, printSettings: printTemplate });
  const [form, setForm] = useState({
    workOrderId: '',
    defectId: '',
    reasonCode: '',
    title: '',
    actionPlan: '',
    ownerId: '',
    dueDate: '',
  });

  useEffect(() => {
    const unsub = qualityInspectionService.subscribeCAPA(setRows);
    qualitySettingsService.getReasons(true).then((r) => setReasons(r.map((x) => ({ code: x.code, labelAr: x.labelAr }))));
    return () => unsub();
  }, []);

  const canCreate = useMemo(
    () => form.reasonCode && form.title.trim() && form.actionPlan.trim() && form.ownerId,
    [form],
  );
  const rowsWithContext = useMemo(
    () =>
      rows.map((row) => {
        const linkedWorkOrder = row.workOrderId
          ? workOrders.find((item) => item.id === row.workOrderId)
          : null;
        return {
          ...row,
          workOrderNumber: linkedWorkOrder?.workOrderNumber ?? '—',
          lineName: linkedWorkOrder ? (lines.find((line) => line.id === linkedWorkOrder.lineId)?.name ?? linkedWorkOrder.lineId) : '—',
          productName: linkedWorkOrder ? (products.find((product) => product.id === linkedWorkOrder.productId)?.name ?? linkedWorkOrder.productId) : '—',
        };
      }),
    [rows, workOrders, lines, products],
  );
  const printRows = useMemo(
    () =>
      rows.map((row) => ({
        title: row.title,
        reasonLabel: reasons.find((r) => r.code === row.reasonCode)?.labelAr ?? row.reasonCode,
        ownerName: _rawEmployees.find((e) => e.id === row.ownerId)?.name ?? row.ownerId,
        statusLabel: STATUS_LABELS[row.status],
        dueDate: row.dueDate || undefined,
      })),
    [rows, reasons, _rawEmployees],
  );

  const createCAPA = async () => {
    if (!canCreate || !canManageCapa) return;
    try {
      await qualityInspectionService.createCAPA({
        workOrderId: form.workOrderId || undefined,
        defectId: form.defectId || undefined,
        reasonCode: form.reasonCode,
        title: form.title.trim(),
        actionPlan: form.actionPlan.trim(),
        ownerId: form.ownerId,
        dueDate: form.dueDate || undefined,
        status: 'open',
      });
      setForm({
        workOrderId: '',
        defectId: '',
        reasonCode: '',
        title: '',
        actionPlan: '',
        ownerId: '',
        dueDate: '',
      });
      setMessage({ type: 'success', text: 'تم إنشاء CAPA بنجاح.' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر إنشاء CAPA.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="erp-page-head">
        <div>
          <h2 className="page-title">CAPA</h2>
          <p className="page-subtitle">الإجراءات التصحيحية والوقائية</p>
        </div>
        <div className="erp-page-actions">
          <Button variant="outline" onClick={() => handlePrint()} disabled={!canPrint || rows.length === 0}>طباعة التقرير</Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current) return;
              try {
                await qualityPrintService.exportDocumentPdf(
                  printRef.current,
                  'quality-capa',
                  'capa',
                  undefined,
                  {
                    paperSize: printTemplate?.paperSize,
                    orientation: printTemplate?.orientation,
                    copies: printTemplate?.copies,
                  },
                );
                setMessage({ type: 'success', text: 'تم تصدير تقرير CAPA PDF بنجاح.' });
              } catch (error) {
                setMessage({
                  type: 'error',
                  text: error instanceof Error ? error.message : 'تعذر تصدير تقرير CAPA.',
                });
              }
            }}
            disabled={!canPrint || rows.length === 0}
          >
            PDF
          </Button>
        </div>
      </div>

      <Card title="إنشاء CAPA">
        {message && (
          <div className={`mb-3 rounded-[var(--border-radius-base)] border px-3 py-2 text-sm font-semibold ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60'
          }`}>
            {message.text}
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          <select
            value={form.workOrderId}
            onChange={(e) => setForm((s) => ({ ...s, workOrderId: e.target.value }))}
            className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
          >
            <option value="">ربط بأمر شغل (اختياري)</option>
            {workOrders.map((wo) => (
              <option key={wo.id} value={wo.id}>#{wo.workOrderNumber}</option>
            ))}
          </select>

          <input
            value={form.defectId}
            onChange={(e) => setForm((s) => ({ ...s, defectId: e.target.value }))}
            placeholder="Defect ID (اختياري)"
            className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
          />

          <select
            value={form.reasonCode}
            onChange={(e) => setForm((s) => ({ ...s, reasonCode: e.target.value }))}
            className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
          >
            <option value="">اختر سبب</option>
            {reasons.map((reason) => (
              <option key={reason.code} value={reason.code}>{reason.labelAr}</option>
            ))}
          </select>

          <select
            value={form.ownerId}
            onChange={(e) => setForm((s) => ({ ...s, ownerId: e.target.value }))}
            className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
          >
            <option value="">مسؤول التنفيذ</option>
            {_rawEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>

          <input
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            placeholder="عنوان CAPA"
            className="md:col-span-2 px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
          />

          <textarea
            value={form.actionPlan}
            onChange={(e) => setForm((s) => ({ ...s, actionPlan: e.target.value }))}
            placeholder="وصف الإجراء"
            className="md:col-span-2 px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm min-h-[100px]"
          />

          <input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))}
            className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={createCAPA} disabled={!canCreate || !canManageCapa}>إنشاء CAPA</Button>
        </div>
      </Card>

      <Card title="متابعة CAPA">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="erp-thead">
              <tr className="border-b border-[var(--color-border)] text-slate-500">
                <th className="erp-th">Title</th>
                <th className="erp-th">Reason</th>
                <th className="erp-th">Work Order</th>
                <th className="erp-th">Line / Product</th>
                <th className="erp-th">Owner</th>
                <th className="erp-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithContext.map((row) => (
                <tr key={row.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 px-2 font-bold">{row.title}</td>
                  <td className="py-2 px-2">{reasons.find((r) => r.code === row.reasonCode)?.labelAr ?? row.reasonCode}</td>
                  <td className="py-2 px-2">{row.workOrderNumber}</td>
                  <td className="py-2 px-2">{row.lineName} / {row.productName}</td>
                  <td className="py-2 px-2">{_rawEmployees.find((e) => e.id === row.ownerId)?.name ?? row.ownerId}</td>
                  <td className="py-2 px-2">
                    <select
                      value={row.status}
                      onChange={async (e) => {
                        if (!row.id) return;
                        const nextStatus = e.target.value as QualityCAPA['status'];
                        try {
                          await qualityInspectionService.updateCAPA(row.id, { status: nextStatus });
                          const linkedWorkOrder = row.workOrderId
                            ? workOrders.find((item) => item.id === row.workOrderId)
                            : null;
                          if (linkedWorkOrder) {
                            const summary = await qualityInspectionService.buildWorkOrderSummary(linkedWorkOrder.id!);
                            await qualityNotificationService.notifyReportStatusChanged({
                              workOrderId: linkedWorkOrder.id!,
                              workOrderNumber: linkedWorkOrder.workOrderNumber,
                              lineName: lines.find((line) => line.id === linkedWorkOrder.lineId)?.name ?? linkedWorkOrder.lineId,
                              productName: products.find((product) => product.id === linkedWorkOrder.productId)?.name ?? linkedWorkOrder.productId,
                              typeLabel: 'CAPA',
                              statusLabel: nextStatus,
                              summary,
                              updatedAt: new Date().toLocaleString(),
                              supervisorId: linkedWorkOrder.supervisorId,
                            });
                          }
                          setMessage({ type: 'success', text: 'تم تحديث حالة CAPA.' });
                        } catch (error) {
                          setMessage({
                            type: 'error',
                            text: error instanceof Error ? error.message : 'تعذر تحديث حالة CAPA.',
                          });
                        }
                      }}
                      disabled={!canManageCapa}
                      className="px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-card)] text-xs"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <SingleCAPAPrint ref={printRef} rows={printRows} printSettings={printTemplate} />
      </div>
    </div>
  );
};

