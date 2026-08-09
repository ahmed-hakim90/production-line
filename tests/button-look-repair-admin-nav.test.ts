import assert from 'node:assert/strict';
import { resolveButtonLook } from '../components/buttonLook';

const cases: Array<{ label: string; tone: string; icon: string }> = [
  { label: 'طلبات الأدمن', tone: 'execute', icon: 'admin_panel_settings' },
  { label: 'الطلبات', tone: 'view', icon: 'assignment' },
  { label: 'التوريد', tone: 'share', icon: 'local_shipping' },
  { label: 'سندات الصرف', tone: 'edit', icon: 'payments' },
  { label: 'تقرير الخزينة', tone: 'save', icon: 'account_balance' },
  { label: 'أداء الفنيين', tone: 'view', icon: 'groups' },
  { label: 'الشكاوى', tone: 'reject', icon: 'report_problem' },
  { label: 'طلبات العملاء', tone: 'submit', icon: 'support_agent' },
  { label: 'العهدة', tone: 'share', icon: 'inventory_2' },
  { label: 'غير القابل', tone: 'undo', icon: 'block' },
  { label: 'الاستبدال', tone: 'export', icon: 'swap_horiz' },
  { label: 'التسعير (الماستر)', tone: 'edit', icon: 'payments' },
  { label: 'الفروع', tone: 'submit', icon: 'store' },
  { label: 'مؤشرات العملاء', tone: 'view', icon: 'analytics' },
  { label: 'المخزون', tone: 'view', icon: 'warehouse' },
  { label: 'الخزينة اليومية', tone: 'save', icon: 'point_of_sale' },
  { label: 'التقرير الشهري', tone: 'view', icon: 'calendar_month' },
];

for (const row of cases) {
  const look = resolveButtonLook(row.label);
  assert.ok(look, `expected look for "${row.label}"`);
  assert.equal(look!.tone, row.tone, `tone for "${row.label}"`);
  assert.equal(look!.icon, row.icon, `icon for "${row.label}"`);
}

console.log(`button-look-repair-admin-nav: ${cases.length} labels ok`);
