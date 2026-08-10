import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { toast } from '../../../components/Toast';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import {
  exportAsImage,
  getShareResultFeedbackMessage,
  shareToWhatsApp,
  type ShareResult,
} from '../../../utils/reportExport';
import {
  SingleReportPrint,
  ProductionReportPrint,
  computePrintTotals,
} from '../../production/components/ProductionReportPrint';
import { ProductionReportShareCard } from '../../production/components/ProductionReportShareCard';
import { RepairSalesInvoicePrint } from '../../repair/components/RepairSalesInvoicePrint';
import { StockTransferShareCard } from '../../inventory/components/StockTransferPrint';
import { ItemCardPrint } from '../../inventory/components/ItemCardPrint';
import {
  PRINT_PREVIEW_BRANCH_NAME,
  PRINT_PREVIEW_ITEM_CARD,
  PRINT_PREVIEW_REPAIR_INVOICE,
  PRINT_PREVIEW_SAMPLE_ROW,
  PRINT_PREVIEW_SAMPLE_ROWS,
  PRINT_PREVIEW_TRANSFER,
} from '../lib/printPreviewSamples';
import { useAppStore } from '@/store/useAppStore';

const WHATSAPP_CARD_WIDTH = 1080;
const WHATSAPP_PREVIEW_SCALE = 0.42;

export const ImageExportShowcase: React.FC = () => {
  const whatsappRef = useRef<HTMLDivElement>(null);
  const singleRef = useRef<HTMLDivElement>(null);
  const transferRef = useRef<HTMLDivElement>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const itemCardRef = useRef<HTMLDivElement>(null);
  const bulkRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const printTemplate = useAppStore((s) => s.systemSettings?.printTemplate) ?? DEFAULT_PRINT_TEMPLATE;
  const printSettings = useMemo(
    () => ({ ...DEFAULT_PRINT_TEMPLATE, ...printTemplate }),
    [printTemplate],
  );

  const showShareFeedback = useCallback((result: ShareResult) => {
    const msg = getShareResultFeedbackMessage(result, { downloadEntityLabel: 'التقرير' });
    if (!msg) return;
    toast.success(msg, 8000);
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

  const bulkTotals = computePrintTotals(PRINT_PREVIEW_SAMPLE_ROWS, printSettings.decimalPlaces ?? 0);

  return (
    <ModuleOpsPageShell
      eyebrow="النظام"
      rangeLabel="معمل تصدير الصور — الأنواع الأساسية للطباعة والمشاركة"
      className="w-full min-w-0"
    >
      <OpsDashPanel title="إرشادات المنصة" accent="quality">
        <ul className="text-sm text-[var(--color-text-muted)] space-y-2 list-disc pr-5">
          <li>الإعداد الرسمي للتحكم في الحقول/الخط/المعاينة: `/settings/reports`.</li>
          <li>هذا المعمل يجرّب PNG ومشاركة واتساب بنفس قالب الطباعة المحفوظ للمستأجر.</li>
          <li>الأنواع الأساسية: تقرير إنتاج، فاتورة صيانة، تحويل مخزون، كارت صنف.</li>
        </ul>
      </OpsDashPanel>

      <OpsDashPanel title="1) بطاقة مشاركة واتساب — تقرير إنتاج (1080px)" accent="quality">
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] p-2 mb-4 flex justify-center">
          <div style={{ zoom: WHATSAPP_PREVIEW_SCALE }}>
            <div style={{ width: WHATSAPP_CARD_WIDTH, background: 'white' }}>
              <ProductionReportShareCard
                report={PRINT_PREVIEW_SAMPLE_ROW}
                printSettings={printSettings}
              />
            </div>
          </div>
          <div
            aria-hidden
            style={{
              position: 'fixed',
              left: -99999,
              top: 0,
              width: WHATSAPP_CARD_WIDTH,
              pointerEvents: 'none',
              zIndex: -1,
            }}
          >
            <div ref={whatsappRef} style={{ width: WHATSAPP_CARD_WIDTH, background: 'white' }}>
              <ProductionReportShareCard
                report={PRINT_PREVIEW_SAMPLE_ROW}
                printSettings={printSettings}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!!busy}
            onClick={() => void runExport('whatsapp', whatsappRef.current, 'showcase-واتساب-تقرير')}
          >
            تصدير PNG
          </Button>
          <Button
            disabled={!!busy}
            onClick={() => void runShare('whatsapp', whatsappRef.current, 'تقرير-واتساب-معمل')}
          >
            مشاركة واتساب
          </Button>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title="2) تقرير إنتاج مطبوع (صف واحد)" accent="quality">
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg bg-[var(--color-card)] p-2 mb-4">
          <SingleReportPrint
            ref={singleRef}
            exportRootId="showcase-single-production"
            report={PRINT_PREVIEW_SAMPLE_ROW}
            printSettings={printSettings}
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
      </OpsDashPanel>

      <OpsDashPanel title="3) فاتورة صيانة" accent="quality">
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg bg-[var(--color-card)] p-2 mb-4">
          <RepairSalesInvoicePrint
            ref={invoiceRef}
            invoice={PRINT_PREVIEW_REPAIR_INVOICE}
            branchName={PRINT_PREVIEW_BRANCH_NAME}
            printSettings={printSettings}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!!busy}
            onClick={() => void runExport('invoice', invoiceRef.current, 'showcase-فاتورة-صيانة')}
          >
            تصدير PNG
          </Button>
          <Button
            disabled={!!busy}
            onClick={() => void runShare('invoice', invoiceRef.current, 'فاتورة-صيانة-معمل')}
          >
            مشاركة واتساب
          </Button>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title="4) إذن تحويل مخزون" accent="quality">
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg bg-[var(--color-card)] p-2 mb-4">
          <StockTransferShareCard
            ref={transferRef}
            exportRootId="showcase-stock-transfer"
            data={PRINT_PREVIEW_TRANSFER}
            printSettings={printSettings}
            companyName={printSettings.headerText || 'مؤسسة المغربي للإستيراد'}
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
      </OpsDashPanel>

      <OpsDashPanel title="5) كارت الصنف" accent="quality">
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg bg-[var(--color-card)] p-2 mb-4">
          <ItemCardPrint
            ref={itemCardRef}
            card={PRINT_PREVIEW_ITEM_CARD}
            printSettings={printSettings}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!!busy}
            onClick={() => void runExport('itemCard', itemCardRef.current, 'showcase-كارت-صنف')}
          >
            تصدير PNG
          </Button>
          <Button
            disabled={!!busy}
            onClick={() => void runShare('itemCard', itemCardRef.current, 'كارت-صنف-معمل')}
          >
            مشاركة واتساب
          </Button>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title="6) تقرير إنتاج مجمّع" accent="quality">
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] p-2 mb-4">
          <ProductionReportPrint
            ref={bulkRef}
            title="تقارير الإنتاج — معاينة"
            subtitle="سجل واحد للعرض"
            rows={PRINT_PREVIEW_SAMPLE_ROWS}
            totals={bulkTotals}
            printSettings={printSettings}
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
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
