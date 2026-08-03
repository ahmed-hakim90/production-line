import type { PlanSettings } from '../../../types';
import { resolvePlanSettings } from '../../system/lib/resolveSystemSettings';
import { systemSettingsService } from '../../system/services/systemSettingsService';

/** Merged plan settings including defaults for code prefixes/padding. */
export async function getMergedPlanSettings(): Promise<PlanSettings> {
  const s = await systemSettingsService.get();
  return resolvePlanSettings(s?.planSettings);
}
