import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pinListScrollToTop, scrollOptionWithinList } from '../lib/listboxScroll.ts';

const box = (top: number, bottom: number, scrollTop = 0) => ({
  scrollTop,
  getBoundingClientRect: () => ({ top, bottom }),
});

{
  const list = box(100, 300, 480);
  pinListScrollToTop(list);
  assert.equal(list.scrollTop, 0);
  pinListScrollToTop(list);
  assert.equal(list.scrollTop, 0);
  pinListScrollToTop(null);
}

{
  const list = box(100, 300, 200);
  const above = { getBoundingClientRect: () => ({ top: 40, bottom: 80 }) };
  scrollOptionWithinList(list, above);
  assert.equal(list.scrollTop, 140);
}

{
  const list = box(100, 300, 20);
  const below = { getBoundingClientRect: () => ({ top: 280, bottom: 340 }) };
  scrollOptionWithinList(list, below);
  assert.equal(list.scrollTop, 60);
}

{
  const list = box(100, 300, 20);
  const visible = { getBoundingClientRect: () => ({ top: 120, bottom: 160 }) };
  scrollOptionWithinList(list, visible);
  assert.equal(list.scrollTop, 20);
}

{
  const list = box(100, 300, 90);
  scrollOptionWithinList(list, null);
  assert.equal(list.scrollTop, 0);
}

const root = new URL('..', import.meta.url);
const searchableSelect = readFileSync(new URL('components/UI.tsx', root), 'utf8');
const voucherCombobox = readFileSync(new URL('modules/inventory/components/VoucherItemCombobox.tsx', root), 'utf8');
const customerPicker = readFileSync(new URL('modules/customers/components/CustomerPicker.tsx', root), 'utf8');

assert.match(searchableSelect, /pinListScrollToTop\(commandListRef\.current\)/);
assert.match(searchableSelect, /\[overflow-anchor:none\]/);
assert.doesNotMatch(searchableSelect, /scrollIntoView/);

for (const source of [voucherCombobox, customerPicker]) {
  assert.match(source, /pinListScrollToTop\(listRef\.current\)/);
  assert.match(source, /scrollOptionWithinList\(listRef\.current/);
  assert.match(source, /overflowAnchor: 'none'/);
  assert.doesNotMatch(source, /scrollIntoView/);
}

console.log('listbox-scroll: ok');
