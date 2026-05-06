import type { PlanSettings } from '../../../types';
import { DEFAULT_PLAN_SETTINGS } from '../../../utils/dashboardConfig';
import { systemSettingsService } from '../../system/services/systemSettingsService';

/** Merged plan settings including defaults for code prefixes/padding. */
export async function getMergedPlanSettings(): Promise<PlanSettings> {
  const s = await systemSettingsService.get();
  return { ...DEFAULT_PLAN_SETTINGS, ...(s?.planSettings ?? {}) };
}
