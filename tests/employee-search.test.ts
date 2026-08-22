import assert from 'node:assert/strict';
import type { FirestoreEmployee } from '../types.ts';
import {
  matchesEmployeeSearch,
  mergeEmployeeSearchResults,
} from '../modules/hr/utils/employeeSearch.ts';

const employee = (input: Partial<FirestoreEmployee> & Pick<FirestoreEmployee, 'id' | 'name'>): FirestoreEmployee => ({
  departmentId: '',
  jobPositionId: '',
  level: 1,
  employmentType: 'full_time',
  baseSalary: 0,
  hourlyRate: 0,
  hasSystemAccess: false,
  isActive: true,
  ...input,
});

const indexed = employee({
  id: 'indexed',
  name: 'محمد مجدي أحمد',
  code: 'EMP-100',
  searchPrefixes: ['محمد', 'محمد مجدي'],
});
const legacy = employee({
  id: 'legacy',
  name: 'مُحَمَّد مجدى حسن',
  phone: '01001234567',
});
const other = employee({ id: 'other', name: 'أحمد محمود' });

assert(matchesEmployeeSearch(indexed, 'محمد مجدي'));
assert(matchesEmployeeSearch(legacy, 'محمد مجدي'));
assert(matchesEmployeeSearch(legacy, '0100123'));
assert(!matchesEmployeeSearch(other, 'محمد مجدي'));

assert.deepEqual(
  mergeEmployeeSearchResults([indexed], [indexed, legacy, other], 'محمد مجدي').map((row) => row.id).sort(),
  ['indexed', 'legacy'],
  'indexed and legacy matches must be merged without duplicates',
);

console.log('employee-search.test.ts passed');
