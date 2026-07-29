/**
 * Repair usecases — UI → usecases → services → Firebase.
 */
export {
  createRepairJob,
} from './createRepairJob';

export const REPAIR_USECASE_NOTES = {
  flow: 'UI -> usecases -> services -> Firebase',
  nextSlices: ['updateRepairStatus', 'issueSparePart'],
} as const;
