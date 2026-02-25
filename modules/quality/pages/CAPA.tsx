import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import type { QualityCAPA } from '@/types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityNotificationService } from '../services/qualityNotificationService';
import { qualityPrintService } from '../services/qualityPrintService';
import { qualitySettingsService } from '../services/qualitySettingsService';

const STATUS_OPTIONS: QualityCAPA['status'][] = ['open', 'in_progress', 'done', 'closed'];

export const CAPA: React.FC = () => {
  const { can } = usePermission();
  const canManageCapa = can('quality.capa.manage');
  const canPrint = can('quality.print');
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const workOrders = useAppStore((s) => s.workOrders);
  const lines = useAppStore((s) => s._rawLines);
  const products = useAppStore((s) => s._rawProducts);
  const [rows, setRows] = useState<QualityCAPA[]>([]);
  const [reasons, setReasons] = useState<{ code: string; labelAr: string }[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
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

  const createCAPA = async () => {
    if (!canCreate || !canManageCapa) return;
    await qualityInspectionService.createCAPA({
      reasonCode: form.reasonCode,
      title: form.title.trim(),
      actionPlan: form.actionPlan.trim(),
      ownerId: form.ownerId,
      dueDate: form.dueDate || undefined,
      status: 'open',
    });
    setForm({ reasonCode: '', title: '', actionPlan: '', ownerId: '', dueDate: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-black">CAPA</h2>
          <p className="text-sm text-slate-500">الإجراءات التصحيحية والوقائية</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={!canPrint}>طباعة التقرير</Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current) return;
              await qualityPrintService.exportDocumentPdf(printRef.current, 'quality-capa', 'capa');
            }}
            disabled={!canPrint}
          >
            PDF
          </Button>
        </div>
      </div>

      <Card title="إنشاء CAPA">
        <div ref={printRef}>
        <div className="grid md:grid-cols-2 gap-3">
          <select
            value={form.reasonCode}
            onChange={(e) => setForm((s) => ({ ...s, reasonCode: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            <option value="">اختر سبب</option>
            {reasons.map((reason) => (
              <option key={reason.code} value={reason.code}>{reason.labelAr}</option>
            ))}
          </select>

          <select
            value={form.ownerId}
            onChange={(e) => setForm((s) => ({ ...s, ownerId: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
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
            className="md:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />

          <textarea
            value={form.actionPlan}
            onChange={(e) => setForm((s) => ({ ...s, actionPlan: e.target.value }))}
            placeholder="خطة الإجراء"
            className="md:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm min-h-[100px]"
          />

          <input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={createCAPA} disabled={!canCreate || !canManageCapa}>إنشاء CAPA</Button>
        </div>
        </div>
      </Card>

      <Card title="متابعة CAPA">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                <th className="text-right py-2 px-2">Title</th>
                <th className="text-right py-2 px-2">Reason</th>
                <th className="text-right py-2 px-2">Owner</th>
                <th className="text-right py-2 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 px-2 font-bold">{row.title}</td>
                  <td className="py-2 px-2">{reasons.find((r) => r.code === row.reasonCode)?.labelAr ?? row.reasonCode}</td>
                  <td className="py-2 px-2">{_rawEmployees.find((e) => e.id === row.ownerId)?.name ?? row.ownerId}</td>
                  <td className="py-2 px-2">
                    <select
                      value={row.status}
                      onChange={async (e) => {
                        if (!row.id) return;
                        const nextStatus = e.target.value as QualityCAPA['status'];
                        await qualityInspectionService.updateCAPA(row.id, { status: nextStatus });
                        const linkedWorkOrder = row.workOrderId
                          ? workOrders.find((item) => item.id === row.workOrderId)
                          : null;
                        if (!linkedWorkOrder) return;
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
                      }}
                      disabled={!canManageCapa}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
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
    </div>
  );
};

