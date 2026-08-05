import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { sparePartsService } from '../../repair/services/sparePartsService';
import type { RepairSparePart } from '../../repair/types';
import type { StockCountSheetCreateCandidate } from './stockCountSheet';

const BALANCES_COLLECTION = 'stock_items';
const nowIso = () => new Date().toISOString();

const balanceDocId = (warehouseId: string, itemType: string, itemId: string) =>
  `${warehouseId}__${itemType}__${itemId}`;

const nextSparePartCode = (parts: RepairSparePart[]) => {
  const maxSerial = parts.reduce((max, part) => {
    const match = String(part.code || '').trim().toUpperCase().match(/^SP-(\d{3})$/);
    if (!match) return max;
    const current = Number(match[1] || 0);
    return Number.isFinite(current) ? Math.max(max, current) : max;
  }, 0);
  return `SP-${String(maxSerial + 1).padStart(3, '0')}`;
};

/**
 * Before creating a stock-count session for a maintenance center, seed missing
 * branch spare-part catalog rows and zero `stock_items` balances so the CF
 * count session can include them (expectedQty = 0).
 */
export async function ensureCenterItemsForStockCount(input: {
  warehouseId: string;
  warehouseName: string;
  branchId: string;
  candidates: StockCountSheetCreateCandidate[];
  existingParts: RepairSparePart[];
  createdBy: string;
  canManageParts: boolean;
}): Promise<{ createdParts: number; createdBalances: number; parts: RepairSparePart[] }> {
  if (!isConfigured) {
    throw new Error('Firebase غير مهيأ.');
  }
  const warehouseId = String(input.warehouseId || '').trim();
  const branchId = String(input.branchId || '').trim();
  if (!warehouseId || !branchId) {
    throw new Error('بيانات المخزن/الفرع غير مكتملة لإضافة الأصناف.');
  }
  if (!input.candidates.length) {
    return { createdParts: 0, createdBalances: 0, parts: input.existingParts };
  }

  const needsParts = input.candidates.some((row) => row.needsSparePart);
  if (needsParts && !input.canManageParts) {
    throw new Error('إضافة أصناف جديدة للمركز تتطلب صلاحية إدارة قطع الغيار.');
  }

  const tenantId = getCurrentTenantId();
  const parts = [...input.existingParts];
  let createdParts = 0;
  let createdBalances = 0;

  for (const candidate of input.candidates) {
    let part = parts.find((row) => {
      const linked = String(row.materialId || row.rawMaterialId || '').trim();
      return linked === candidate.materialId;
    });

    if (!part && candidate.needsSparePart) {
      const code = nextSparePartCode(parts);
      const unitLabel = candidate.unit === 'piece' ? 'قطعة' : (candidate.unit || 'قطعة');
      const partId = await sparePartsService.createPart({
        branchId,
        name: candidate.materialName,
        code,
        category: candidate.categoryName,
        unit: unitLabel,
        minStock: candidate.minStock,
        materialId: candidate.materialId,
      });
      if (!partId) throw new Error(`تعذر إضافة الصنف ${candidate.materialName} لكتالوج المركز.`);
      part = {
        id: partId,
        tenantId,
        branchId,
        name: candidate.materialName,
        code,
        category: candidate.categoryName,
        unit: unitLabel,
        minStock: candidate.minStock,
        materialId: candidate.materialId,
        createdAt: nowIso(),
      };
      parts.push(part);
      createdParts += 1;

      // Ensure warehouse-scoped repair ledger row exists (createPart seeds legacy branch-only stock).
      await sparePartsService.adjustStock({
        branchId,
        warehouseId,
        warehouseName: input.warehouseName,
        partId,
        partName: candidate.materialName,
        quantity: 0,
        type: 'IN',
        createdBy: input.createdBy,
        notes: 'تهيئة رصيد مركز من جرد Excel',
      });
    }

    if (candidate.needsStockBalance) {
      const balRef = doc(
        db,
        BALANCES_COLLECTION,
        balanceDocId(warehouseId, candidate.itemType, candidate.materialId),
      );
      const snap = await getDoc(balRef);
      if (!snap.exists()) {
        await setDoc(balRef, {
          tenantId,
          warehouseId,
          itemType: candidate.itemType,
          itemId: candidate.materialId,
          itemName: candidate.materialName,
          itemCode: candidate.materialCode,
          unit: candidate.unit,
          quantity: 0,
          minStock: candidate.minStock,
          updatedAt: nowIso(),
        });
        createdBalances += 1;
      }
    }
  }

  return { createdParts, createdBalances, parts };
}
