import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { withTenantPath } from '@/lib/tenantPaths';
import { QmsPage } from '../qms/QmsChrome';

const links = [
  ['/quality/dashboard', 'لوحة تحليلات الجودة'],
  ['/quality/line-analytics', 'تحليل سحب الخطوط'],
  ['/quality/pallets', 'استلام وفحص البالتات'],
  ['/quality/hourly-samples', 'عينات بالساعة'],
  ['/quality/line-samples', 'سحب عينات الخطوط'],
  ['/quality/summaries', 'ملخصات الجودة'],
  ['/quality/flowchart', 'مخطط الجودة'],
  ['/quality/reports', 'تقارير الجودة'],
  ['/quality/scrap', 'الهالك'],
  ['/quality/second-sort', 'تسليم الفرز الثاني'],
  ['/quality/second-sort-returns', 'إرجاع الفرز الثاني'],
  ['/quality/incoming/cartons', 'وارد الكراتين'],
  ['/quality/incoming/plastic', 'وارد البلاستيك'],
  ['/quality/settings', 'إعدادات الجودة'],
];

export const QualityHome: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  return (
    <QmsPage title="الجودة" subtitle="فحص AQL والعينات والهالك. قطاع الأجهزة المنزلية وقطاع السريا وسمان داخل الجودة وليس كأقسام موارد بشرية.">
      <div className="qms-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {links.map(([path, label]) => (
          <Link key={path} to={withTenantPath(tenantSlug, path)} className="qms-card" style={{ fontWeight: 800, color: '#9f1239' }}>{label}</Link>
        ))}
      </div>
    </QmsPage>
  );
};
