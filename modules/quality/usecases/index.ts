/**
 * Quality usecases — UI → usecases → services → Firebase.
 */
export {
  createQualityInspection,
  type CreateQualityInspectionInput,
} from './createQualityInspection';

export const QUALITY_USECASE_NOTES = {
  flow: 'UI -> usecases -> services -> Firebase',
  nextSlices: ['approveInspection', 'createReworkOrder'],
} as const;
