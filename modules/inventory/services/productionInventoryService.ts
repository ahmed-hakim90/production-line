import type {
  FirestoreProduct,
  ProductionReport,
  ReportComponentScrapItem,
  SystemSettings,
} from '../../../types';
import { getReportWaste } from '../../../utils/calculations';
import { aggregateExplodedLeaves, explodeBom } from '../../manufacturing/engines/bomExplosionEngine';
import {
  buildExplosionContext,
  loadManufacturingBundle,
  preloadOwnersForExplosion,
  resolveLegacyMaterialId,
} from '../../manufacturing/services/manufacturingContextService';
import { bomService } from '../../manufacturing/services/bomService';
import { materialService } from '../../manufacturing/services/materialService';
import type { Material } from '../../manufacturing/types';
import { resolveReportType } from '../../production/utils/reportTypes';
import { resolveRequiresProductionIssueOnReport } from '../../production/lib/requiresProductionIssue';
import { httpsCallable } from 'firebase/functions';
import { functionsClient, isConfigured } from '../../auth/services/firebase';
import { rawMaterialService } from './rawMaterialService';
import { stockService as baseStockService } from './stockService';
import { transferApprovalService as baseTransferApprovalService } from './transferApprovalService';
import { productionIssueService } from './productionIssueService';
import { productionPlanService } from '../../production/services/productionPlanService';
import { workOrderService } from '../../production/services/workOrderService';
import type {
  CreateStockMovementInput,
  InventoryItemType,
  ResolvedInventoryRouting,
  TransferRequestLine,
} from '../types';
import {
  assertRoutingConfigured,
  pickConsumptionWarehouse,
  resolveInventoryRoutingV1Async,
} from './inventoryRoutingService';
import { aggregatePackagingQuantities } from '../lib/productionInventoryLib';

const stockService = {
  ...baseStockService,
  createMovement: (input: CreateStockMovementInput) =>
    baseStockService.createMovement(input, { internal: true }),
};
const transferApprovalService = {
  ...baseTransferApprovalService,
  createRequest: (input: Parameters<typeof baseTransferApprovalService.createRequest>[0]) =>
    baseTransferApprovalService.createRequest(input, { internal: true }),
};

function callableUserError(error: unknown, fallback: string): Error {
  const message = String((error as { message?: string })?.message || '').trim();
  if (message.includes('permission-denied') || message.includes('Permission')) {
    return new Error('لا تملك صلاحية تنفيذ هذه العملية.');
  }
  if (message.includes('unauthenticated')) {
    return new Error('يجب تسجيل الدخول أولاً.');
  }
  const cleaned = message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, '').trim();
  return new Error(cleaned || fallback);
}

export type ProductionInventoryActor = {
  name: string;
  userId?: string;
};

export type ApplyProductionReportInventoryInput = {
  reportId: string;
  report: ProductionReport;
  systemSettings: SystemSettings;
  actor: ProductionInventoryActor;
  products: FirestoreProduct[];
  componentScrapItems?: ReportComponentScrapItem[];
};

type StockLineIdentity = {
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  minStock?: number;
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function useMaterialItemType(settings: SystemSettings): boolean {
  return Boolean(settings.planSettings?.manufacturingMigratedAt?.trim());
}

async function resolveStockLineForMaterial(
  materialId: string,
  materialName: string,
  settings: SystemSettings,
  bundle: Awaited<ReturnType<typeof loadManufacturingBundle>>,
): Promise<StockLineIdentity | null> {
  const resolvedId = await resolveLegacyMaterialId(materialId, materialName, bundle);
  if (!resolvedId) return null;
  const material = bundle.materialsById.get(resolvedId);
  if (material) {
    const itemType: InventoryItemType = useMaterialItemType(settings) ? 'material' : 'raw_material';
    const itemId = useMaterialItemType(settings)
      ? material.id!
      : (material.legacyRawMaterialId || material.id!);
    return {
      itemType,
      itemId,
      itemName: material.name,
      itemCode: material.code,
      unit: material.baseUnit || 'unit',
      minStock: material.minStock,
    };
  }
  const raw = (await rawMaterialService.getAll()).find(
    (r) => r.id === materialId || r.id === resolvedId,
  );
  if (!raw?.id) return null;
  return {
    itemType: 'raw_material',
    itemId: raw.id,
    itemName: raw.name,
    itemCode: raw.code,
    unit: raw.unit || 'unit',
    minStock: raw.minStock,
  };
}

async function consumeMaterialsForProduction(params: {
  productId: string;
  quantity: number;
  reportId: string;
  routing: ResolvedInventoryRouting;
  settings: SystemSettings;
  actor: ProductionInventoryActor;
}): Promise<void> {
  const { productId, quantity, reportId, routing, settings, actor } = params;
  if (quantity <= 0) return;
  if (
    !routing.productionFloorWarehouseId
    && !routing.decomposedWarehouseId
    && !routing.rawMaterialWarehouseId
  ) {
    return;
  }

  const bundle = await loadManufacturingBundle();
  await preloadOwnersForExplosion([{ ownerType: 'product', ownerId: productId }], bundle);
  const { ctx } = await buildExplosionContext(bundle);
  const { bom, items, isLegacy } = await bomService.getActiveBomWithLegacyFallback('product', productId);

  const leaves: Array<{ materialId: string; requiredQty: number }> = [];

  if (!isLegacy && bom?.id && items.length > 0) {
    const exploded = explodeBom(ctx, 'product', productId, quantity);
    const aggregated = aggregateExplodedLeaves(exploded);
    for (const [, line] of aggregated) {
      leaves.push({ materialId: line.materialId, requiredQty: line.requiredQty });
    }
  } else if (items.length > 0) {
    // Flat / legacy BOM lines already resolved by bomService (no second product_materials read)
    const rawMaterials = await rawMaterialService.getAll();
    const rawById = new Map(rawMaterials.filter((r) => r.id).map((r) => [String(r.id), r]));
    const rawByName = new Map(rawMaterials.map((r) => [normalizeText(r.name), r]));
    for (const item of items) {
      const materialId = String(item.itemId || '').trim();
      const qty = Number(item.qtyPerUnit || 0) * quantity;
      if (qty <= 0) continue;

      if (materialId && bundle.materialsById.has(materialId)) {
        leaves.push({ materialId, requiredQty: qty });
        continue;
      }

      const raw =
        (materialId ? rawById.get(materialId) : undefined)
        ?? rawByName.get(normalizeText(item.itemName || ''));
      if (!raw?.id) continue;
      await stockService.createMovement({
        warehouseId:
          routing.productionFloorWarehouseId
          || routing.decomposedWarehouseId
          || routing.rawMaterialWarehouseId,
        itemType: 'raw_material',
        itemId: raw.id,
        itemName: raw.name,
        itemCode: raw.code,
        unit: raw.unit,
        movementType: 'OUT',
        quantity: qty,
        sourceModule: 'production_report',
        sourceId: reportId,
        note: `Material consumption from production report ${reportId}`,
        createdBy: actor.name,
        allowNegative: routing.allowNegativeDecomposedStock,
      });
    }
    // Continue below for any manufacturing-material leaves collected above
  }

  for (const leaf of leaves) {
    const material = bundle.materialsById.get(leaf.materialId);
    const line = await resolveStockLineForMaterial(
      leaf.materialId,
      material?.name ?? '',
      settings,
      bundle,
    );
    if (!line) continue;
    const warehouseId = pickConsumptionWarehouse(material ?? null, routing);
    if (!warehouseId) continue;
    await stockService.createMovement({
      warehouseId,
      itemType: line.itemType,
      itemId: line.itemId,
      itemName: line.itemName,
      itemCode: line.itemCode,
      unit: line.unit,
      movementType: 'OUT',
      quantity: leaf.requiredQty,
      minStock: line.minStock,
      sourceModule: 'production_report',
      sourceId: reportId,
      note: `BOM consumption from production report ${reportId}`,
      createdBy: actor.name,
      allowNegative: routing.allowNegativeDecomposedStock,
    });
  }
}

async function postProducedToWip(params: {
  routing: ResolvedInventoryRouting;
  line: StockLineIdentity;
  quantity: number;
  reportId: string;
  actor: ProductionInventoryActor;
  note: string;
  /** When true, always post IN immediately (V2 handover path). */
  forceImmediate?: boolean;
}): Promise<void> {
  const { routing, line, quantity, reportId, actor, note, forceImmediate } = params;
  if (!routing.productionWipWarehouseId || quantity <= 0) return;

  const requestLine: TransferRequestLine = {
    itemType: line.itemType,
    itemId: line.itemId,
    itemName: line.itemName,
    itemCode: line.itemCode,
    quantity,
    reportedQuantity: quantity,
    receivedQuantity: 0,
    unit: line.unit,
    minStock: line.minStock,
  };

  if (!forceImmediate && routing.requireApprovalForProductionEntry) {
    await transferApprovalService.createRequest({
      requestType: 'production_entry',
      fromWarehouseId: '__production_report__',
      fromWarehouseName: 'تقارير الإنتاج',
      toWarehouseId: routing.productionWipWarehouseId,
      note,
      sourceModule: 'production_report',
      sourceId: reportId,
      sourceReportId: reportId,
      lines: [requestLine],
      createdBy: actor.name,
      createdByUserId: actor.userId,
    });
    return;
  }

  await stockService.createMovement({
    warehouseId: routing.productionWipWarehouseId,
    itemType: line.itemType,
    itemId: line.itemId,
    itemName: line.itemName,
    itemCode: line.itemCode,
    unit: line.unit,
    movementType: 'IN',
    quantity,
    minStock: line.minStock,
    sourceModule: 'production_report',
    sourceId: reportId,
    note,
    createdBy: actor.name,
  });
}

async function postProductionHandoverRequest(params: {
  routing: ResolvedInventoryRouting;
  line: StockLineIdentity;
  quantity: number;
  reportId: string;
  actor: ProductionInventoryActor;
}): Promise<void> {
  const { routing, line, quantity, reportId, actor } = params;
  if (!routing.productionWipWarehouseId || !routing.finishedStagingWarehouseId || quantity <= 0) {
    return;
  }
  if (routing.productionWipWarehouseId === routing.finishedStagingWarehouseId) {
    throw new Error('مخزن تحت التسليم وبانتظار التغليف يجب أن يكونا مختلفين.');
  }

  await transferApprovalService.createRequest({
    requestType: 'production_handover',
    fromWarehouseId: routing.productionWipWarehouseId,
    toWarehouseId: routing.finishedStagingWarehouseId,
    note: `استلام تغليف لتقرير الإنتاج ${reportId}`,
    sourceModule: 'production_report',
    sourceId: reportId,
    sourceReportId: reportId,
    lines: [{
      itemType: line.itemType,
      itemId: line.itemId,
      itemName: line.itemName,
      itemCode: line.itemCode,
      quantity,
      reportedQuantity: quantity,
      receivedQuantity: 0,
      unit: line.unit,
      minStock: line.minStock,
    }],
    createdBy: actor.name,
    createdByUserId: actor.userId,
  });
}

async function postAutoTransfer(params: {
  requestType: 'production_auto_transfer' | 'finished_to_final' | 'packaging_transfer';
  fromWarehouseId: string;
  toWarehouseId: string;
  lines: TransferRequestLine[];
  reportId: string;
  actor: ProductionInventoryActor;
  routing: ResolvedInventoryRouting;
  note: string;
  sourceModule: CreateStockMovementInput['sourceModule'];
  allowNegative?: boolean;
}): Promise<void> {
  const {
    requestType,
    fromWarehouseId,
    toWarehouseId,
    lines,
    reportId,
    actor,
    routing,
    note,
    sourceModule,
    allowNegative,
  } = params;
  if (!fromWarehouseId || !toWarehouseId || !lines.length) return;

  const needsApproval =
    requestType === 'packaging_transfer'
      ? false
      : // Defer WIP→تم الإنتاج until production_entry is approved (WIP may still be empty).
        requestType === 'production_auto_transfer' && routing.requireApprovalForProductionEntry
        ? true
        : routing.requireApprovalForAutoTransfers;

  if (needsApproval) {
    await transferApprovalService.createRequest({
      requestType,
      fromWarehouseId,
      toWarehouseId,
      note,
      sourceModule,
      sourceId: reportId,
      sourceReportId: reportId,
      lines,
      createdBy: actor.name,
      createdByUserId: actor.userId,
    });
    return;
  }

  for (const line of lines) {
    await stockService.createMovement({
      warehouseId: fromWarehouseId,
      toWarehouseId,
      itemType: line.itemType,
      itemId: line.itemId,
      itemName: line.itemName,
      itemCode: line.itemCode,
      unit: line.unit,
      movementType: 'TRANSFER',
      quantity: line.quantity,
      minStock: line.minStock,
      sourceModule,
      sourceId: reportId,
      note,
      createdBy: actor.name,
      allowNegative,
    });
  }
}

async function postComponentScrapMovements(params: {
  reportId: string;
  routing: ResolvedInventoryRouting;
  actor: ProductionInventoryActor;
  scrapItems: ReportComponentScrapItem[];
  producedLine?: StockLineIdentity;
  isComponentInjection: boolean;
  deductFromDecomposed?: boolean;
  settings?: SystemSettings;
}): Promise<void> {
  const {
    reportId,
    routing,
    actor,
    scrapItems,
    producedLine,
    isComponentInjection,
    deductFromDecomposed,
    settings,
  } = params;
  if (!scrapItems.length || !routing.wasteWarehouseId) return;

  const bundle = settings ? await loadManufacturingBundle() : null;
  const rawMaterials = await rawMaterialService.getAll();
  const rawById = new Map(rawMaterials.filter((r) => r.id).map((r) => [String(r.id), r]));

  for (const scrap of scrapItems) {
    const qty = Number(scrap.quantity || 0);
    if (qty <= 0) continue;

    let line: StockLineIdentity | null = null;
    if (settings && bundle) {
      line = await resolveStockLineForMaterial(
        scrap.materialId,
        scrap.materialName || '',
        settings,
        bundle,
      );
    }
    if (!line) {
      const raw = rawById.get(String(scrap.materialId || '').trim());
      if (raw?.id) {
        line = {
          itemType: 'raw_material',
          itemId: raw.id,
          itemName: raw.name,
          itemCode: raw.code,
          unit: raw.unit || 'unit',
          minStock: raw.minStock,
        };
      }
    }

    if (line) {
      if (deductFromDecomposed && routing.decomposedWarehouseId) {
        await stockService.createMovement({
          warehouseId: routing.decomposedWarehouseId,
          itemType: line.itemType,
          itemId: line.itemId,
          itemName: line.itemName,
          itemCode: line.itemCode,
          unit: line.unit,
          movementType: 'OUT',
          quantity: qty,
          sourceModule: 'production_report',
          sourceId: reportId,
          note: `Component scrap OUT from production report ${reportId}`,
          createdBy: actor.name,
          allowNegative: routing.allowNegativeDecomposedStock,
        });
      }
      await stockService.createMovement({
        warehouseId: routing.wasteWarehouseId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        itemCode: line.itemCode,
        unit: line.unit,
        movementType: 'IN',
        quantity: qty,
        sourceModule: 'production_report',
        sourceId: reportId,
        note: `Component scrap IN from production report ${reportId}`,
        createdBy: actor.name,
      });
      continue;
    }

    if (isComponentInjection && producedLine && routing.productionWipWarehouseId) {
      await stockService.createMovement({
        warehouseId: routing.productionWipWarehouseId,
        itemType: producedLine.itemType,
        itemId: producedLine.itemId,
        itemName: producedLine.itemName,
        itemCode: producedLine.itemCode,
        unit: producedLine.unit,
        movementType: 'OUT',
        quantity: qty,
        sourceModule: 'production_report',
        sourceId: reportId,
        note: `Component scrap OUT from production report ${reportId}`,
        createdBy: actor.name,
      });
      if (routing.wasteWarehouseId) {
        await stockService.createMovement({
          warehouseId: routing.wasteWarehouseId,
          itemType: producedLine.itemType,
          itemId: producedLine.itemId,
          itemName: producedLine.itemName,
          itemCode: producedLine.itemCode,
          unit: producedLine.unit,
          movementType: 'IN',
          quantity: qty,
          sourceModule: 'production_report',
          sourceId: reportId,
          note: `Component scrap IN from production report ${reportId}`,
          createdBy: actor.name,
        });
      }
    }
  }
}

export const productionInventoryService = {
  async applyProductionReportInventory(input: ApplyProductionReportInventoryInput): Promise<void> {
    const reportType = resolveReportType(input.report.reportType);

    // V2 finished-product posting is server-authoritative.
    if (reportType === 'finished_product') {
      if (!isConfigured || !functionsClient) {
        throw new Error('النظام غير مهيأ أو لم تُنشر دوال الخادم.');
      }
      const callable = httpsCallable<{ reportId: string }, { ok: boolean; idempotent?: boolean }>(
        functionsClient,
        'applyProductionReportInventory',
      );
      try {
        await callable({ reportId: input.reportId });
      } catch (error: unknown) {
        throw callableUserError(error, 'تعذر ترحيل مخزون تقرير الإنتاج.');
      }
      return;
    }

    const routing = await resolveInventoryRoutingV1Async(input.systemSettings);
    const { reportId, report, actor, products, componentScrapItems = [] } = input;
    const producedQty = Number(report.quantityProduced || 0);

    if (reportType === 'packaging') {
      await productionInventoryService.applyPackagingReportInventory({
        reportId,
        report,
        routing,
        actor,
        products,
      });
      return;
    }

    if (reportType === 'component_waste') {
      assertRoutingConfigured(routing, ['decomposed', 'waste']);
      await postComponentScrapMovements({
        reportId,
        routing,
        actor,
        scrapItems: componentScrapItems.length
          ? componentScrapItems
          : (report.componentScrapItems || []),
        isComponentInjection: false,
        deductFromDecomposed: true,
        settings: input.systemSettings,
      });
      return;
    }

    const isComponentInjection = reportType === 'component_injection';
    let producedLine: StockLineIdentity | null = null;

    if (isComponentInjection) {
      const bundle = await loadManufacturingBundle();
      const material = bundle.materialsById.get(String(report.productId));
      if (material?.id) {
        producedLine = await resolveStockLineForMaterial(
          material.id,
          material.name,
          input.systemSettings,
          bundle,
        );
      } else {
        const rawMaterials = await rawMaterialService.getAll();
        const raw = rawMaterials.find((r) => String(r.id) === String(report.productId));
        if (raw?.id) {
          producedLine = {
            itemType: 'raw_material',
            itemId: raw.id,
            itemName: raw.name,
            itemCode: raw.code,
            unit: raw.unit,
          };
        }
      }
    } else {
      const product = products.find((p) => String(p.id) === String(report.productId));
      if (product?.id) {
        producedLine = {
          itemType: 'finished_good',
          itemId: product.id,
          itemName: product.name,
          itemCode: product.code,
          unit: 'piece',
          minStock: Number((product as { minStock?: number }).minStock ?? 0),
        };
      }
    }

    const hasIssuedProductionComponents = await productionIssueService.hasIssuedForProduction({
      productionReportId: reportId,
      workOrderId: report.workOrderId,
      productionPlanId: report.productionPlanId,
    });

    if (!isComponentInjection && producedQty > 0) {
      const linkedWorkOrder = report.workOrderId
        ? await workOrderService.getById(report.workOrderId).catch(() => null)
        : null;
      const linkedPlanId = report.productionPlanId || linkedWorkOrder?.planId || undefined;
      const linkedPlan = linkedPlanId
        ? await productionPlanService.getById(linkedPlanId).catch(() => null)
        : null;
      const requiresIssue = resolveRequiresProductionIssueOnReport({
        companyRequire: routing.requireIssuedProductionIssueOnReport,
        workOrderRequiresProductionIssue: linkedWorkOrder?.requiresProductionIssue,
        planRequiresProductionIssue: linkedPlan?.requiresProductionIssue,
      });
      if (requiresIssue && !hasIssuedProductionComponents) {
        throw new Error(
          'لا يمكن ترحيل مخزون تقرير الإنتاج قبل اعتماد وإصدار إذن صرف إنتاج لأمر الشغل/الخطة. التقرير لا ينفّذ صرفاً تلقائياً — استخدم صفحة «صرف إنتاج» ثم أعد الترحيل.',
        );
      }
      // V2: always consume BOM from production floor when an issued issue exists.
      if (hasIssuedProductionComponents && routing.productionFloorWarehouseId) {
        assertRoutingConfigured(routing, ['floor']);
        await consumeMaterialsForProduction({
          productId: report.productId,
          quantity: producedQty,
          reportId,
          routing,
          settings: input.systemSettings,
          actor,
        });
      } else if (
        !hasIssuedProductionComponents
        && !routing.requireIssuedProductionIssueOnReport
        && routing.autoConsumeBomOnProductionReport
      ) {
        await consumeMaterialsForProduction({
          productId: report.productId,
          quantity: producedQty,
          reportId,
          routing,
          settings: input.systemSettings,
          actor,
        });
      }
    }

    if (producedLine && producedQty > 0) {
      assertRoutingConfigured(routing, ['wip']);
      const useHandover = routing.requirePackagingHandoverReceipt !== false
        && Boolean(routing.finishedStagingWarehouseId)
        && routing.finishedStagingWarehouseId !== routing.productionWipWarehouseId;

      await postProducedToWip({
        routing,
        line: producedLine,
        quantity: producedQty,
        reportId,
        actor,
        forceImmediate: useHandover,
        note: isComponentInjection
          ? `Production WIP entry (component) from report ${reportId}`
          : `Production WIP entry from report ${reportId}`,
      });

      if (useHandover && !isComponentInjection) {
        await postProductionHandoverRequest({
          routing,
          line: producedLine,
          quantity: producedQty,
          reportId,
          actor,
        });
      } else if (routing.autoTransferProductionToFinished && routing.finishedStagingWarehouseId) {
        const transferLine: TransferRequestLine = { ...producedLine, quantity: producedQty };
        await postAutoTransfer({
          requestType: 'production_auto_transfer',
          fromWarehouseId: routing.productionWipWarehouseId,
          toWarehouseId: routing.finishedStagingWarehouseId,
          lines: [transferLine],
          reportId,
          actor,
          routing,
          note: `Auto transfer WIP to finished staging from report ${reportId}`,
          sourceModule: 'production_report',
          allowNegative: routing.allowNegativeFinishedTransferStock,
        });
      }

      if (
        routing.autoTransferFinishedToFinal
        && routing.finalProductWarehouseId
        && routing.finishedStagingWarehouseId
        && !useHandover
      ) {
        const stagingId = routing.autoTransferProductionToFinished
          ? routing.finishedStagingWarehouseId
          : routing.productionWipWarehouseId;
        const transferLine: TransferRequestLine = { ...producedLine, quantity: producedQty };
        await postAutoTransfer({
          requestType: 'finished_to_final',
          fromWarehouseId: stagingId,
          toWarehouseId: routing.finalProductWarehouseId,
          lines: [transferLine],
          reportId,
          actor,
          routing,
          note: `Auto transfer finished to final product from report ${reportId}`,
          sourceModule: 'production_report',
          allowNegative: routing.allowNegativeFinishedTransferStock,
        });
      }
    }

    const product = products.find((p) => String(p.id) === String(report.productId));
    const scrapList = componentScrapItems.length
      ? componentScrapItems
      : (report.componentScrapItems || []);

    if (!isComponentInjection && scrapList.length > 0) {
      await postComponentScrapMovements({
        reportId,
        routing,
        actor,
        scrapItems: scrapList,
        isComponentInjection: false,
        deductFromDecomposed: product?.autoDeductComponentScrapFromDecomposed === true,
        settings: input.systemSettings,
      });
    } else if (isComponentInjection && scrapList.length > 0 && producedLine) {
      await postComponentScrapMovements({
        reportId,
        routing,
        actor,
        scrapItems: scrapList,
        producedLine,
        isComponentInjection: true,
        settings: input.systemSettings,
      });
    } else {
      const wasteQty = getReportWaste({ componentScrapItems: scrapList });
      if (wasteQty > 0 && routing.wasteWarehouseId && producedLine) {
        await stockService.createMovement({
          warehouseId: routing.wasteWarehouseId,
          itemType: producedLine.itemType,
          itemId: producedLine.itemId,
          itemName: producedLine.itemName,
          itemCode: producedLine.itemCode,
          unit: producedLine.unit,
          movementType: 'IN',
          quantity: wasteQty,
          sourceModule: 'production_report',
          sourceId: reportId,
          note: `Production waste from report ${reportId}`,
          createdBy: actor.name,
        });
      }
    }
  },

  async applyPackagingReportInventory(params: {
    reportId: string;
    report: ProductionReport;
    routing: ResolvedInventoryRouting;
    actor: ProductionInventoryActor;
    products: FirestoreProduct[];
  }): Promise<void> {
    const { reportId, report, routing, actor, products } = params;
    if (!routing.enablePackagingStockTransfer) return;
    const sourceId = routing.packagingSourceWarehouseId;
    const targetId = routing.packagingTargetWarehouseId;
    if (!sourceId || !targetId) return;

    const qtyByProduct = aggregatePackagingQuantities({
      packagingLines: report.packagingLines,
      productId: report.productId,
      quantityProduced: report.quantityProduced,
    });

    const lines: TransferRequestLine[] = Array.from(qtyByProduct.entries()).map(([productId, quantity]) => {
      const product = products.find((p) => String(p.id || '') === productId);
      return {
        itemType: 'finished_good' as const,
        itemId: productId,
        itemName: String(product?.name || productId),
        itemCode: String(product?.code || ''),
        quantity,
        unit: 'piece',
        minStock: Number((product as { minStock?: number })?.minStock ?? 0),
      };
    });

    if (!lines.length) return;

    if (routing.requireApprovalForAutoTransfers) {
      await transferApprovalService.createRequest({
        requestType: 'packaging_transfer',
        fromWarehouseId: sourceId,
        toWarehouseId: targetId,
        note: `Packaging transfer from report ${reportId}`,
        sourceModule: 'packaging',
        sourceId: reportId,
        sourceReportId: reportId,
        lines,
        createdBy: actor.name,
        createdByUserId: actor.userId,
      });
      return;
    }

    for (const line of lines) {
      await stockService.createMovement({
        warehouseId: sourceId,
        toWarehouseId: targetId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        itemCode: line.itemCode,
        unit: line.unit,
        movementType: 'TRANSFER',
        quantity: line.quantity,
        minStock: line.minStock,
        sourceModule: 'packaging',
        sourceId: reportId,
        note: `Packaging stock transfer from report ${reportId}`,
        createdBy: actor.name,
        allowNegative: routing.allowNegativeFinishedTransferStock,
      });
    }
  },

  async reverseProductionReportInventory(reportId: string): Promise<void> {
    if (!reportId.trim()) return;
    if (!isConfigured || !functionsClient) {
      throw new Error('النظام غير مهيأ أو لم تُنشر دوال الخادم.');
    }
    const callable = httpsCallable<{ reportId: string }, { ok: boolean }>(
      functionsClient,
      'reverseProductionReportInventory',
    );
    try {
      await callable({ reportId: reportId.trim() });
    } catch (error: unknown) {
      throw callableUserError(error, 'تعذر عكس مخزون تقرير الإنتاج.');
    }
  },
};
