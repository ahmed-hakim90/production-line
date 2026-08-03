/**
 * HR usecases — UI → usecases → services/engines → Firebase.
 */
export {
  createLeaveRequest,
} from './createLeaveRequest';

export {
  createDepartment,
  updateDepartment,
  createJobPosition,
  updateJobPosition,
  createShift,
  updateShift,
  savePenaltyRule,
  saveLateRule,
  saveAllowanceType,
  deleteOrganizationEntity,
} from './manageOrganization';

export {
  confirmPayrollDisbursement,
  recordPayrollDistribution,
} from './payrollAccounts';

export const HR_USECASE_NOTES = {
  flow: 'UI -> usecases -> services/engines -> Firebase',
  nextSlices: ['approveLeave', 'generatePayroll'],
} as const;
