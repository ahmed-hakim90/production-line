import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeRepairStatusHex,
  repairStatusChipStyle,
  resolveRepairStatusChip,
} from '../modules/repair/lib/repairStatusChipStyle';

describe('repairStatusChipStyle', () => {
  it('normalizes 3-digit and 6-digit hex', () => {
    assert.equal(normalizeRepairStatusHex('#abc'), '#aabbcc');
    assert.equal(normalizeRepairStatusHex('#A855F7'), '#a855f7');
    assert.equal(normalizeRepairStatusHex('not-a-color'), null);
    assert.equal(normalizeRepairStatusHex(''), null);
  });

  it('builds soft bordered chip style from hex', () => {
    const style = repairStatusChipStyle('#a855f7');
    assert.equal(style.color, '#a855f7');
    assert.equal(style.borderColor, '#a855f74d');
    assert.equal(style.backgroundColor, '#a855f71a');
  });

  it('falls back to slate when hex is invalid', () => {
    const style = repairStatusChipStyle('oops');
    assert.equal(style.color, '#64748b');
  });

  it('prefers settings statusMap label and color over defaults', () => {
    const chip = resolveRepairStatusChip('repairing', {
      repairing: { label: 'قيد الإصلاح', color: '#112233' },
    });
    assert.equal(chip.label, 'قيد الإصلاح');
    assert.equal(chip.color, '#112233');
    assert.equal(chip.style.color, '#112233');
  });

  it('uses default label/color when statusMap entry is missing', () => {
    const chip = resolveRepairStatusChip('ready', {});
    assert.equal(chip.label, 'جاهز للتسليم');
    assert.equal(chip.color, '#22c55e');
  });

  it('ignores invalid settings color and keeps default palette', () => {
    const chip = resolveRepairStatusChip('ready', {
      ready: { label: 'جاهز', color: 'red' },
    });
    assert.equal(chip.label, 'جاهز');
    assert.equal(chip.color, '#22c55e');
  });
});
