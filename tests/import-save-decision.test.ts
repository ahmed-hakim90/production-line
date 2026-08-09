import { describe, expect, it } from './assertHarness.ts';
import {
  decideMaterialImportSave,
  decideProductImportSave,
} from '../utils/importSaveDecision.ts';

describe('decideMaterialImportSave', () => {
  it('creates new rows', () => {
    expect(decideMaterialImportSave({ action: 'create' })).toBe('create');
  });

  it('skips updates with no field changes', () => {
    expect(decideMaterialImportSave({ action: 'update', changes: [] })).toBe('skip');
    expect(decideMaterialImportSave({ action: 'update' })).toBe('skip');
  });

  it('updates when changes exist', () => {
    expect(decideMaterialImportSave({ action: 'update', changes: ['الاسم'] })).toBe('update');
  });

  it('skips all updates when skipUpdates is on', () => {
    expect(
      decideMaterialImportSave({ action: 'update', changes: ['الاسم'] }, { skipUpdates: true }),
    ).toBe('skip');
    expect(
      decideMaterialImportSave({ action: 'create' }, { skipUpdates: true }),
    ).toBe('create');
  });
});

describe('decideProductImportSave', () => {
  it('creates new rows', () => {
    expect(
      decideProductImportSave({ action: 'create', materialsLength: 0 }),
    ).toBe('create');
  });

  it('skips updates with no changes and no BOM materials', () => {
    expect(
      decideProductImportSave({ action: 'update', changes: [], materialsLength: 0 }),
    ).toBe('skip');
    expect(
      decideProductImportSave({ action: 'update', materialsLength: 0 }),
    ).toBe('skip');
  });

  it('saves BOM only when product fields unchanged but materials present', () => {
    expect(
      decideProductImportSave({ action: 'update', changes: [], materialsLength: 2 }),
    ).toBe('bomOnly');
  });

  it('updates when product fields changed', () => {
    expect(
      decideProductImportSave({
        action: 'update',
        changes: ['الاسم'],
        materialsLength: 0,
      }),
    ).toBe('update');
    expect(
      decideProductImportSave({
        action: 'update',
        changes: ['الاسم'],
        materialsLength: 1,
      }),
    ).toBe('update');
  });
});
