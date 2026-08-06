import {
  updateRepairPartsPricingCallable,
  type RepairPartsPricingUpdateInput,
} from '../../auth/services/firebase';

const MAX_UPDATES_PER_REQUEST = 200;

export class RepairPartsPricingPartialUpdateError extends Error {
  constructor(
    public readonly updatedCount: number,
    cause: unknown,
  ) {
    super(
      updatedCount > 0
        ? `تم تحديث ${updatedCount} قطعة قبل توقف العملية. حدّث الصفحة وارفع الملف مرة أخرى لاستكمال الباقي.`
        : cause instanceof Error
          ? cause.message
          : 'تعذر تحديث تسعير قطع الغيار.',
    );
    this.name = 'RepairPartsPricingPartialUpdateError';
  }
}

export const repairPartsPricingService = {
  async update(updates: RepairPartsPricingUpdateInput[]): Promise<number> {
    let updatedCount = 0;
    for (let start = 0; start < updates.length; start += MAX_UPDATES_PER_REQUEST) {
      try {
        const result = await updateRepairPartsPricingCallable(
          updates.slice(start, start + MAX_UPDATES_PER_REQUEST),
        );
        updatedCount += Number(result.updatedCount || 0);
      } catch (error) {
        throw new RepairPartsPricingPartialUpdateError(updatedCount, error);
      }
    }
    return updatedCount;
  },
};
