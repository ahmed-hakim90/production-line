import type { QualityStatus } from '@/types';
import { workOrderMayCloseFromQuality } from '../domain/release';
import { qualityPalletService } from './qualityPalletService';
import { qualitySettingsService } from './qualitySettingsService';

export const qualityReleaseService = {
  async workOrderMayClose(workOrderId: string, legacyStatus?: QualityStatus): Promise<boolean> {
    let policies;
    try {
      policies = await qualitySettingsService.getPolicies();
    } catch {
      return false;
    }
    if (!policies.closeRequiresQualityApproval) return true;
    try {
      const linkedPallets = await qualityPalletService.listByWorkOrder(workOrderId);
      return workOrderMayCloseFromQuality({ legacyStatus, linkedPallets });
    } catch {
      return false;
    }
  },
};
