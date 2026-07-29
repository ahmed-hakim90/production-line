/**
 * Costs usecases — UI → usecases → services → Firebase.
 */
export {
  createCostCenter,
} from './createCostCenter';

export const COSTS_USECASE_NOTES = {
  flow: 'UI -> usecases -> services -> Firebase',
  nextSlices: ['closeCostPeriod', 'runAssetDepreciation'],
} as const;
