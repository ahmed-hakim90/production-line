import { forwardRef } from 'react';

export interface ReportShareCardProps {
  report: {
    productName: string;
    lineName: string;
    supervisorName: string;
    reportDate: string;
    status: 'مكتمل' | 'قيد التنفيذ' | 'موقف' | string;
    producedQty: number;
    wasteQty: number;
    workers: number;
    unitCost: number;
    workOrderNumber?: string;
    workOrderProgress?: number;
    hours: number;
    wastePercent: number;
    deviation: number;
    workerBreakdown: {
      production: number;
      packaging: number;
      quality: number;
      maintenance: number;
      external: number;
    };
  };
  companyName?: string;
  version?: string;
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  مكتمل: { bg: '#D1FAE5', color: '#065F46' },
  'قيد التنفيذ': { bg: '#FEF9C3', color: '#854D0E' },
  موقف: { bg: '#FEE2E2', color: '#991B1B' },
  in_progress: { bg: '#FEF9C3', color: '#854D0E' },
  completed: { bg: '#D1FAE5', color: '#065F46' },
};

const WORKER_DOTS = [
  { key: 'production', label: 'إنتاج', color: '#4F46E5' },
  { key: 'packaging', label: 'تغليف', color: '#059669' },
  { key: 'quality', label: 'جودة', color: '#D97706' },
  { key: 'maintenance', label: 'صيانة', color: '#64748B' },
  { key: 'external', label: 'خارجية', color: '#94A3B8' },
] as const;

export const ReportShareCard = forwardRef<HTMLDivElement, ReportShareCardProps>(
  ({ report, companyName = 'مؤسسة المغربي', version = 'v4.0.57' }, ref) => {
    const statusStyle = STATUS_STYLE[report.status] ?? { bg: '#F3F4F6', color: '#374151' };

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          fontFamily: "'Cairo', sans-serif",
          background: '#fff',
          borderRadius: '16px',
          overflow: 'hidden',
          maxWidth: '420px',
          border: '0.5px solid #E2E8F0',
          fontSize: '13px',
        }}
      >
        <div
          style={{
            background: '#4F46E5',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{companyName}</div>
            <div style={{ fontSize: '9px', color: '#C7D2FE', marginTop: '2px' }}>
              HAKIM PRODUCTION SYSTEM
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '3px',
            }}
          >
            <span
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '6px',
              }}
            >
              تقرير إنتاج
            </span>
            <span style={{ fontSize: '10px', color: '#C7D2FE' }}>{report.reportDate}</span>
          </div>
        </div>

        <div
          style={{
            padding: '10px 14px',
            background: '#F8FAFC',
            borderBottom: '0.5px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#0F172A',
              lineHeight: '1.3',
              flex: 1,
            }}
          >
            {report.productName}
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: '#4F46E5',
                marginRight: '6px',
              }}
            >
              {' '}
              - {report.lineName}
            </span>
          </div>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: '99px',
              fontSize: '10px',
              fontWeight: 700,
              flexShrink: 0,
              background: statusStyle.bg,
              color: statusStyle.color,
            }}
          >
            {report.status}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            borderBottom: '0.5px solid #F1F5F9',
          }}
        >
          {[
            { label: 'التاريخ', value: report.reportDate, accent: false },
            { label: 'خط الإنتاج', value: report.lineName, accent: true },
            { label: 'المشرف', value: report.supervisorName, accent: false },
          ].map((item, i) => (
            <div
              key={item.label}
              style={{
                padding: '8px 10px',
                borderLeft: i < 2 ? '0.5px solid #F1F5F9' : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <span style={{ fontSize: '9px', color: '#94A3B8' }}>{item.label}</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: item.accent ? '#4F46E5' : '#0F172A',
                }}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4,1fr)',
            borderBottom: '0.5px solid #F1F5F9',
          }}
        >
          {[
            { label: 'الكمية وحدة', value: report.producedQty, color: '#4F46E5' },
            {
              label: 'الهالك وحدة',
              value: report.wasteQty,
              color: report.wasteQty > 0 ? '#DC2626' : '#0F172A',
            },
            { label: 'العمال', value: report.workers, color: '#0F172A' },
            {
              label: 'تكلفة/وحدة ج.م',
              value: report.unitCost.toFixed(2),
              color: '#059669',
            },
          ].map((kpi, i) => (
            <div
              key={kpi.label}
              style={{
                padding: '10px 6px',
                textAlign: 'center',
                borderLeft: i < 3 ? '0.5px solid #F1F5F9' : 'none',
              }}
            >
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  lineHeight: '1',
                  color: kpi.color,
                }}
              >
                {typeof kpi.value === 'number' ? kpi.value.toLocaleString('ar-EG') : kpi.value}
              </div>
              <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '3px' }}>{kpi.label}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: '0.5px solid #F1F5F9',
          }}
        >
          <div style={{ padding: '10px 12px', borderLeft: '0.5px solid #F1F5F9' }}>
            <div
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#4F46E5',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: '2px',
                  height: '10px',
                  background: '#4F46E5',
                  borderRadius: '2px',
                }}
              />
              أمر الشغل
            </div>
            {[
              { label: 'رقم الأمر', value: report.workOrderNumber ?? '—' },
              {
                label: 'تقدم الأمر',
                value: report.workOrderProgress != null ? `${report.workOrderProgress}%` : '—',
              },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '3px 0',
                  borderBottom: '0.5px solid #F9FAFB',
                }}
              >
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>{row.label}</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: row.value === '—' ? '#94A3B8' : '#0F172A',
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          <div style={{ padding: '10px 12px' }}>
            <div
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#4F46E5',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: '2px',
                  height: '10px',
                  background: '#4F46E5',
                  borderRadius: '2px',
                }}
              />
              الإنتاج
            </div>
            {[
              { label: 'ساعات العمل', value: `${report.hours} ساعات`, accent: false },
              { label: 'نسبة الهالك', value: `${report.wastePercent}%`, accent: false },
              { label: 'الانحراف', value: `${report.deviation.toFixed(1)}%`, accent: true },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '3px 0',
                  borderBottom: '0.5px solid #F9FAFB',
                }}
              >
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>{row.label}</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: row.accent ? '#4F46E5' : '#0F172A',
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: '8px 12px',
            borderBottom: '0.5px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '9px', color: '#94A3B8', marginLeft: '2px' }}>العمالة:</span>
          {WORKER_DOTS.map((w) => (
            <span
              key={w.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 7px',
                background: '#F1F5F9',
                borderRadius: '99px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#475569',
              }}
            >
              <span
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: w.color,
                  flexShrink: 0,
                }}
              />
              {w.label}: {report.workerBreakdown[w.key]}
            </span>
          ))}
        </div>

        <div
          style={{
            padding: '8px 12px',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '9px', color: '#94A3B8' }}>تم الإنشاء آلياً — نظام إدارة الإنتاج</span>
          <span style={{ fontSize: '9px', fontWeight: 700, color: '#4F46E5' }}>HAKIM {version}</span>
        </div>
      </div>
    );
  },
);

ReportShareCard.displayName = 'ReportShareCard';
