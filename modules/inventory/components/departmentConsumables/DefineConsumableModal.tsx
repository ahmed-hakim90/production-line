import React, { useState } from 'react';
import { Button } from '../../components/UI';
import { toast } from '../../../../components/Toast';
import { createMaterial } from '../../../manufacturing/usecases/createMaterial';
import { MATERIAL_UNIT_LABELS, type Material, type MaterialUnit } from '../../../manufacturing/types';
import { suggestConsumableCode, type ConsumableOption } from '../../lib/itemMovementTrace';
import { ModalShell } from './ModalShell';
import { MATERIAL_CREATE_PATHS } from '../../../system/lib/operationPathSettings';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (item: ConsumableOption) => void;
  canManage: boolean;
};

const inputClass =
  'w-full border border-[var(--color-border)] rounded-lg px-3 py-2 bg-[var(--color-card)] text-[var(--color-text)]';

export const DefineConsumableModal: React.FC<Props> = ({
  open,
  onClose,
  onCreated,
  canManage,
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState<MaterialUnit>('piece');
  const [purchaseCost, setPurchaseCost] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setName('');
    setCode('');
    setUnit('piece');
    setPurchaseCost('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!canManage) {
      toast.error('ليس لديك صلاحية تعريف مستهلكات.');
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('أدخل اسم المستهلك.');
      return;
    }
    const cost = Number(purchaseCost);
    if (!(cost >= 0) || Number.isNaN(cost)) {
      toast.error('أدخل سعر الوحدة (صفر أو أكبر).');
      return;
    }
    const finalCode = (code.trim() || suggestConsumableCode(trimmedName)).toUpperCase();
    const payload: Omit<Material, 'id' | 'createdAt' | 'tenantId'> = {
      code: finalCode,
      name: trimmedName,
      type: 'consumable',
      baseUnit: unit,
      purchaseCost: cost,
      conversionRate: 1,
      wastePercent: 0,
      isActive: true,
    };
    setSaving(true);
    try {
      const result = await createMaterial(
        payload,
        { path: MATERIAL_CREATE_PATHS.consumableDefineModal },
      );
      if (!result.ok || !result.data?.materialId) {
        throw result.ok === false
          ? result.error
          : new Error('تعذر تعريف المستهلك.');
      }
      const created: ConsumableOption = {
        id: result.data.materialId,
        name: trimmedName,
        code: finalCode,
        unit,
        purchaseCost: cost,
      };
      toast.success(`تم تعريف المستهلك: ${trimmedName}`);
      onCreated(created);
      reset();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تعريف المستهلك.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="تعريف مستهلك جديد"
      onClose={handleClose}
      maxWidthClassName="max-w-md"
      zIndexClassName="z-[10050]"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={handleClose}>إلغاء</Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !canManage}>
            {saving ? 'جاري الحفظ...' : 'حفظ المستهلك'}
          </Button>
        </>
      )}
    >
      {!canManage && (
        <p className="text-sm text-[rgb(var(--color-warning))]">
          تحتاج صلاحية إدارة المواد أو إنشاء صرف مستهلكات لتعريف صنف جديد.
        </p>
      )}
      <p className="text-sm text-[var(--color-text-muted)]">
        السعر يُحفظ مع الصنف ويظهر في تقرير الصرف الشهري.
      </p>
      <label className="block text-sm space-y-1">
        <span className="font-bold">الاسم *</span>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="جلانس تنظيف قطع الزجاج"
          disabled={!canManage}
        />
      </label>
      <label className="block text-sm space-y-1">
        <span className="font-bold">الكود</span>
        <input
          className={inputClass}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="اختياري — يُولَّد تلقائياً إن تُرك فارغاً"
          disabled={!canManage}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm space-y-1">
          <span className="font-bold">الوحدة *</span>
          <select
            className={inputClass}
            value={unit}
            onChange={(e) => setUnit(e.target.value as MaterialUnit)}
            disabled={!canManage}
          >
            {(Object.keys(MATERIAL_UNIT_LABELS) as MaterialUnit[]).map((u) => (
              <option key={u} value={u}>{MATERIAL_UNIT_LABELS[u]}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm space-y-1">
          <span className="font-bold">سعر الوحدة *</span>
          <input
            type="number"
            min={0}
            step="any"
            className={inputClass}
            value={purchaseCost === '' ? '' : purchaseCost}
            onChange={(e) => {
              const v = e.target.value;
              setPurchaseCost(v === '' ? '' : Number(v));
            }}
            placeholder="0"
            disabled={!canManage}
          />
        </label>
      </div>
    </ModalShell>
  );
};
