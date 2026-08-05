import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import type { StockCountSheetCreateCandidate } from './stockCountSheet';

const BALANCES_COLLECTION = 'stock_items';
const nowIso = () => new Date().toISOString();

const balanceDocId = (warehouseId: string, itemType: string, itemId: string) =>
  `${warehouseId}__${itemType}__${itemId}`;

/**
 * Seed missing zero `stock_items` rows from materials master so a stock-count
 * session can include opening lines (expectedQty = 0). Used for central spare
 * parts warehouse — does not create repair_spare_parts catalog rows.
 */
export async function ensureCatalogBalancesForStockCount(input: {
  warehouseId: string;
  candidates: StockCountSheetCreateCandidate[];
}): Promise<{ createdBalances: number }> {
  if (!isConfigured) {
    throw new Error('Firebase غير مهيأ.');
  }
  const warehouseId = String(input.warehouseId || '').trim();
  if (!warehouseId) {
    throw new Error('بيانات المخزن غير مكتملة لإضافة الأصناف.');
  }
  if (!input.candidates.length) {
    return { createdBalances: 0 };
  }

  const tenantId = getCurrentTenantId();
  let createdBalances = 0;

  for (const candidate of input.candidates) {
    if (!candidate.needsStockBalance) continue;
    const materialId = String(candidate.materialId || '').trim();
    if (!materialId) continue;

    const balRef = doc(
      db,
      BALANCES_COLLECTION,
      balanceDocId(warehouseId, candidate.itemType, materialId),
    );
    const snap = await getDoc(balRef);
    if (snap.exists()) continue;

    await setDoc(balRef, {
      tenantId,
      warehouseId,
      itemType: candidate.itemType,
      itemId: materialId,
      itemName: candidate.materialName,
      itemCode: candidate.materialCode,
      unit: candidate.unit,
      quantity: 0,
      minStock: candidate.minStock,
      updatedAt: nowIso(),
    });
    createdBalances += 1;
  }

  return { createdBalances };
}
