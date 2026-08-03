import assert from 'node:assert/strict';
import {
  assertOperationPathEnabledServer,
  isOperationPathEnabledServer,
} from '../functions/src/operationPathGuard.ts';

assert.equal(
  isOperationPathEnabledServer({}, 'production.report.create'),
  true,
  'missing settings keep paths enabled',
);

assert.equal(
  isOperationPathEnabledServer(
    {
      operationPaths: {
        operations: {
          'production.report.create': { enabled: false },
        },
      },
    },
    'production.report.create',
  ),
  false,
);

assert.equal(
  isOperationPathEnabledServer(
    {
      operationPaths: {
        operations: {
          'inventory.productionHandover.confirmReceipt': {
            paths: { packaging_control: false },
          },
        },
      },
    },
    'inventory.productionHandover.confirmReceipt',
    'packaging_control',
  ),
  false,
);

assert.throws(
  () => assertOperationPathEnabledServer(
    {
      operationPaths: {
        operations: {
          'inventory.productionHandover.confirmReceipt': { enabled: false },
        },
      },
    },
    'inventory.productionHandover.confirmReceipt',
    'packaging_control',
  ),
);

console.log('operation-path-guard-server tests passed');
