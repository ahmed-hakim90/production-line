import { doc, getDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import {
  isProductionProduct,
  NON_MANUFACTURED_PRODUCT_PRODUCTION_ERROR,
} from './isProductionProduct';

/** Fail closed when product is missing or marked non-manufactured. */
export async function assertProductionProductId(productId: string): Promise<void> {
  const id = String(productId || '').trim();
  if (!id) {
    throw new Error(NON_MANUFACTURED_PRODUCT_PRODUCTION_ERROR);
  }
  if (!isConfigured) return;
  const snap = await getDoc(doc(db, 'products', id));
  if (!snap.exists()) {
    throw new Error(NON_MANUFACTURED_PRODUCT_PRODUCTION_ERROR);
  }
  if (!isProductionProduct(snap.data() as { isManufactured?: boolean })) {
    throw new Error(NON_MANUFACTURED_PRODUCT_PRODUCTION_ERROR);
  }
}
