import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantIdOrNull } from '../../../lib/currentTenant';
import { BOMS_COLLECTION } from '../../manufacturing/collections';
import { productMaterialService } from '../../production/services/productMaterialService';

/**
 * Product IDs that have an active BOM and/or legacy product_materials rows.
 * Two tenant-scoped queries — avoids N+1 per product on the catalog home board.
 */
export async function loadProductIdsWithBomCoverage(): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!isConfigured) return ids;
  const tenantId = getCurrentTenantIdOrNull();
  if (!tenantId) return ids;

  try {
    const bomSnap = await getDocs(
      query(
        collection(db, BOMS_COLLECTION),
        where('tenantId', '==', tenantId),
        where('ownerType', '==', 'product'),
        where('status', '==', 'active'),
      ),
    );
    for (const docSnap of bomSnap.docs) {
      const ownerId = String(docSnap.data()?.ownerId || '').trim();
      if (ownerId) ids.add(ownerId);
    }
  } catch (error) {
    console.error('loadProductIdsWithBomCoverage: boms query failed', error);
  }

  try {
    const legacy = await productMaterialService.getAll();
    for (const row of legacy) {
      const productId = String(row.productId || '').trim();
      if (productId) ids.add(productId);
    }
  } catch (error) {
    console.error('loadProductIdsWithBomCoverage: product_materials failed', error);
  }

  return ids;
}
