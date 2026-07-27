import assert from 'node:assert/strict';
import { hasNonEnglishDigits, toEnglishDigits } from '../lib/englishDigits.ts';

assert.equal(toEnglishDigits('١٢٣'), '123');
assert.equal(toEnglishDigits('۰۱۲'), '012');
assert.equal(toEnglishDigits('١٫٥'), '1.5');
assert.equal(toEnglishDigits('١٬٢٣٤'), '1234');
assert.equal(toEnglishDigits('abc'), 'abc');
assert.equal(toEnglishDigits('كمية ١٢'), 'كمية 12');
assert.equal(hasNonEnglishDigits('12'), false);
assert.equal(hasNonEnglishDigits('١٢'), true);

console.log('english-digits: all assertions passed');
