
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { usePermission, useCurrentRole, SIDEBAR_ITEMS } from '../utils/permissions';

const Sidebar: React.FC = () => {
  const can = usePermission();
  const { roleName, roleColor, isReadOnly } = useCurrentRole();
  const roles = useAppStore((s) => s.roles);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const switchRole = useAppStore((s) => s.switchRole);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  return (
    <aside className="w-64 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col fixed h-full z-50">
      <div className="p-6 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white shadow-lg shadow-primary/30">
          <span className="material-icons-round">factory</span>
        </div>
        <div>
          <h1 className="font-bold text-xl tracking-tight text-primary">HAKIMO</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">نظام إدارة الإنتاج</p>
        </div>
      </div>

      {/* Read-only banner */}
      {isReadOnly && (
        <div className="mx-4 mt-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
          <span className="material-icons-round text-amber-500 text-sm">visibility</span>
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">وضع القراءة فقط</span>
        </div>
      )}

      <nav className="flex-1 p-4 space-y-2 mt-4">
        {SIDEBAR_ITEMS.filter((item) => can(item.permission)).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary'
              }`
            }
          >
            <span className="material-icons-round text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User card with role selector */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800">
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            className="w-full bg-slate-50 dark:bg-slate-800 p-3 rounded-xl flex items-center gap-3 hover:ring-2 hover:ring-primary/20 transition-all text-right"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="material-icons-round text-primary text-xl">person</span>
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-bold truncate">المستخدم</p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${roleColor}`}>
                {roleName}
              </span>
            </div>
            <span className="material-icons-round text-slate-400 text-sm">
              {roleMenuOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {/* Role dropdown */}
          {roleMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden z-50">
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">تبديل الدور</p>
              </div>
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { switchRole(r.id!); setRoleMenuOpen(false); }}
                  className={`w-full px-4 py-3 text-right flex items-center gap-3 transition-all text-sm ${
                    r.id === userRoleId
                      ? 'bg-primary/5 text-primary font-bold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${r.color}`}>
                    {r.name}
                  </span>
                  {r.id === userRoleId && (
                    <span className="material-icons-round text-primary text-sm mr-auto">check</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

const Header: React.FC = () => {
  const { isReadOnly } = useCurrentRole();

  return (
    <header className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-8 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-center bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-full w-96 group focus-within:ring-2 focus-within:ring-primary/20 transition-all">
        <span className="material-icons-round text-slate-400 ml-2">search</span>
        <input
          className="bg-transparent border-none focus:ring-0 text-sm w-full font-medium placeholder-slate-400 text-slate-700 dark:text-slate-200"
          placeholder="البحث عن منتج أو طلبية أو خط إنتاج..."
          type="text"
        />
      </div>
      <div className="flex items-center gap-5">
        {isReadOnly && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <span className="material-icons-round text-sm">lock</span>
            قراءة فقط
          </span>
        )}
        <button className="relative p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors group">
          <span className="material-icons-round">notifications</span>
          <span className="absolute top-2 left-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white group-hover:scale-125 transition-transform"></span>
        </button>
        <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1"></div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">التاريخ الحالي</span>
          <div className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
             <span>{new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
             <span className="material-icons-round text-primary text-sm">calendar_today</span>
          </div>
        </div>
      </div>
    </header>
  );
};

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-background dark:bg-background-dark text-slate-800 dark:text-slate-200">
      <Sidebar />
      <main className="flex-1 mr-64 flex flex-col">
        <Header />
        <div className="p-8 flex-1 animate-in fade-in duration-500">
          {children}
        </div>
        <footer className="mt-auto py-6 px-8 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400 text-sm font-medium">
          <p>© {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              <span>اتصال قاعدة البيانات مستقر</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(19,146,236,0.5)]"></span>
              <span>تزامن Firestore نشط</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};
