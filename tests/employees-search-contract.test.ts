import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('modules/hr/pages/Employees.tsx', 'utf8');
const service = readFileSync('modules/hr/employeeService.ts', 'utf8');

assert.match(page, /useDebouncedValue\(search, 350\)/);
assert.match(page, /normalizedDebouncedSearch\.length >= 2 \? debouncedSearch : ''/);
assert.match(page, /keepPreviousData: true/);
assert.match(page, /employeePager\.initialLoading/);
assert.match(page, /employeePager\.refreshing/);
assert.match(page, /mergeEmployeeSearchResults\(listEmployees, _rawEmployees, debouncedSearch\)/);
assert.match(page, /_rawEmployees\.length > 0 \? _rawEmployees : listEmployees/);
assert.match(service, /resolveFirestoreSearchKey\(options\.search\)/);

console.log('employees-search-contract.test.ts passed');
