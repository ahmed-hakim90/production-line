import assert from 'node:assert/strict';
import {
  isListboxNavKey,
  isListboxOpenKey,
  listboxIndexAfterKey,
} from '../lib/listboxKeyboard.ts';

assert.equal(isListboxOpenKey('ArrowDown'), true);
assert.equal(isListboxOpenKey('Down'), true);
assert.equal(isListboxOpenKey('ArrowUp'), true);
assert.equal(isListboxOpenKey('Enter'), false);
assert.equal(isListboxNavKey('Home'), true);
assert.equal(isListboxNavKey('End'), true);
assert.equal(isListboxNavKey('Enter'), false);

assert.equal(listboxIndexAfterKey('ArrowDown', 0, 3), 1);
assert.equal(listboxIndexAfterKey('Down', 2, 3), 0);
assert.equal(listboxIndexAfterKey('ArrowUp', 0, 3), 2);
assert.equal(listboxIndexAfterKey('Up', 1, 3), 0);
assert.equal(listboxIndexAfterKey('Home', 2, 3), 0);
assert.equal(listboxIndexAfterKey('End', 0, 3), 2);
assert.equal(listboxIndexAfterKey('ArrowDown', 0, 0), 0);
assert.equal(listboxIndexAfterKey('ArrowDown', 9, 2), 0);

console.log('listbox-keyboard.test.ts: ok');
