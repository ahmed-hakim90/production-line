import React, { useCallback, useRef, useState } from 'react';
import { Card, Button } from '../components/UI';
import { PageHeader } from '../../../components/PageHeader';
import { toast } from '../../../components/Toast';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import { exportAsImage, shareToWhatsApp, type ShareResult } from '../../../utils/reportExport';
import {
  SingleReportPrint,
  ProductionReportPrint,
  computePrintTotals,
  type ReportPrintRow,
} from '../../production/components/ProductionReportPrint';
import { StockTransferShareCard, type StockTransferPrintData } from '../../inventory/components/StockTransferPrint';

const DEMO_PRINT_TEMPLATE = DEFAULT_PRINT_TEMPLATE;

const DEMO_SINGLE_ROW: ReportPrintRow = {
  reportId: 'showcase-1',
  reportCode: 'RPT-NA',
  date: '2026-03-28',
  lineName: 'خط إنتاج 11',
  productName: 'راديو RX-606-607-608',
  employeeName: 'يوسف شريف عبد العاطي أحمد',
  quantityProduced: 1,
  wasteQuantity: 0,
  workersCount: 1,
  workersProductionCount: 1,
  workersPackagingCount: 0,
  workersQualityCount: 0,
  workersMaintenanceCount: 0,
  workersExternalCount: 0,
  workHours: 1,
  workOrderNumber: undefined,
  costPerUnit: undefined,
};

const DEMO_TRANSFER: StockTransferPrintData = {
  transferNo: 'TRF-DEMO-001',
  createdAt: new Date().toISOString(),
  fromWarehouseName: 'مخزن خامات',
  toWarehouseName: 'مخزن تجميع',
  createdBy: 'أحمد محمود',
  items: [
    {
      itemName: 'وحدة تحكم RX-606',
      itemCode: 'SKU-RX606',
      unitLabel: 'كرتونة',
      quantity: 2,
      quantityPieces: 48,
      unitsPerCarton: 24,
    },
    {
      itemName: 'ملحق تغليف',
      itemCode: 'PKG-01',
      unitLabel: 'قطعة',
      quantity: 0,
      quantityPieces: 12,
    },
  ],
};

const DEMO_BULK_ROWS: ReportPrintRow[] = [DEMO_SINGLE_ROW];

export const ImageExportShowcase: React.FC = () => {
  const singleRef = useRef<HTMLDivElement>(null);
  const transferRef = useRef<HTMLDivElement>(null);
  const bulkRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const showShareFeedback = useCallback((result: ShareResult) => {
    if (result.method === 'native_share' || result.method === 'cancelled') return;
    const msg = result.copied
      ? 'تم تحميل الصورة ونسخها — افتح المحادثة والصق الصورة (Ctrl+V)'
      : 'تم تحميل صورة التقرير — أرفقها في محادثة واتساب';
    toast.success(msg, 6000);
  }, []);

  const runExport = async (key: string, el: HTMLElement | null, fileName: string) => {
    if (!el) {
      toast.error('عنصر المعاينة غير جاهز.');
      return;
    }
    setBusy(key);
    try {
      await exportAsImage(el, fileName);
      toast.success('تم تحميل ملف PNG.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر التصدير.');
    } finally {
      setBusy(null);
    }
  };

  const runShare = async (key: string, el: HTMLElement | null, title: string) => {
    if (!el) {
      toast.error('عنصر المعاينة غير جاهز.');
      return;
    }
    setBusy(key);
    try {
      const result = await shareToWhatsApp(el, title);
      showShareFeedback(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر المشاركة.');
    } finally {
      setBusy(null);
    }
  };

  const bulkTotals = computePrintTotals(DEMO_BULK_ROWS, DEMO_PRINT_TEMPLATE.decimalPlaces ?? 0);

  return (
    <div className="space-y-6 p-4 max-w-5xl mx-auto">
      <PageHeader
        title="معمل تصدير الصور"
        subtitle="نفس قالب التقرير لكل من PNG ومشاركة واتساب"
        backAction={{ to: '/settings' }}
      />

      <Card title="ملاحظات المنصة">
        <ul className="text-sm text-[var(--color-text-muted)] space-y-2 list-disc pr-5">
          <li>
            على الهاتف: غالباً تظهر نافذة المشاركة مع إرفاق الصورة مباشرة عند اختيار واتساب.
          </li>
          <li>
            على الكمبيوتر: واتساب ويب لا يقبل إرفاق ملف من المتصفح تلقائياً؛ يتم تحميل PNG ونسخها للحافظة
            (عند الدعم) ثم فتح واتساب ويب للصق بالاختصار Ctrl+V.
          </li>
        </ul>
      </Card>

      <Card title="1) تقرير إنتاج (صف واحد — PrintReportLayout)">
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg bg-white p-2 mb-4">
          <SingleReportPrint
            ref={singleRef}
            exportRootId="showcase-single-production"
            report={DEMO_SINGLE_ROW}
            printSettings={DEMO_PRINT_TEMPLATE}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!!busy}
            onClick={() => void runExport('single', singleRef.current, 'showcase-تقرير-انتاج')}
          >
            تصدير PNG
          </Button>
          <Button
            disabled={!!busy}
            onClick={() => void runShare('single', singleRef.current, 'تقرير-إنتاج-معمل')}
          >
            مشاركة واتساب
          </Button>
        </div>
      </Card>

      <Card title="2) إذن تحويل مخزن (نفس القالب)">
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg bg-white p-2 mb-4">
          <StockTransferShareCard
            ref={transferRef}
            exportRootId="showcase-stock-transfer"
            data={DEMO_TRANSFER}
            companyName="مؤسسة المغربي للإستيراد"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!!busy}
            onClick={() => void runExport('transfer', transferRef.current, 'showcase-تحويل-مخزن')}
          >
            تصدير PNG
          </Button>
          <Button
            disabled={!!busy}
            onClick={() => void runShare('transfer', transferRef.current, 'تحويل-مخزن-معمل')}
          >
            مشاركة واتساب
          </Button>
        </div>
      </Card>

      <Card title="3) تقرير إنتاج مجمّع (جدول الطباعة الكامل)">
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg bg-slate-50 p-2 mb-4">
          <ProductionReportPrint
            ref={bulkRef}
            title="تقارير الإنتاج — معاينة"
            subtitle="سجل واحد للعرض"
            rows={DEMO_BULK_ROWS}
            totals={bulkTotals}
            printSettings={DEMO_PRINT_TEMPLATE}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!!busy}
            onClick={() => void runExport('bulk', bulkRef.current, 'showcase-تقارير-مجمعة')}
          >
            تصدير PNG
          </Button>
          <Button
            disabled={!!busy}
            onClick={() => void runShare('bulk', bulkRef.current, 'تقارير-إنتاج-مجمعة-معمل')}
          >
            مشاركة واتساب
          </Button>
        </div>
      </Card>
    </div>
  );
};
