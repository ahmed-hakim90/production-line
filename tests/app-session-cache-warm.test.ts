import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  APP_SESSION_CACHE_KEY_PREFIX,
  clearCachedAppSession,
  hasValidCachedAppSession,
  peekAnyActiveCachedAppSession,
  writeCachedAppSession,
} from '../lib/appSessionCache.ts';
import { DEFAULT_ACTIVITY_PACKS, resolveActivityPacks } from '../lib/activityPacks.ts';

const UID = 'warm-user-1';

const sampleSession = {
  uid: UID,
  userEmail: 'a@b.c',
  userDisplayName: 'Test',
  userProfile: {
    id: UID,
    email: 'a@b.c',
    displayName: 'Test',
    roleId: 'role-1',
    tenantId: 'tenant-1',
    isActive: true,
  },
  role: {
    id: 'role-1',
    name: 'Admin',
    color: '#000',
    permissions: {},
  },
};

describe('appSessionCache warm boot', () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
        key: (index: number) => Array.from(memory.keys())[index] ?? null,
        get length() {
          return memory.size;
        },
      },
    };
    Object.defineProperty((globalThis as { window: { localStorage: Storage } }).window.localStorage, 'length', {
      get: () => memory.size,
    });
    // Object.keys(localStorage) in browsers lists keys; polyfill via Object.keys on map proxy
    (globalThis as { window: { localStorage: object } }).window.localStorage = new Proxy(
      {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
      {
        ownKeys: () => Array.from(memory.keys()),
        getOwnPropertyDescriptor: (target, prop) => {
          if (typeof prop === 'string' && memory.has(prop)) {
            return { configurable: true, enumerable: true, value: memory.get(prop) };
          }
          return Reflect.getOwnPropertyDescriptor(target, prop);
        },
        get: (target, prop, receiver) => {
          if (prop === 'length') return memory.size;
          if (typeof prop === 'string' && prop in target) {
            return Reflect.get(target, prop, receiver);
          }
          return memory.get(String(prop));
        },
      },
    );
  });

  afterEach(() => {
    clearCachedAppSession();
    delete (globalThis as { window?: unknown }).window;
  });

  it('exposes a stable cache key prefix for index.html warm detection', () => {
    assert.equal(APP_SESSION_CACHE_KEY_PREFIX, 'erp.appSession.v1');
  });

  it('peek/has detect an active cached session for F5 warm boot', () => {
    assert.equal(hasValidCachedAppSession(), false);
    assert.equal(peekAnyActiveCachedAppSession(), null);

    writeCachedAppSession(sampleSession as Parameters<typeof writeCachedAppSession>[0]);

    assert.equal(hasValidCachedAppSession(), true);
    const peeked = peekAnyActiveCachedAppSession();
    assert.ok(peeked);
    assert.equal(peeked?.uid, UID);
    assert.equal(peeked?.userProfile.isActive, true);
  });

  it('legacy cached sessions without activity packs resolve to safe defaults', () => {
    writeCachedAppSession(sampleSession as Parameters<typeof writeCachedAppSession>[0]);

    const peeked = peekAnyActiveCachedAppSession();
    assert.ok(peeked);
    assert.equal(peeked?.tenantActivityPacks, undefined);
    assert.deepEqual(
      resolveActivityPacks(peeked?.tenantActivityPacks),
      [...DEFAULT_ACTIVITY_PACKS],
    );
  });
});
