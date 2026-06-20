import React, { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { formatNumber } from '@/utils/calculations';
import { Button } from './UI';

type Props = {
  lineId: string;
};

export const LineProductWorkerTargetsSection: React.FC<Props> = ({ lineId }) => {
  const { can } = usePermission();
  const canManage = can('production.workerTargets.manage') || can('production.workers.manage');

  const products = useAppStore((s) => s.products);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const createLineProductConfig = useAppStore((s) => s.createLineProductConfig);
  const updateLineProductConfig = useAppStore((s) => s.updateLineProductConfig);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ productId: '', dailyWorkerTargetQty: 0 });
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  const lineConfigs = useMemo(
    () => lineProductConfigs.filter((c) => c.lineId === lineId),
    [lineProductConfigs, lineId],
  );

  const productNameById = useMemo(
    () => new Map(products.map((p) => [String(p.id), p.name])),
    [products],
  );

  const usedProductIds = useMemo(
    () => new Set(lineConfigs.map((c) => c.productId)),
    [lineConfigs],
  );

  const availableProducts = useMemo(
    () => products.filter((p) => p.id && !usedProductIds.has(p.id)),
    [products, usedProductIds],
  );

  const saveTarget = async (configId: string, dailyWorkerTargetQty: number) => {
    setSavingId(configId);
    try {
      await updateLineProductConfig(configId, { dailyWorkerTargetQty });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[configId];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  };

  const addConfig = async () => {
    if (!form.productId || form.dailyWorkerTargetQty <= 0) return;
    setAdding(true);
    try {
      await createLineProductConfig({
        lineId,
        productId: form.productId,
        standardAssemblyTime: 0,
        dailyWorkerTargetQty: form.dailyWorkerTargetQty,
      });
      setForm({ productId: '', dailyWorkerTargetQty: 0 });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
        أدخل <strong>كمية الإنتاج اليومية لكل عامل</strong> (قطعة/عامل/يوم) — وليس إجمالي إنتاج الخط.
        مثال: إذا كان كل عامل يُفترض أن ينتج 120 قطعة، أدخل 120 (وليس 120 × عدد العمال).
        يُطبَّق نفس الرقم على كل العمال على هذا الخط لهذا المنتج.
      </p>

      {canManage && availableProducts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            className="border border-[var(--color-border)] rounded-lg p-2.5 text-sm"
            value={form.productId}
            onChange={(e) => setForm((prev) => ({ ...prev, productId: e.target.value }))}
          >
            <option value="">اختر المنتج</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            className="border border-[var(--color-border)] rounded-lg p-2.5 text-sm"
            placeholder="كمية العامل / يوم (قطعة)"
            value={form.dailyWorkerTargetQty || ''}
            onChange={(e) => setForm((prev) => ({
              ...prev,
              dailyWorkerTargetQty: Number(e.target.value) || 0,
            }))}
          />
          <Button disabled={adding || !form.productId || form.dailyWorkerTargetQty <= 0} onClick={() => void addConfig()}>
            {adding ? 'جاري الحفظ...' : 'إضافة'}
          </Button>
        </div>
      )}

      {lineConfigs.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">لا توجد أهداف منتج/خط لهذا الخط بعد.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--color-text-muted)]">
                <th className="text-right py-2">المنتج</th>
                <th className="text-center py-2">كمية العامل / يوم</th>
                {canManage && <th className="text-center py-2 w-28">حفظ</th>}
              </tr>
            </thead>
            <tbody>
              {lineConfigs.map((config) => {
                const configId = config.id!;
                const draft = drafts[configId];
                const value = draft ?? config.dailyWorkerTargetQty ?? 0;
                const dirty = draft !== undefined && draft !== (config.dailyWorkerTargetQty ?? 0);
                return (
                  <tr key={configId} className="border-t border-[var(--color-border)]">
                    <td className="py-2 font-medium">
                      {productNameById.get(config.productId) ?? config.productId}
                    </td>
                    <td className="py-2 text-center">
                      {canManage ? (
                        <input
                          type="number"
                          min={0}
                          className="w-28 border border-[var(--color-border)] rounded-md text-center py-1 tabular-nums"
                          value={value || ''}
                          onChange={(e) => setDrafts((prev) => ({
                            ...prev,
                            [configId]: Number(e.target.value) || 0,
                          }))}
                        />
                      ) : (
                        <span className="tabular-nums">{formatNumber(value)}</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-2 text-center">
                        <button
                          type="button"
                          className="text-xs font-bold text-primary disabled:opacity-40"
                          disabled={!dirty || savingId === configId}
                          onClick={() => void saveTarget(configId, value)}
                        >
                          {savingId === configId ? '...' : 'حفظ'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
