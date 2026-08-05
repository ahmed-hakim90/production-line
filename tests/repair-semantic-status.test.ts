import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  repairComplaintStatusChipType,
  repairInvoiceActiveChipType,
  repairMonthCloseChipType,
  repairOpenClosedChipType,
  repairSpareIssueStatusChipType,
  repairStockLevelChipType,
  repairTreasuryEntryTypeChip,
} from '../modules/repair/lib/repairSemanticStatus';

describe('repairSemanticStatus', () => {
  it('maps open/closed session chips', () => {
    assert.equal(repairOpenClosedChipType(true), 'warning');
    assert.equal(repairOpenClosedChipType(false), 'success');
  });

  it('maps month close and invoice chips', () => {
    assert.equal(repairMonthCloseChipType(true), 'danger');
    assert.equal(repairMonthCloseChipType(false), 'success');
    assert.equal(repairInvoiceActiveChipType(true), 'danger');
    assert.equal(repairInvoiceActiveChipType(false), 'success');
  });

  it('maps stock, complaint, and spare-issue chips', () => {
    assert.equal(repairStockLevelChipType(true), 'danger');
    assert.equal(repairStockLevelChipType(false), 'success');
    assert.equal(repairComplaintStatusChipType('open'), 'danger');
    assert.equal(repairComplaintStatusChipType('in_progress'), 'warning');
    assert.equal(repairComplaintStatusChipType('resolved'), 'success');
    assert.equal(repairComplaintStatusChipType('closed'), 'muted');
    assert.equal(repairSpareIssueStatusChipType('submitted'), 'warning');
    assert.equal(repairSpareIssueStatusChipType('issued'), 'success');
    assert.equal(repairSpareIssueStatusChipType('rejected'), 'danger');
  });

  it('maps treasury entry types', () => {
    assert.deepEqual(repairTreasuryEntryTypeChip('INCOME'), { label: 'إيراد', type: 'success' });
    assert.deepEqual(repairTreasuryEntryTypeChip('EXPENSE'), { label: 'مصروف', type: 'danger' });
    assert.deepEqual(repairTreasuryEntryTypeChip('UNKNOWN'), { label: 'UNKNOWN', type: 'muted' });
  });
});
