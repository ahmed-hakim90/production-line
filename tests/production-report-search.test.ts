import assert from 'node:assert/strict';
import {
  buildReportRangeLoadKey,
  matchesProductionReportSearchQuery,
  normalizeProductionReportSearchText,
  shouldLoadFullRangeForClientSearch,
} from '../modules/production/lib/productionReportSearch';

assert.equal(normalizeProductionReportSearchText('٧٠١٥'), '7015');
assert.equal(normalizeProductionReportSearchText('  SK-7015A  '), 'sk-7015a');

assert.equal(
  matchesProductionReportSearchQuery('7015', ['كبه سوكاني', 'SK-7015A', '']),
  true,
);
assert.equal(
  matchesProductionReportSearchQuery('7015', ['كبه سوكاني', undefined, '']),
  false,
);
assert.equal(
  matchesProductionReportSearchQuery('٧٠١٥', ['SK-7015A']),
  true,
);
assert.equal(
  matchesProductionReportSearchQuery('', ['anything']),
  true,
);

const rangeKey = buildReportRangeLoadKey({
  startDate: '2026-08-01',
  endDate: '2026-08-17',
  lineId: '',
  employeeId: '',
});

assert.equal(
  shouldLoadFullRangeForClientSearch({
    viewMode: 'range',
    query: '7015',
    hasMore: true,
    loading: false,
    alreadyLoadedKey: '',
    rangeKey,
  }),
  true,
);

assert.equal(
  shouldLoadFullRangeForClientSearch({
    viewMode: 'range',
    query: '7015',
    hasMore: true,
    loading: false,
    alreadyLoadedKey: rangeKey,
    rangeKey,
  }),
  false,
  'do not reload the same period after a full-range search fetch',
);

assert.equal(
  shouldLoadFullRangeForClientSearch({
    viewMode: 'range',
    query: '7015',
    hasMore: false,
    loading: false,
    alreadyLoadedKey: '',
    rangeKey,
  }),
  false,
);

assert.equal(
  shouldLoadFullRangeForClientSearch({
    viewMode: 'today',
    query: '7015',
    hasMore: true,
    loading: false,
    alreadyLoadedKey: '',
    rangeKey,
  }),
  false,
);

console.log('production-report-search.test.ts passed');
