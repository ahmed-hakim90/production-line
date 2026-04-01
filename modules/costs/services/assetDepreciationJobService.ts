import type { AssetDepreciationRunResult } from '../../../types';
import { runAssetDepreciationCallable } from '../../auth/services/firebase';

export const assetDepreciationJobService = {
  async runForPeriod(periodInput?: string): Promise<AssetDepreciationRunResult> {
    // Server-authoritative write path: all depreciation writes happen in Cloud Functions.
    return runAssetDepreciationCallable(periodInput ? { period: periodInput } : undefined);
  },
};
