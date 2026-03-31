import React from 'react';

/** Matches `Login.tsx` — left panel + container + mobile brand; optional panel background class. */
export const AuthShell: React.FC<{ children: React.ReactNode; panelClassName?: string }> = ({
  children,
  panelClassName,
}) => (
  <div className="erp-auth-page" dir="rtl">
    <div className={['erp-auth-panel', panelClassName].filter(Boolean).join(' ')}>
      <div className="erp-auth-panel-logo">
        <span className="material-icons-round" style={{ fontSize: 26, color: '#fff' }}>
          factory
        </span>
      </div>
      <div className="erp-auth-panel-name">HAKIMO ERP</div>
      <p className="erp-auth-panel-desc">نظام متكامل لإدارة الإنتاج والمخزون والموارد البشرية</p>
      <div className="erp-auth-panel-features">
        {[
          { icon: 'inventory_2', label: 'إدارة الإنتاج والمخزون' },
          { icon: 'groups', label: 'إدارة الموظفين والحضور' },
          { icon: 'bar_chart', label: 'تقارير وتحليلات مفصلة' },
          { icon: 'admin_panel_settings', label: 'نظام صلاحيات متقدم' },
        ].map((f) => (
          <div key={f.icon} className="erp-auth-panel-feature">
            <span className="material-icons-round">{f.icon}</span>
            <span>{f.label}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="erp-auth-container">
      <div className="erp-auth-brand">
        <div className="erp-auth-logo">
          <span className="material-icons-round" style={{ fontSize: 26 }}>
            factory
          </span>
        </div>
        <div className="erp-auth-app-name">HAKIMO ERP</div>
        <div className="erp-auth-app-subtitle">نظام إدارة الإنتاج</div>
      </div>
      {children}
    </div>
  </div>
);
