/**
 * Manufacturing usecases — UI → usecases → engines/services → Firebase.
 */
export {
  createMaterial,
} from './createMaterial';

export const MANUFACTURING_USECASE_NOTES = {
  flow: 'UI -> usecases -> engines/services -> Firebase',
  nextSlices: ['generateMaterialRequirements', 'upsertBom'],
} as const;
