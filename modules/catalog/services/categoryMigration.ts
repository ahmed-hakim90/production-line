import { categoryService } from './categoryService';

/**
 * Idempotent migration that backfills product categories
 * from existing `products.model` values.
 */
export const runCategoryBackfillMigration = async () => {
  return categoryService.seedFromProductsModel();
};
