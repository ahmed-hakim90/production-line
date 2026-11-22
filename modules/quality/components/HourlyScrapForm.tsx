import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { QualitySector } from '../domain/sector';
import { hourlyScrapQuantity } from '../domain/hourlyScrap';
import { STANDARD_SAMPLE_SLOTS } from '../domain/time';
import type { QualityNamedReason, QualitySampleSlot } from '../model';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityScrapService } from '../services/qualitySecondSortService';
import { qualitySettingsService } from '../services/qualitySettingsService';

export function HourlyScrapForm({
  date,
  sector,
  lineId,
  lineName,
  productId,
  productName,
  reasons,
  canSave,
  productionSupervisorName,
  qualitySupervisorName,
  recommendation,
  onSaved,
}: {
  date: string;
  sector: QualitySector | '';
  lineId: string;
  lineName: string;
  productId: string;
  productName: string;
  reasons: QualityNamedReason[];
  canSave: boolean;
  productionSupervisorName: string;
  qualitySupervisorName: string;
  recommendation: string;
  onSaved: () => Promise<void>;
}) {
  const [slots, setSlots] = useState<QualitySampleSlot[]>(STANDARD_SAMPLE_SLOTS.map((slot) => ({
    ...slot,
    id: slot.slotKey,
    tenantId: '',
    kind: 'hourly',
    isActive: true,
  })));
  const [cells, setCells] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void qualitySettingsService.listSlots('hourly')
      .then((rows) => setSlots(rows.filter((slot) => slot.isActive !== false)))
      .catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تحميل فترات السحب')));
  }, []);

  const keyOf = (slotName: string, reasonId: string) => `${slotName}|${reasonId}`;
  const periods = slots.flatMap((slot) => reasons.map((reason) => ({
    slotName: slot.slotName,
    reasonId: reason.id,
    reasonLabel: reason.name,
    quantity: Number(cells[keyOf(slot.slotName, reason.id)] || 0),
  }))).filter((period) => period.quantity > 0);

  return (
    <section className="qms-card" style={{ marginBottom: 12 }}>
      <h2 className="qms-label">هالك ساعي لمنتج واحد</h2>
      <p className="qms-muted">كل خانات الجدول تخص المنتج والخط المختارين أعلاه. الفترات تأتي من جدول الساعات المعتمد.</p>
      {slots.length === 0 ? <p>أضف فترات السحب الساعي من إعدادات الجودة قبل تسجيل الجدول.</p> : null}
      {reasons.length === 0 ? <p>أضف أسباب الهالك قبل تسجيل الجدول.</p> : null}
      {slots.length > 0 && reasons.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="qms-table">
            <thead>
              <tr>
                <th>الفترة</th>
                {reasons.map((reason) => <th key={reason.id}>{reason.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.id}>
                  <td>{slot.slotName}</td>
                  {reasons.map((reason) => (
                    <td key={reason.id}>
                      <input
                        className="qms-input"
                        type="number"
                        min={0}
                        value={cells[keyOf(slot.slotName, reason.id)] || ''}
                        onChange={(event) => setCells((current) => ({ ...current, [keyOf(slot.slotName, reason.id)]: Number(event.target.value) }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="qms-row" style={{ marginTop: 12 }}>
        <strong>الإجمالي: {hourlyScrapQuantity(periods)}</strong>
        <button
          type="button"
          className="qms-btn qms-btn-primary"
          disabled={saving || !canSave || periods.length === 0}
          onClick={() => {
            if (!lineId || !productId || !sector) {
              toast.error('اختر الخط والمنتج وقطاع الجودة');
              return;
            }
            setSaving(true);
            void qualityScrapService.save({
              reportDate: date,
              reportType: 'hourly',
              lineId,
              lineName,
              productId,
              productName,
              sector,
              quantity: hourlyScrapQuantity(periods),
              reasonLabel: 'جدول ساعي',
              periods,
              productionSupervisorName,
              qualitySupervisorName,
              recommendation,
            }).then(async () => {
              toast.success('تم حفظ الهالك الساعي');
              setCells({});
              await onSaved();
            }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الحفظ')))
              .finally(() => setSaving(false));
          }}
        >حفظ الجدول</button>
      </div>
    </section>
  );
};
