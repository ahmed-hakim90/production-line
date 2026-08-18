import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  reservationShortageMessage,
  stockAvailableQty,
  stockReservedQty,
} from '../functions/src/stockReservation';

describe('stock reservation helpers', () => {
  it('computes available as quantity minus reserved', () => {
    assert.equal(stockAvailableQty({ quantity: 10, reservedQty: 3 }), 7);
    assert.equal(stockAvailableQty({ quantity: 10, reservedQty: 0 }), 10);
    assert.equal(stockAvailableQty({ quantity: 5, reservedQty: 8 }), 0);
    assert.equal(stockAvailableQty(undefined), 0);
  });

  it('normalizes reserved qty', () => {
    assert.equal(stockReservedQty({ reservedQty: 4 }), 4);
    assert.equal(stockReservedQty({ reservedQty: -2 }), 0);
    assert.equal(stockReservedQty({}), 0);
  });

  it('formats a user-safe reservation shortage message', () => {
    assert.equal(
      reservationShortageMessage(4, 1, 'الصنف شاشة'),
      'الرصيد المتاح غير كافٍ للحجز — الصنف شاشة (المطلوب 4، المتاح 1).',
    );
    assert.match(reservationShortageMessage(2, 0), /المتاح 0/);
  });
});
