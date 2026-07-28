import assert from 'node:assert/strict';

/** Minimal describe/it/expect shim so former vitest suites typecheck and run via tsx. */
export function describe(_name: string, fn: () => void): void {
  fn();
}

export function it(_name: string, fn: () => void): void {
  fn();
}

export function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      assert.equal(actual, expected);
    },
    toEqual(expected: unknown) {
      assert.deepEqual(actual, expected);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeFalsy() {
      assert.ok(!actual);
    },
    toBeUndefined() {
      assert.equal(actual, undefined);
    },
    toHaveLength(n: number) {
      assert.ok(actual != null && typeof (actual as { length?: unknown }).length === 'number');
      assert.equal((actual as { length: number }).length, n);
    },
    toMatchObject(expected: Record<string, unknown>) {
      assert.ok(actual != null && typeof actual === 'object');
      for (const [k, v] of Object.entries(expected)) {
        assert.deepEqual((actual as Record<string, unknown>)[k], v);
      }
    },
    toThrow(re?: RegExp | string) {
      assert.throws(
        actual as () => void,
        re instanceof RegExp ? re : re ? new RegExp(re) : undefined,
      );
    },
  };
}
