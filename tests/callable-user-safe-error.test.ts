import assert from 'node:assert/strict';
import {
  extractCallableBusinessMessage,
  isGenericCallableMessage,
  toCallableUserSafeError,
} from '../functions/src/callableUserSafeError.ts';

assert.equal(isGenericCallableMessage('INTERNAL'), true);
assert.equal(isGenericCallableMessage('internal'), true);
assert.equal(isGenericCallableMessage('functions/internal'), true);
assert.equal(isGenericCallableMessage('الرصيد المتاح غير كافٍ للحجز'), false);

assert.equal(extractCallableBusinessMessage('INTERNAL'), '');
assert.equal(
  extractCallableBusinessMessage(
    '10 FAILED_PRECONDITION: الرصيد المتاح غير كافٍ للحجز — شاشة (المطلوب 2، المتاح 0).',
  ).includes('الرصيد المتاح غير كافٍ'),
  true,
);

const recovered = toCallableUserSafeError(
  new Error('10 FAILED_PRECONDITION: الرصيد المتاح غير كافٍ للحجز — شاشة (المطلوب 2، المتاح 0).'),
  'تعذر اعتماد طلب التموين. تحقق من الرصيد المتاح في المخزن المركزي.',
);
assert.equal(recovered.code, 'failed-precondition');
assert.match(recovered.message, /الرصيد المتاح غير كافٍ/);
assert.match(recovered.message, /المطلوب 2/);

const opaque = toCallableUserSafeError(
  { code: 'internal', message: 'INTERNAL' },
  'تعذر اعتماد طلب التموين. تحقق من الرصيد المتاح في المخزن المركزي.',
);
assert.equal(opaque.code, 'failed-precondition');
assert.equal(
  opaque.message,
  'تعذر اعتماد طلب التموين. تحقق من الرصيد المتاح في المخزن المركزي.',
);

const business = toCallableUserSafeError(
  new Error('الرصيد المتاح غير كافٍ للحجز — شاشة (المطلوب 2، المتاح 0).'),
  'fallback',
);
assert.equal(business.code, 'failed-precondition');
assert.match(business.message, /شاشة/);

console.log('callable-user-safe-error tests passed');
