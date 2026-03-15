import { forwardRef } from 'react';

interface WorkerBreakdown {
  production: number;
  packaging: number;
  quality: number;
  maintenance: number;
  external: number;
}

export interface ReportShareCardProps {
  report: {
    productName: string;
    lineName: string;
    supervisorName: string;
    reportDate: string;
    status: string;
    producedQty: number;
    wasteQty: number;
    workers: number;
    unitCost: number;
    workOrderNumber?: string;
    workOrderProgress?: number;
    workOrderRemaining?: number;
    hours: number;
    wastePercent: number;
    deviation: number;
    workerBreakdown: WorkerBreakdown;
  };
  companyName?: string;
  version?: string;
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  مكتمل: { bg: '#D1FAE5', color: '#065F46', label: 'مكتمل' },
  'قيد التنفيذ': { bg: '#FEF9C3', color: '#854D0E', label: 'قيد التنفيذ' },
  in_progress: { bg: '#FEF9C3', color: '#854D0E', label: 'قيد التنفيذ' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'مكتمل' },
  موقف: { bg: '#FEE2E2', color: '#991B1B', label: 'موقف' },
  stopped: { bg: '#FEE2E2', color: '#991B1B', label: 'موقف' },
};

const rtl = {
  direction: 'rtl' as const,
  unicodeBidi: 'embed' as const,
  textAlign: 'right' as const,
};

const cell = (borderLeft = true, bg = '#fff') => ({
  padding: '9px 10px',
  borderLeft: borderLeft ? '0.5px solid #F1F5F9' : 'none',
  borderBottom: '0.5px solid #F1F5F9',
  display: 'flex' as const,
  flexDirection: 'column' as const,
  justifyContent: 'center' as const,
  gap: '3px',
  background: bg,
  ...rtl,
});

export const ReportShareCard = forwardRef<HTMLDivElement, ReportShareCardProps>(
  ({ report, companyName = 'مؤسسة المغربي', version = 'v4.0.57' }, ref) => {
    const status = STATUS_STYLE[report.status] ?? { bg: '#F3F4F6', color: '#374151', label: report.status };
    const remaining = report.workOrderRemaining;

    const WORKERS = [
      { key: 'production', label: 'إنتاج', color: '#4F46E5' },
      { key: 'packaging', label: 'تغليف', color: '#059669' },
      { key: 'quality', label: 'جودة', color: '#D97706' },
      { key: 'maintenance', label: 'صيانة', color: '#64748B' },
      { key: 'external', label: 'خارجية', color: '#94A3B8' },
    ] as const;

    return (
      <div
        ref={ref}
        id="share-card"
        style={{
          ...rtl,
          fontFamily: "'Cairo', 'Arial', sans-serif",
          background: '#fff',
          borderRadius: '16px',
          overflow: 'hidden',
          width: '420px',
          position: 'relative',
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
            ...rtl,
          }}
        >
          <div style={rtl}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', ...rtl }}>{companyName}</div>
            <div style={{ fontSize: '9px', color: '#C7D2FE', marginTop: '1px', ...rtl }}>HAKIM PRODUCTION SYSTEM</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
            <span
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                padding: '3px 15px',
                borderRadius: '6px',
                ...rtl,
              }}
            >
              تقرير إنتاج
            </span>
            <span style={{ fontSize: '10px', color: '#C7D2FE', ...rtl }}>{report.reportDate}</span>
          </div>
        </div>

        <div
          style={{
            padding: '11px 14px',
            borderBottom: '0.5px solid #E2E8F0',
            background: '#F8FAFC',
            ...rtl,
          }}
        >
          <div
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#0F172A',
              lineHeight: '1.35',
              marginBottom: '5px',
              ...rtl,
            }}
          >
            {report.productName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...rtl }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#4F46E5', ...rtl }}>{report.lineName}</span>
            <span style={{ color: '#CBD5E1', fontSize: '11px' }}>·</span>
            <span
              style={{
                padding: '2px 9px',
                borderRadius: '99px',
                fontSize: '10px',
                fontWeight: 700,
                background: status.bg,
                color: status.color,
                ...rtl,
              }}
            >
              {status.label}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div style={cell(true)}>
            <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>التاريخ</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', ...rtl }}>{report.reportDate}</span>
          </div>
          <div style={cell(true)}>
            <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>المشرف</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#0F172A', lineHeight: '1.3', ...rtl }}>
              {report.supervisorName}
            </span>
          </div>
          <div style={cell(false)}>
            <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>ساعات العمل</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', ...rtl }}>{report.hours} ساعات</span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4,1fr)',
            borderBottom: '0.5px solid #F1F5F9',
          }}
        >
          {[
            { label: 'الكمية وحدة', value: report.producedQty.toLocaleString('ar-EG'), color: '#4F46E5' },
            { label: 'الهالك', value: report.wasteQty.toString(), color: report.wasteQty > 0 ? '#DC2626' : '#0F172A' },
            { label: 'العمال', value: report.workers.toString(), color: '#0F172A' },
            { label: 'تكلفة/وحدة', value: report.unitCost.toFixed(2), color: '#059669' },
          ].map((kpi, i) => (
            <div
              key={i}
              style={{
                padding: '10px 6px',
                textAlign: 'center',
                borderLeft: i < 3 ? '0.5px solid #F1F5F9' : 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 800, color: kpi.color, lineHeight: '1', ...rtl }}>{kpi.value}</div>
              <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '3px', ...rtl }}>{kpi.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div style={cell(true)}>
            <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>نسبة الهالك</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', ...rtl }}>{report.wastePercent}%</span>
          </div>
          <div style={cell(true)}>
            <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>الانحراف</span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: report.deviation < -50 ? '#DC2626' : '#D97706',
                ...rtl,
              }}
            >
              {report.deviation.toFixed(1)}%
            </span>
          </div>
          <div style={cell(false)}>
            <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>تقدم الأمر</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#4F46E5', ...rtl }}>
              {report.workOrderProgress != null ? `${report.workOrderProgress}%` : '—'}
            </span>
          </div>
        </div>

        {report.workOrderNumber && (
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '0.5px solid #F1F5F9',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              ...rtl,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', ...rtl }}>
              <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>أمر الشغل</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#64748B',
                  fontFamily: 'monospace',
                  ...rtl,
                }}
              >
                {report.workOrderNumber}
              </span>
            </div>
            {remaining != null && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>المتبقي من الأمر</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#DC2626', lineHeight: '1', ...rtl }}>
                    {remaining.toLocaleString('ar-EG')}
                  </span>
                  <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>وحدة</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            padding: '8px 12px',
            borderBottom: '0.5px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flexWrap: 'wrap',
            ...rtl,
          }}
        >
          <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>العمالة:</span>
          {WORKERS.map((w) => (
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
                ...rtl,
              }}
            >
              <span
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: w.color,
                  flexShrink: 0,
                  display: 'inline-block',
                }}
              />
              {w.label}: {report.workerBreakdown[w.key as keyof WorkerBreakdown]}
            </span>
          ))}
        </div>

        <div
          style={{
            padding: '7px 12px',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            ...rtl,
          }}
        >
          <span style={{ fontSize: '9px', color: '#94A3B8', ...rtl }}>تم الإنشاء آلياً — نظام إدارة الإنتاج</span>
          <span style={{ fontSize: '9px', fontWeight: 700, color: '#4F46E5' }}>HAKIM {version}</span>
        </div>
      </div>
    );
  }
);

ReportShareCard.displayName = 'ReportShareCard';
