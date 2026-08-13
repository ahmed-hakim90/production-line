import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLOATING_MENU_Z_CLASS,
  MODAL_SHELL_Z_CLASS,
  OVERLAY_Z,
  isRadixFloatingTarget,
} from '../lib/overlayStack.ts';

/**
 * Dialog/Sheet/ManagedModalPortal share --z-modal.
 * Floating menus must stay above that layer or Select/Popover options
 * render behind the modal and look empty.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(OVERLAY_Z.modal, 10050);
assert.equal(OVERLAY_Z.floating, 10100);
assert.ok(OVERLAY_Z.floating > OVERLAY_Z.modal);
assert.equal(MODAL_SHELL_Z_CLASS, 'z-[10050]');
assert.equal(FLOATING_MENU_Z_CLASS, 'z-[10100]');

const dialog = read('components/ui/dialog.tsx');
const sheet = read('components/ui/sheet.tsx');
const select = read('components/ui/select.tsx');
const popover = read('components/ui/popover.tsx');
const dropdown = read('components/ui/dropdown-menu.tsx');
const portal = read('components/modal-manager/ManagedModalPortal.tsx');
const css = read('src/index.css');

assert.match(dialog, /MODAL_SHELL_Z_CLASS/);
assert.match(dialog, /isRadixFloatingTarget/);
assert.match(sheet, /MODAL_SHELL_Z_CLASS/);
assert.match(sheet, /isRadixFloatingTarget/);
assert.match(select, /FLOATING_MENU_Z_CLASS/);
assert.match(popover, /FLOATING_MENU_Z_CLASS/);
assert.match(dropdown, /FLOATING_MENU_Z_CLASS/);
assert.match(read('modules/customers/components/CustomerPicker.tsx'), /createPortal/);
assert.match(read('modules/customers/components/CustomerPicker.tsx'), /FLOATING_MENU_Z_CLASS/);
assert.match(portal, /erp-managed-modal-layer/);
assert.match(css, /--z-modal:\s*10050/);
assert.match(css, /--z-floating:\s*10100/);
assert.match(css, /\.erp-managed-modal-layer/);
assert.match(read('modules/inventory/components/departmentConsumables/ModalShell.tsx'), /ManagedModalPortal/);
assert.match(read('modules/repair/components/RepairModalShell.tsx'), /MODAL_SHELL_Z_CLASS/);
assert.doesNotMatch(select, /z-\[70\]/);
assert.doesNotMatch(popover, /z-\[70\]/);

/** SearchableSelect must not pin PopoverContent under modal shells (z-[500] regression). */
const searchableSelect = read('components/UI.tsx');
assert.match(searchableSelect, /export const SearchableSelect/);
assert.match(searchableSelect, /isListboxOpenKey/);
assert.match(searchableSelect, /isListboxNavKey/);
assert.match(searchableSelect, /\bloop\b/);
assert.doesNotMatch(searchableSelect, /PopoverContent[\s\S]{0,200}z-\[(?:50|70|100|200|300|500)\]/);

{
  const el = { closest: (sel: string) => (sel.includes('data-radix-select-content') ? {} : null) };
  assert.equal(isRadixFloatingTarget(el as unknown as Element), true);
  assert.equal(isRadixFloatingTarget(null), false);
}

/** Modal shells must not keep legacy low z-index that sits under floating menus. */
const LEGACY_MODAL_Z =
  /fixed inset-0[^"'`\n]*z-(?:50|\[50\]|\[60\]|\[62\]|\[100\]|\[200\]|\[300\]|\[1000\])|z-(?:50|\[50\]|\[60\]|\[62\]|\[100\]|\[200\]|\[300\]|\[1000\])[^"'`\n]*fixed inset-0/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'docs']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

const offenders: string[] = [];
for (const file of [...walk(join(root, 'components')), ...walk(join(root, 'modules'))]) {
  const rel = file.slice(root.length + 1);
  if (rel.includes('Sidebar.tsx')) continue;
  const text = readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.includes('fixed inset-0')) continue;
    if (!/bg-black|backdrop-blur|items-center|items-end|items-start|pointer-events-auto/.test(line)) continue;
    if (LEGACY_MODAL_Z.test(line)) {
      offenders.push(`${rel}: ${line.trim()}`);
    }
  }
}

assert.deepEqual(offenders, [], `Legacy modal z-index remains:\n${offenders.join('\n')}`);

console.log('overlay-stacking: ok');
