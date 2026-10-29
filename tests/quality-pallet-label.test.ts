import assert from 'node:assert/strict';
import { palletWorkOrderOptionLabel } from '../modules/quality/domain/palletWorkOrderLabel.ts';

const products = [{ id: 'p1', name: 'غسالة 7 كجم', code: 'WM-07' }];

assert.equal(
  palletWorkOrderOptionLabel({ workOrderNumber: 'WO-2026-0099', productId: 'p1' }, products),
  'غسالة 7 كجم (WM-07)',
);

assert.equal(
  palletWorkOrderOptionLabel(
    { workOrderNumber: 'WO-2026-0098', productId: 'p1', productName: 'غسالة مخزنة' },
    products,
  ),
  'غسالة مخزنة (WM-07)',
);

assert.equal(
  palletWorkOrderOptionLabel(
    { workOrderNumber: 'WO-2026-0097', productId: 'p2', productName: 'مكواة', productCode: 'IR-01' },
    products,
  ),
  'مكواة (IR-01)',
);

assert.equal(
  palletWorkOrderOptionLabel({ workOrderNumber: 'WO-2026-0096', productId: 'missing' }, products),
  'WO-2026-0096',
);

assert.equal(
  palletWorkOrderOptionLabel({ productId: 'missing' }, []),
  'أمر شغل',
);

assert.equal(
  palletWorkOrderOptionLabel(
    { workOrderNumber: 'WO-2026-0095', productId: 'p3', productName: 'مروحة' },
    [{ id: 'p3', name: 'اسم آخر' }],
  ),
  'مروحة',
);
