import React, { forwardRef } from 'react';
import type { PrintDocumentTypeId, PrintTemplateSettings } from '../../../../types';
import { SingleReportPrint, WorkOrderPrint } from '../../../production/components/ProductionReportPrint';
import type { ReportPrintRow } from '../../../production/components/ProductionReportPrint';
import { ProductionWorkerReportPrint } from '../../../production/components/ProductionWorkerReportPrint';
import { RoutingExecutionPrint } from '../../../production/routing/components/RoutingExecutionPrint';
import { RepairSalesInvoicePrint } from '../../../repair/components/RepairSalesInvoicePrint';
import { RepairPaymentPrint } from '../../../repair/components/RepairPaymentPrint';
import { RepairSpareIssuePrint } from '../../../repair/components/RepairSpareIssuePrint';
import { RepairTreasuryMonthlyPrint } from '../../../repair/components/RepairTreasuryMonthlyPrint';
import { SparePartsInventoryCountPrint } from '../../../repair/components/SparePartsInventoryCountPrint';
import { WarehouseCountSheetPrint } from '../../../inventory/components/WarehouseCountSheetPrint';
import { StockTransferPrint } from '../../../inventory/components/StockTransferPrint';
import { ItemCardPrint } from '../../../inventory/components/ItemCardPrint';
import { ItemBarcodeLabelPrint } from '../../../inventory/components/ItemBarcodeLabelPrint';
import { LocationBarcodeLabelPrint } from '../../../inventory/components/LocationBarcodeLabelPrint';
import { SuppliesReceiptPrint } from '../../../inventory/components/SuppliesReceiptPrint';
import { ProductionIssuePrint } from '../../../inventory/components/ProductionIssuePrint';
import { DepartmentConsumableIssuePrint } from '../../../inventory/components/DepartmentConsumableIssuePrint';
import { SparePartsReplenishmentPrint } from '../../../inventory/components/SparePartsReplenishmentPrint';
import { AccountingReportPrint } from '../../../accounting/components/AccountingReportPrint';
import { QualityReportPrint } from '../../../quality/components/QualityReportPrint';
import { PayslipPrint } from '../../../hr/components/PayslipPrint';
import { CatalogProductDetailPrint } from '../../../catalog/components/CatalogProductDetailPrint';
import { MissingComponentsReportPrint } from '../../../production/components/MissingComponentsReportPrint';
import { SupervisorPerformancePrint } from '../../../production/components/SupervisorPerformancePrint';
import { ProductBomCountCardPrint } from '../../../production/components/ProductBomCountCardPrint';
import { RepairJobPrint } from '../../../repair/components/RepairJobPrint';
import { RepairJobProductCardPrint } from '../../../repair/components/RepairJobProductCardPrint';
import { DeliveryReceiptPDF } from '../../../repair/components/DeliveryReceiptPDF';
import { FactoryPrintShell } from '@/src/components/erp/FactoryPrintShell';
import { resolvePrintAccentHex } from '@/utils/printTheme';
import { getPrintDocumentEntry } from '../../../../utils/print/printDocumentRegistry';
import { DEFAULT_PRINT_TEMPLATE } from '../../../../utils/dashboardConfig';
import {
  PRINT_PREVIEW_ACCOUNTING,
  PRINT_PREVIEW_BRANCH_NAME,
  PRINT_PREVIEW_CATALOG_PRODUCT,
  PRINT_PREVIEW_ITEM_CARD,
  PRINT_PREVIEW_ITEM_BARCODE_LABELS,
  PRINT_PREVIEW_LOCATION_BARCODE_LABELS,
  PRINT_PREVIEW_MISSING_COMPONENTS,
  PRINT_PREVIEW_PAYSLIP,
  PRINT_PREVIEW_PRODUCT_BOM_COUNT,
  PRINT_PREVIEW_DEPARTMENT_CONSUMABLE_ISSUE,
  PRINT_PREVIEW_PRODUCTION_ISSUE,
  PRINT_PREVIEW_QUALITY,
  PRINT_PREVIEW_REPAIR_BRANCH,
  PRINT_PREVIEW_REPAIR_INVOICE,
  PRINT_PREVIEW_REPAIR_JOB,
  PRINT_PREVIEW_REPAIR_PAYMENT_AUTH,
  PRINT_PREVIEW_REPAIR_PAYMENT_JOB,
  PRINT_PREVIEW_REPAIR_SPARE_ISSUE,
  PRINT_PREVIEW_REPAIR_TREASURY,
  PRINT_PREVIEW_ROUTING_EXECUTION,
  PRINT_PREVIEW_SAMPLE_ROW,
  PRINT_PREVIEW_SPARE_PARTS_COUNT,
  PRINT_PREVIEW_SUPERVISOR_PERFORMANCE,
  PRINT_PREVIEW_SUPPLIES_RECEIPT,
  PRINT_PREVIEW_TRANSFER,
  PRINT_PREVIEW_STOCK_RECEIPT,
  PRINT_PREVIEW_STOCK_ISSUE,
  PRINT_PREVIEW_WAREHOUSE_COUNT,
  PRINT_PREVIEW_WORK_ORDER,
  PRINT_PREVIEW_WORKER_REPORT,
} from '../../lib/printPreviewSamples';

type Props = {
  docType: PrintDocumentTypeId;
  printSettings: PrintTemplateSettings;
  sampleRow?: ReportPrintRow;
};

/** Generic shell preview for document types that still use a custom layout outside the shared table engine. */
const GenericShellPreview = forwardRef<
  HTMLDivElement,
  { docType: PrintDocumentTypeId; printSettings: PrintTemplateSettings }
>(function GenericShellPreview({ docType, printSettings }, ref) {
  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
  const entry = getPrintDocumentEntry(docType);
  const printedAt = new Date().toLocaleString('ar-EG');
  return (
    <FactoryPrintShell
      ref={ref}
      companyName={ps.headerText || 'مؤسسة المغربي'}
      documentType={entry.labelAr}
      printDate={printedAt}
      logoUrl={ps.logoUrl}
      brandAccent={resolvePrintAccentHex(ps.primaryColor)}
      footerTagline={ps.footerText?.trim() || undefined}
      paperWidth="210mm"
      minHeight="120mm"
      padding="10mm 12mm"
      metaCards={[
        { label: 'نوع المستند', value: entry.labelAr },
        { label: 'المعاينة', value: 'محرك الطباعة' },
        { label: 'التاريخ', value: printedAt },
        { label: 'الحالة', value: 'عينة' },
      ]}
      kpis={[
        { label: 'بنود تجريبية', value: 3, tone: 'default' },
        { label: 'إجمالي', value: '1,250', tone: 'indigo' },
      ]}
      signatures={[{ title: 'المسؤول' }, { title: 'الاعتماد' }]}
    >
      <p className="text-[12px] font-bold text-slate-600 leading-relaxed">
        هذه معاينة لهوية الطباعة الموحدة (الشعار + اسم الشركة + الجدول). المستند التشغيلي الكامل يُطبع من صفحته بنفس المحرك.
      </p>
    </FactoryPrintShell>
  );
});

/**
 * Single switch that renders the real print component for every registry document type.
 * Used by the print engine settings page (inline + modal preview).
 */
export const PrintEngineDocumentPreview = forwardRef<HTMLDivElement, Props>(
  function PrintEngineDocumentPreview({ docType, printSettings, sampleRow }, ref) {
    const previewRow = sampleRow ?? PRINT_PREVIEW_SAMPLE_ROW;

    switch (docType) {
      case 'productionReport':
        return <SingleReportPrint ref={ref} report={previewRow} printSettings={printSettings} />;
      case 'workOrder':
        return <WorkOrderPrint ref={ref} data={PRINT_PREVIEW_WORK_ORDER} printSettings={printSettings} />;
      case 'repairSalesInvoice':
        return (
          <RepairSalesInvoicePrint
            ref={ref}
            invoice={PRINT_PREVIEW_REPAIR_INVOICE}
            branchName={PRINT_PREVIEW_BRANCH_NAME}
            printSettings={printSettings}
          />
        );
      case 'stockTransfer':
        return <StockTransferPrint ref={ref} data={PRINT_PREVIEW_TRANSFER} printSettings={printSettings} />;
      case 'stockReceipt':
        return <StockTransferPrint ref={ref} data={PRINT_PREVIEW_STOCK_RECEIPT} printSettings={printSettings} />;
      case 'stockIssue':
        return <StockTransferPrint ref={ref} data={PRINT_PREVIEW_STOCK_ISSUE} printSettings={printSettings} />;
      case 'itemCard':
        return <ItemCardPrint ref={ref} card={PRINT_PREVIEW_ITEM_CARD} printSettings={printSettings} />;
      case 'accountingReport':
        return (
          <AccountingReportPrint
            ref={ref}
            title={PRINT_PREVIEW_ACCOUNTING.title}
            subtitle={PRINT_PREVIEW_ACCOUNTING.subtitle}
            columns={[...PRINT_PREVIEW_ACCOUNTING.columns]}
            rows={[...PRINT_PREVIEW_ACCOUNTING.rows]}
            printSettings={printSettings}
          />
        );
      case 'qualityReport':
        return (
          <QualityReportPrint
            ref={ref}
            title={PRINT_PREVIEW_QUALITY.title}
            subtitle={PRINT_PREVIEW_QUALITY.subtitle}
            workOrderNumber={PRINT_PREVIEW_QUALITY.workOrderNumber}
            summary={PRINT_PREVIEW_QUALITY.summary}
            topDefects={[...PRINT_PREVIEW_QUALITY.topDefects]}
            printSettings={printSettings}
          />
        );
      case 'payslip':
        return <PayslipPrint ref={ref} data={PRINT_PREVIEW_PAYSLIP as any} printSettings={printSettings} />;
      case 'suppliesReceipt':
        return (
          <SuppliesReceiptPrint
            ref={ref}
            order={PRINT_PREVIEW_SUPPLIES_RECEIPT as any}
            printSettings={printSettings}
          />
        );
      case 'repairPayment':
        return (
          <RepairPaymentPrint
            ref={ref}
            authorization={PRINT_PREVIEW_REPAIR_PAYMENT_AUTH as any}
            job={PRINT_PREVIEW_REPAIR_PAYMENT_JOB as any}
            branch={PRINT_PREVIEW_REPAIR_BRANCH as any}
            printSettings={printSettings}
          />
        );
      case 'repairSpareIssue':
        return (
          <RepairSpareIssuePrint
            ref={ref}
            issue={PRINT_PREVIEW_REPAIR_SPARE_ISSUE as any}
            printSettings={printSettings}
          />
        );
      case 'repairSparePartsCount':
        return (
          <SparePartsInventoryCountPrint
            ref={ref}
            rows={PRINT_PREVIEW_SPARE_PARTS_COUNT.rows as any}
            branchName={PRINT_PREVIEW_SPARE_PARTS_COUNT.branchName}
            warehouseName={PRINT_PREVIEW_SPARE_PARTS_COUNT.warehouseName}
            locationByItemId={PRINT_PREVIEW_SPARE_PARTS_COUNT.locationByItemId}
            printSettings={printSettings}
          />
        );
      case 'warehouseStockCount':
        return (
          <WarehouseCountSheetPrint
            ref={ref}
            rows={[...PRINT_PREVIEW_WAREHOUSE_COUNT.rows]}
            warehouseName={PRINT_PREVIEW_WAREHOUSE_COUNT.warehouseName}
            warehouseRoleLabel={PRINT_PREVIEW_WAREHOUSE_COUNT.warehouseRoleLabel}
            scopeLabel="المخزن كله"
            printSettings={printSettings}
          />
        );
      case 'repairTreasuryMonthly':
        return (
          <RepairTreasuryMonthlyPrint
            ref={ref}
            report={PRINT_PREVIEW_REPAIR_TREASURY as any}
            branchLabel={PRINT_PREVIEW_BRANCH_NAME}
            printSettings={printSettings}
          />
        );
      case 'routingExecution':
        return (
          <RoutingExecutionPrint
            ref={ref}
            execution={PRINT_PREVIEW_ROUTING_EXECUTION.execution as any}
            steps={PRINT_PREVIEW_ROUTING_EXECUTION.steps as any}
            productName={PRINT_PREVIEW_ROUTING_EXECUTION.productName}
            supervisorName={PRINT_PREVIEW_ROUTING_EXECUTION.supervisorName}
            printSettings={printSettings}
          />
        );
      case 'productionWorkerReport':
        return (
          <ProductionWorkerReportPrint
            ref={ref}
            title={PRINT_PREVIEW_WORKER_REPORT.title}
            subtitle={PRINT_PREVIEW_WORKER_REPORT.subtitle}
            columns={[...PRINT_PREVIEW_WORKER_REPORT.columns]}
            rows={[...PRINT_PREVIEW_WORKER_REPORT.rows]}
            printSettings={printSettings}
          />
        );
      case 'catalogProductDetail':
        return (
          <CatalogProductDetailPrint
            ref={ref}
            productId={PRINT_PREVIEW_CATALOG_PRODUCT.productId}
            productName={PRINT_PREVIEW_CATALOG_PRODUCT.productName}
            productCode={PRINT_PREVIEW_CATALOG_PRODUCT.productCode}
            category={PRINT_PREVIEW_CATALOG_PRODUCT.category}
            periodLabel={PRINT_PREVIEW_CATALOG_PRODUCT.periodLabel}
            kpis={[...PRINT_PREVIEW_CATALOG_PRODUCT.kpis]}
            rows={[...PRINT_PREVIEW_CATALOG_PRODUCT.rows]}
            printSettings={printSettings}
          />
        );
      case 'missingComponentsReport':
        return (
          <MissingComponentsReportPrint
            ref={ref}
            title={PRINT_PREVIEW_MISSING_COMPONENTS.title}
            subtitle={PRINT_PREVIEW_MISSING_COMPONENTS.subtitle}
            warehouseName={PRINT_PREVIEW_MISSING_COMPONENTS.warehouseName}
            sections={[...PRINT_PREVIEW_MISSING_COMPONENTS.sections] as any}
            printSettings={printSettings}
          />
        );
      case 'supervisorPerformance':
        return (
          <SupervisorPerformancePrint
            ref={ref}
            data={PRINT_PREVIEW_SUPERVISOR_PERFORMANCE as any}
            printSettings={printSettings}
          />
        );
      case 'productBomCountCard':
        return (
          <ProductBomCountCardPrint
            ref={ref}
            cards={[...PRINT_PREVIEW_PRODUCT_BOM_COUNT.cards] as any}
            printSettings={printSettings}
          />
        );
      case 'repairJobReceipt':
        return (
          <RepairJobPrint
            ref={ref}
            job={PRINT_PREVIEW_REPAIR_JOB as any}
            branch={PRINT_PREVIEW_REPAIR_BRANCH as any}
            printSettings={printSettings}
            trackUrl="https://example.com/track/RCP-DEMO-001"
          />
        );
      case 'repairJobCard':
        return (
          <RepairJobProductCardPrint
            ref={ref}
            job={PRINT_PREVIEW_REPAIR_JOB as any}
            branch={PRINT_PREVIEW_REPAIR_BRANCH as any}
            printSettings={printSettings}
            workUrl="https://example.com/repair/jobs/demo"
          />
        );
      case 'repairDeliveryReceipt':
        return (
          <DeliveryReceiptPDF
            ref={ref}
            job={{
              ...(PRINT_PREVIEW_REPAIR_JOB as any),
              status: 'delivered',
              deliveredAt: new Date().toISOString(),
              finalCost: 350,
              paidAmount: 350,
              balanceDue: 0,
              paymentStatus: 'paid',
              deliveryAuthorizationNo: 'DEL-DEMO-001',
            }}
            branch={PRINT_PREVIEW_REPAIR_BRANCH as any}
            printSettings={printSettings}
          />
        );
      case 'productionIssue':
        return (
          <ProductionIssuePrint
            ref={ref}
            order={PRINT_PREVIEW_PRODUCTION_ISSUE as any}
            sourceLabel="WO-DEMO-001"
            printSettings={printSettings}
          />
        );
      case 'departmentConsumableIssue':
        return (
          <DepartmentConsumableIssuePrint
            ref={ref}
            issue={PRINT_PREVIEW_DEPARTMENT_CONSUMABLE_ISSUE as any}
            printSettings={printSettings}
          />
        );
      case 'sparePartsReplenishment':
        return (
          <SparePartsReplenishmentPrint
            ref={ref}
            request={{
              referenceNo: 'SPR-DEMO-001',
              status: 'submitted',
              fromWarehouseId: 'wh-central',
              fromWarehouseName: 'قطع غيار مركزي',
              toWarehouseId: 'wh-center',
              toWarehouseName: 'مركز الصيانة',
              createdBy: 'أحمد',
              createdAt: new Date().toISOString(),
              lines: [
                {
                  lineId: 'm1',
                  itemType: 'material',
                  itemId: 'm1',
                  itemName: 'محرك مروحة',
                  itemCode: 'FAN-01',
                  unit: 'piece',
                  requestedQty: 4,
                  unitCostSnapshot: 120,
                  totalCostSnapshot: 480,
                },
              ],
            } as any}
            printSettings={printSettings}
          />
        );
      case 'itemBarcodeLabel':
        return (
          <ItemBarcodeLabelPrint
            ref={ref}
            labels={PRINT_PREVIEW_ITEM_BARCODE_LABELS}
            printSettings={printSettings}
          />
        );
      case 'locationBarcodeLabel':
        return (
          <LocationBarcodeLabelPrint
            ref={ref}
            labels={PRINT_PREVIEW_LOCATION_BARCODE_LABELS}
            printSettings={printSettings}
          />
        );
      default:
        return <GenericShellPreview ref={ref} docType={docType} printSettings={printSettings} />;
    }
  },
);

PrintEngineDocumentPreview.displayName = 'PrintEngineDocumentPreview';
