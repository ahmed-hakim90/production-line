import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { Factory_REPAIR_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintAccentHex } from '../../../utils/printTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import { FactoryPrintTable } from '@/src/components/erp/FactoryPrintTable';
import {
  buildRepairProductCardFields,
  resolveRepairJobPrintProducts,
  type RepairPrintStatusMap,
} from '../lib/repairJobPrint';
import type { RepairBranch, RepairJob, RepairJobProduct } from '../types';

export type RepairJobProductCardPrintProps = {
  job: RepairJob | null;
  branch?: RepairBranch | null;
  products?: RepairJobProduct[];
  printSettings?: PrintTemplateSettings;
  statusMap?: RepairPrintStatusMap;
  workUrl?: string;
};

/** Internal job card — engine chrome on A5. */
export const RepairJobProductCardPrint = React.forwardRef<HTMLDivElement, RepairJobProductCardPrintProps>(
  function RepairJobProductCardPrint({ job, branch, products, printSettings, statusMap, workUrl }, ref) {
    if (!job) return <div ref={ref} />;

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings, paperSize: 'a5' as const };
    const doc = resolvePrintDocumentConfig(ps, 'repairJobCard');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const rows = resolveRepairJobPrintProducts(job, products);
    const cards = rows.map((product) => buildRepairProductCardFields(job, product, branch?.name, statusMap));
    const summary = cards[0];
    const showQr = Boolean(workUrl) && doc.isFieldVisible('qrCode');
    const showStatus = doc.isFieldVisible('statusBadge');
    const brandName = String(doc.headerText || '').trim() || 'مركز الصيانة';
    const createdAt = job.createdAt
      ? (() => {
          const d = new Date(job.createdAt);
          return Number.isNaN(d.getTime()) ? job.createdAt : d.toLocaleString('ar-EG');
        })()
      : '—';
    const printedAt = new Date().toLocaleString('ar-EG');
    const footer = String(doc.footerText || '').trim() || 'كارت واحد للطلب بالكامل — للاستخدام الداخلي';

    return (
      <FactoryPrintShell
        ref={ref}
        companyName={brandName}
        documentType="كارت طلب الصيانة الداخلي"
        printDate={printedAt}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={footer || Factory_REPAIR_FOOTER_TAGLINE}
        showVersion={false}
        paperWidth="148mm"
        minHeight="210mm"
        padding="4mm 5mm"
        dense
        fontFamily={font.fontFamily}
        fontSize={font.denseFontSize}
        extraLines={doc.customLines}
        metaCards={[
          { label: 'رقم الإيصال', value: summary.receiptNo || '—' },
          { label: 'الفرع', value: summary.branchName || '—' },
          { label: 'تاريخ الاستلام', value: createdAt },
          ...(showStatus ? [{ label: 'الحالة', value: summary.statusLabel || '—' }] : []),
        ]}
        kpis={[
          { label: 'العميل', value: summary.customerName || '—', tone: 'indigo' as const },
          { label: 'الهاتف', value: summary.customerPhone || '—' },
          { label: 'عدد المنتجات', value: rows.length, tone: 'sky' as const },
        ]}
      >
        <FactoryPrintSectionTitle title={`منتجات الطلب (${rows.length})`} />
        <FactoryPrintTable
          dense
          brandAccent={accent}
          printSettings={ps}
          columns={[
            { key: 'idx', header: '#', width: '6%', align: 'center' },
            { key: 'product', header: 'المنتج × الكمية', width: '28%' },
            { key: 'serial', header: 'السيريال', width: '18%', align: 'center' },
            { key: 'detail', header: 'العطل / الملحقات', width: '48%' },
          ]}
          rows={rows.map((product, index) => {
            const card = cards[index];
            const quantity = Math.max(1, Math.round(Number(product.quantity || 1)));
            return {
              key: product.itemId || String(index),
              cells: {
                idx: index + 1,
                product: (
                  <span>
                    <strong>{card.productName}</strong>
                    <span> × {quantity}</span>
                  </span>
                ),
                serial: card.serialNo,
                detail: (
                  <span style={{ whiteSpace: 'pre-wrap' }}>
                    <strong>عطل:</strong> {card.diagnosis}
                    {' · '}
                    <strong>ملحقات:</strong> {card.accessories}
                  </span>
                ),
              },
            };
          })}
        />

        {showQr && workUrl ? (
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              border: `1.5px dashed ${accent}`,
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <QRCodeSVG value={workUrl} size={72} includeMargin={false} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: accent }}>مسح الفني</div>
              <div style={{ marginTop: 2, fontSize: 10, fontWeight: 700, color: '#64748b' }}>
                باركود فتح مساحة عمل الطلب
              </div>
              <div style={{ marginTop: 2, fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>
                {summary.receiptNo}
              </div>
            </div>
          </div>
        ) : null}
      </FactoryPrintShell>
    );
  },
);
