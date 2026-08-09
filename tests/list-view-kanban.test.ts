import assert from 'node:assert/strict';
import {
  readStoredListViewMode,
  writeStoredListViewMode,
} from '../src/components/erp/ListViewToggle';
import { semanticStatusAccent } from '../modules/repair/lib/repairSemanticStatus';

// localStorage shim for node
const mem = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: () => null,
  length: 0,
} as Storage;

assert.equal(readStoredListViewMode('repair-jobs', 'kanban'), 'kanban');
writeStoredListViewMode('repair-jobs', 'table');
assert.equal(readStoredListViewMode('repair-jobs', 'kanban'), 'table');
writeStoredListViewMode('repair-jobs', 'kanban');
assert.equal(readStoredListViewMode('repair-jobs', 'table'), 'kanban');

assert.equal(semanticStatusAccent('danger'), '#dc2626');
assert.equal(semanticStatusAccent('success'), '#059669');
assert.equal(semanticStatusAccent('warning'), '#d97706');
assert.equal(semanticStatusAccent('info'), '#0284c8');
assert.equal(semanticStatusAccent('muted'), '#64748b');

console.log('list-view-kanban: ok');
