import { toast } from 'sonner';
import { isBackgroundJobCancelled } from '@/components/background-jobs/useJobsStore';
import { customerService } from '../services/customerService';
import type { CustomerImportWriteRow } from './customerImportBatch';
import {
  toCustomerUpsertInput,
  type ParsedCustomerImportRow,
} from './importCustomers';

export type CustomersImportJobActor = {
  userId?: string;
  userName?: string;
};

function toImportWriteRow(row: ParsedCustomerImportRow): CustomerImportWriteRow {
  const input = toCustomerUpsertInput(row);
  return {
    rowNo: row.rowNo,
    code: input.code,
    type: input.type,
    name: input.name,
    phone: input.phone,
    address: input.address,
    notes: input.notes,
    isActive: input.isActive !== false,
    existingId: row.existingId,
  };
}

export async function runCustomersImportJob(input: {
  jobId: string;
  rows: ParsedCustomerImportRow[];
  actor: CustomersImportJobActor;
  onProgress: (processed: number, total: number) => void;
  onComplete: (created: number, updated: number, failed: number) => void;
  onFail: (message: string) => void;
}): Promise<void> {
  const ready = input.rows.filter((r) => r.status === 'create' || r.status === 'update');
  const total = ready.length;

  try {
    if (total === 0) {
      input.onComplete(0, 0, 0);
      toast.success('لا توجد صفوف صالحة للاستيراد.');
      return;
    }

    const writeRows = ready.map(toImportWriteRow);
    const result = await customerService.importUpsertMany(writeRows, input.actor, {
      onProgress: input.onProgress,
      shouldCancel: () => isBackgroundJobCancelled(input.jobId),
    });

    input.onComplete(result.created, result.updated, result.failed);
    if (result.failed > 0) {
      toast.warning(`اكتمل استيراد العملاء مع ${result.failed} صف فاشل من ${total}.`);
    } else {
      toast.success(`تم استيراد العملاء: ${result.created} جديد، ${result.updated} تحديث.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر تنفيذ استيراد العملاء.';
    if (message === 'تم إلغاء المهمة.') {
      input.onFail(message);
      return;
    }
    input.onFail(message);
  }
}
