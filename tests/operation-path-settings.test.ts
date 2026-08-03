import assert from 'node:assert/strict';
import {
  INVENTORY_HANDOVER_RECEIPT_PATHS,
  INVENTORY_OPERATION_KEYS,
  OPERATION_PATH_REGISTRY,
  OperationPathDisabledError,
  PRODUCTION_REPORT_CREATE_PATHS,
  PRODUCTION_REPORT_OPERATION_KEYS,
  assertOperationPathEnabled,
  diffOperationPathSettings,
  isMenuItemOperationPathEnabled,
  isOperationPathEnabled,
  mergeOperationPathSettingsPatch,
  patchOperationPathControl,
  resolveOperationPathSettings,
} from '../modules/system/lib/operationPathSettings.ts';

const operationKey = PRODUCTION_REPORT_OPERATION_KEYS.create;
const quickActionPath = PRODUCTION_REPORT_CREATE_PATHS.quickAction;

assert.equal(
  isOperationPathEnabled(undefined, operationKey, quickActionPath),
  true,
  'missing settings must preserve existing enabled behavior',
);

const pathDisabled = patchOperationPathControl(undefined, operationKey, {
  paths: { [quickActionPath]: false },
});
assert.equal(isOperationPathEnabled(pathDisabled, operationKey, quickActionPath), false);
assert.equal(
  isOperationPathEnabled(pathDisabled, operationKey, PRODUCTION_REPORT_CREATE_PATHS.reportsPage),
  true,
  'disabling one path must not disable sibling paths',
);

const operationDisabled = patchOperationPathControl(pathDisabled, operationKey, {
  enabled: false,
});
assert.equal(
  isOperationPathEnabled(operationDisabled, operationKey, PRODUCTION_REPORT_CREATE_PATHS.reportsPage),
  false,
  'the master operation switch must override path switches',
);

assert.throws(
  () => assertOperationPathEnabled(operationDisabled, operationKey, quickActionPath),
  OperationPathDisabledError,
);

assert.deepEqual(resolveOperationPathSettings({
  operations: {
    [operationKey]: {
      enabled: 'false',
      paths: {
        [quickActionPath]: false,
        unsafe: 'no',
      },
    },
    invalid: null,
  },
}), {
  operations: {
    [operationKey]: {
      paths: { [quickActionPath]: false },
    },
  },
});

const settingsBase = {
  operations: {
    [operationKey]: {
      enabled: true,
      paths: {
        [quickActionPath]: true,
        [PRODUCTION_REPORT_CREATE_PATHS.reportsPage]: true,
      },
    },
  },
};
const localEdit = patchOperationPathControl(settingsBase, operationKey, {
  paths: { [quickActionPath]: false },
});
const localPatch = diffOperationPathSettings(settingsBase, localEdit);
assert.deepEqual(localPatch, {
  operations: {
    [operationKey]: {
      paths: { [quickActionPath]: false },
    },
  },
});
const concurrentlyUpdated = patchOperationPathControl(settingsBase, operationKey, {
  paths: { [PRODUCTION_REPORT_CREATE_PATHS.reportsPage]: false },
});
assert.deepEqual(
  mergeOperationPathSettingsPatch(concurrentlyUpdated, localPatch),
  {
    operations: {
      [operationKey]: {
        enabled: true,
        paths: {
          [quickActionPath]: false,
          [PRODUCTION_REPORT_CREATE_PATHS.reportsPage]: false,
        },
      },
    },
  },
  'operation path patches must preserve concurrent sibling updates',
);

const registryKeys = new Set<string>();
for (const operation of OPERATION_PATH_REGISTRY) {
  assert.equal(registryKeys.has(operation.key), false, `duplicate operation key: ${operation.key}`);
  registryKeys.add(operation.key);
  const pathKeys = operation.paths.map((path) => path.key);
  assert.equal(pathKeys.length, new Set(pathKeys).size, `duplicate path key in ${operation.key}`);
}

assert.equal(
  registryKeys.has(INVENTORY_OPERATION_KEYS.productionHandoverConfirm),
  true,
  'registry must include packaging handover receipt operation',
);

const packagingDisabled = patchOperationPathControl(undefined, INVENTORY_OPERATION_KEYS.productionHandoverConfirm, {
  paths: { [INVENTORY_HANDOVER_RECEIPT_PATHS.packagingControl]: false },
});
assert.equal(
  isMenuItemOperationPathEnabled(packagingDisabled, 'packaging-control'),
  false,
  'packaging-control menu must honor handover receipt path flag',
);
assert.equal(
  isMenuItemOperationPathEnabled(undefined, 'packaging-control'),
  true,
  'packaging-control menu stays available by default',
);

console.log('operation-path-settings tests passed');
