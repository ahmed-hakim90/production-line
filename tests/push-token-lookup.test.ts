import assert from 'node:assert/strict';
import {
  collectPushTokenTargets,
  enabledUniqueTokens,
  mergeRecipientPushTokens,
} from '../functions/src/pushTokenLookup.ts';

function makeFakeDb(docs: Record<string, Record<string, unknown>>) {
  const store = new Map(Object.entries(docs));
  const makeSnap = (path: string) => {
    const data = store.get(path);
    return {
      id: path.split('/').pop() || path,
      exists: data != null,
      ref: { path },
      data: () => data,
    };
  };
  return {
    collection(name: string) {
      return {
        doc(id: string) {
          const path = `${name}/${id}`;
          return {
            get: async () => makeSnap(path),
            collection(sub: string) {
              const prefix = `${path}/${sub}/`;
              return {
                async get() {
                  const found = [...store.entries()]
                    .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
                    .map(([key, data]) => ({
                      id: key.slice(prefix.length),
                      ref: { path: key },
                      data: () => data,
                    }));
                  return { docs: found, empty: found.length === 0 };
                },
              };
            },
          };
        },
        where(field: string, _op: string, value: unknown) {
          const filters = [{ field, value }];
          const api = {
            where(nextField: string, _nextOp: string, nextValue: unknown) {
              filters.push({ field: nextField, value: nextValue });
              return api;
            },
            limit() {
              return api;
            },
            async get() {
              const prefix = `${name}/`;
              const found = [...store.entries()]
                .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
                .filter(([, data]) => filters.every((filter) => data[filter.field] === filter.value))
                .map(([key, data]) => ({
                  id: key.slice(prefix.length),
                  ref: { path: key },
                  data: () => data,
                }));
              return { docs: found, empty: found.length === 0 };
            },
          };
          return api;
        },
      };
    },
  };
}

assert.deepEqual(
  enabledUniqueTokens([
    { token: 'a', enabled: true },
    { token: 'a' },
    { token: 'b', enabled: false },
    { token: '  ' },
    { token: 'c' },
  ]),
  ['a', 'c'],
);

assert.deepEqual(
  mergeRecipientPushTokens({
    employeeDevices: [{ token: 'emp-token', enabled: true }],
    userDevices: [],
    userFcmTokens: [],
  }),
  ['emp-token'],
);

assert.deepEqual(
  mergeRecipientPushTokens({
    employeeDevices: [],
    userDevices: [{ token: 'user-device', enabled: true }],
    userFcmTokens: [{ token: 'fcm-token' }],
  }),
  ['user-device', 'fcm-token'],
);

assert.deepEqual(
  mergeRecipientPushTokens({
    employeeDevices: [{ token: 'shared', enabled: true }],
    userDevices: [{ token: 'shared', enabled: true }, { token: 'extra' }],
    userFcmTokens: [{ token: 'shared' }, { token: 'fcm-only' }],
  }),
  ['shared', 'extra', 'fcm-only'],
);

assert.deepEqual(
  mergeRecipientPushTokens({
    employeeDevices: [{ token: 'stale', enabled: false }],
    userDevices: [{ token: 'fresh' }],
    userFcmTokens: [],
  }),
  ['fresh'],
);

{
  const db = makeFakeDb({
    'employees/emp-1': { userId: 'user-1' },
    'user_devices/tok-a': { token: 'tok-a', employeeId: 'emp-1', enabled: true },
  });
  const targets = await collectPushTokenTargets(db as never, 'emp-1');
  assert.deepEqual(targets.map((row) => row.token), ['tok-a']);
}

{
  const db = makeFakeDb({
    'employees/emp-2': { userId: 'user-2' },
    'user_devices/tok-b': { token: 'tok-b', userId: 'user-2', employeeId: '', enabled: true },
    'users/user-2/fcmTokens/last24': { token: 'tok-c', enabled: true },
  });
  const targets = await collectPushTokenTargets(db as never, 'emp-2');
  assert.deepEqual(targets.map((row) => row.token).sort(), ['tok-b', 'tok-c']);
}

{
  const db = makeFakeDb({
    'users/user-only': { email: 'ops@example.com' },
    'user_devices/tok-d': { token: 'tok-d', userId: 'user-only', enabled: true },
  });
  const targets = await collectPushTokenTargets(db as never, 'user-only');
  assert.deepEqual(targets.map((row) => row.token), ['tok-d']);
}

{
  const targets = await collectPushTokenTargets(makeFakeDb({}) as never, '');
  assert.deepEqual(targets, []);
}

{
  const db = makeFakeDb({
    'employees/emp-3': { userId: 'user-3' },
    'user_devices/tok-e': { token: 'tok-e', employeeId: 'emp-3', userId: 'user-3' },
  });
  const targets = await collectPushTokenTargets(db as never, 'emp-3');
  assert.deepEqual(targets.map((row) => row.token), ['tok-e']);
}

console.log('push-token-lookup.test.ts passed');
