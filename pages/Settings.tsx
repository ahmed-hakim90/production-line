
import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Card, Badge } from '../components/UI';
import {
  usePermission,
  useCurrentRole,
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  checkPermission,
  type Permission,
} from '../utils/permissions';

export const Settings: React.FC = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const products = useAppStore((s) => s.products);
  const productionLines = useAppStore((s) => s.productionLines);
  const supervisors = useAppStore((s) => s.supervisors);
  const roles = useAppStore((s) => s.roles);
  const userPermissions = useAppStore((s) => s.userPermissions);

  const { can } = usePermission();
  const { roleName, roleColor, isReadOnly } = useCurrentRole();

  const enabledCount = Object.values(userPermissions).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">الإعدادات</h2>
        <p className="text-sm text-slate-500 font-medium">إعدادات النظام وحالة الاتصال والصلاحيات.</p>
      </div>

      {/* Current Role Info */}
      <Card title="الدور الحالي والصلاحيات">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="material-icons-round text-primary text-3xl">shield</span>
          </div>
          <div>
            <p className="text-sm text-slate-400 font-bold mb-1">الدور الحالي</p>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${roleColor}`}>
              {roleName}
            </span>
          </div>
          <div className="mr-auto flex items-center gap-2">
            {isReadOnly && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <span className="material-icons-round text-sm">lock</span>
                قراءة فقط
              </span>
            )}
            {can("print") && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <span className="material-icons-round text-sm">print</span>
                طباعة
              </span>
            )}
            {can("export") && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <span className="material-icons-round text-sm">download</span>
                تصدير
              </span>
            )}
          </div>
        </div>

        {/* Quick permissions overview for current role */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.key} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <p className="text-xs font-bold text-slate-500 mb-2">{group.label}</p>
              <div className="flex flex-wrap gap-1">
                {group.permissions.map((perm) => (
                  <span
                    key={perm.key}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      can(perm.key)
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500 line-through'
                    }`}
                  >
                    {perm.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-slate-400 font-bold">
          {enabledCount} / {ALL_PERMISSIONS.length} صلاحية مفعلة
        </div>
      </Card>

      {/* Full Permission Matrix (admin / roles.manage only) */}
      {can("roles.manage") && roles.length > 0 && (
        <Card title="مصفوفة الصلاحيات الكاملة">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase">المورد</th>
                  {roles.map((r) => (
                    <th key={r.id} className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${r.color}`}>
                        {r.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {PERMISSION_GROUPS.map((group) => (
                  <tr key={group.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">{group.label}</td>
                    {roles.map((r) => (
                      <td key={r.id} className="px-4 py-3 text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          {group.permissions.map((perm) => (
                            <span
                              key={perm.key}
                              className={`w-6 h-6 rounded flex items-center justify-center text-xs ${
                                checkPermission(r.permissions, perm.key)
                                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : 'bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600'
                              }`}
                              title={`${r.name} - ${group.label} - ${perm.label}`}
                            >
                              {checkPermission(r.permissions, perm.key) ? (
                                <span className="material-icons-round text-xs">check</span>
                              ) : (
                                <span className="material-icons-round text-xs">close</span>
                              )}
                            </span>
                          ))}
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1">
                          {group.permissions
                            .filter((p) => checkPermission(r.permissions, p.key))
                            .map((p) => p.label)
                            .join(' · ') || 'لا يوجد'}
                        </p>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* System Status */}
      <Card title="حالة النظام">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 text-center">
            <span className="material-icons-round text-primary text-3xl mb-2 block">cloud_done</span>
            <p className="text-xs text-slate-400 font-bold mb-1">اتصال Firebase</p>
            <Badge variant={isAuthenticated ? 'success' : 'danger'}>
              {isAuthenticated ? 'متصل' : 'غير متصل'}
            </Badge>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 text-center">
            <span className="material-icons-round text-primary text-3xl mb-2 block">inventory_2</span>
            <p className="text-xs text-slate-400 font-bold mb-1">المنتجات</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{products.length}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 text-center">
            <span className="material-icons-round text-primary text-3xl mb-2 block">precision_manufacturing</span>
            <p className="text-xs text-slate-400 font-bold mb-1">خطوط الإنتاج</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{productionLines.length}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 text-center">
            <span className="material-icons-round text-primary text-3xl mb-2 block">groups</span>
            <p className="text-xs text-slate-400 font-bold mb-1">المشرفين</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{supervisors.length}</p>
          </div>
        </div>
      </Card>

      {/* Firebase Info */}
      <Card title="معلومات قاعدة البيانات">
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">نوع قاعدة البيانات</span>
            <span className="text-sm font-bold text-slate-800 dark:text-white">Firebase Firestore</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">نوع المصادقة</span>
            <span className="text-sm font-bold text-slate-800 dark:text-white">بريد إلكتروني / كلمة مرور</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">نظام الصلاحيات</span>
            <span className="text-sm font-bold text-primary">ديناميكي (Firestore-backed RBAC)</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">عدد الأدوار</span>
            <span className="text-sm font-bold text-slate-800 dark:text-white">{roles.length}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">الإصدار</span>
            <span className="text-sm font-bold text-primary">2.0.0</span>
          </div>
        </div>
      </Card>

      {/* Collections */}
      <Card title="هيكل البيانات (Firestore Collections)">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: 'roles', label: 'الأدوار', icon: 'admin_panel_settings', fields: 'name, color, permissions' },
            { name: 'users', label: 'المستخدمين', icon: 'people', fields: 'roleId' },
            { name: 'products', label: 'المنتجات', icon: 'inventory_2', fields: 'name, model, code, openingBalance' },
            { name: 'production_lines', label: 'خطوط الإنتاج', icon: 'precision_manufacturing', fields: 'name, dailyWorkingHours, maxWorkers, status' },
            { name: 'supervisors', label: 'المشرفين', icon: 'person', fields: 'name' },
            { name: 'production_reports', label: 'تقارير الإنتاج', icon: 'bar_chart', fields: 'date, lineId, productId, supervisorId, quantities...' },
            { name: 'line_status', label: 'حالة الخطوط', icon: 'monitor_heart', fields: 'lineId, currentProductId, targetTodayQty' },
            { name: 'line_product_config', label: 'إعدادات المنتج-الخط', icon: 'settings_applications', fields: 'lineId, productId, standardAssemblyTime' },
          ].map((col) => (
            <div key={col.name} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-icons-round text-primary text-lg">{col.icon}</span>
                <span className="font-bold text-sm text-slate-800 dark:text-white">{col.label}</span>
              </div>
              <p className="text-xs text-slate-400 font-mono">{col.name}</p>
              <p className="text-xs text-slate-500 mt-2">{col.fields}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
