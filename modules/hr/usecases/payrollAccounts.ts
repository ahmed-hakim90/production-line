import { requireTenantIdOrThrow } from '@/core/auth/tenantContext';
import { eventBus, SystemEvents } from '@/shared/events';
import { runUseCase, type UseCaseResult } from '@/shared/usecases';
import { payrollAccountsService } from '../services/payrollAccountsService';

export async function confirmPayrollDisbursement(
  input: { recordId: string; disbursedBy: string; disbursedByName: string },
): Promise<UseCaseResult<{ recordId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    await payrollAccountsService.confirmDisbursement(input);
    eventBus.emit(SystemEvents.USER_ACTION, {
      module: 'hr',
      entityType: 'payroll_record',
      entityId: input.recordId,
      action: 'disburse',
      tenantId,
      actor: { userId: input.disbursedBy, userName: input.disbursedByName },
      description: 'Payroll disbursement confirmed',
    });
    return { recordId: input.recordId };
  });
}

export async function recordPayrollDistribution(
  input: {
    month: string;
    distributedBy: string;
    distributedByName: string;
    employeeCount: number;
  },
): Promise<UseCaseResult<{ distributionId: string }>> {
  return runUseCase(async () => {
    const tenantId = requireTenantIdOrThrow();
    const distributionId = await payrollAccountsService.recordDistribution(input);
    if (!distributionId) throw new Error('تعذر تسجيل توزيع الرواتب');
    eventBus.emit(SystemEvents.USER_ACTION, {
      module: 'hr',
      entityType: 'payroll_distribution',
      entityId: distributionId,
      action: 'distribute',
      tenantId,
      actor: { userId: input.distributedBy, userName: input.distributedByName },
      description: 'Payroll notifications distributed',
      metadata: { month: input.month, employeeCount: input.employeeCount },
    });
    return { distributionId };
  });
}
