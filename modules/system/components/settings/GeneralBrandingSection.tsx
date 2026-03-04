import React from 'react';
import { Card } from '../UI';
import type { BrandingSettings } from '../../../../types';

type SelectOption = { value: string; label: string };

type GeneralBrandingSectionProps = {
  isAdmin: boolean;
  localBranding: BrandingSettings;
  setLocalBranding: React.Dispatch<React.SetStateAction<BrandingSettings>>;
  uploadingLogo: boolean;
  brandingLogoRef: React.RefObject<HTMLInputElement | null>;
  onBrandingLogoUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  currencies: SelectOption[];
  timezones: SelectOption[];
};

export const GeneralBrandingSection: React.FC<GeneralBrandingSectionProps> = ({
  isAdmin,
  localBranding,
  setLocalBranding,
  uploadingLogo,
  brandingLogoRef,
  onBrandingLogoUpload,
  currencies,
  timezones,
}) => {
  if (!isAdmin) return null;

  return (
    <Card title="هوية المصنع">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-primary">factory</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--color-text)]">اسم المصنع</p>
              <p className="text-xs text-slate-400">يظهر في التقارير والواجهة</p>
            </div>
          </div>
          <input
            type="text"
            className="w-full sm:w-72 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            value={localBranding.factoryName}
            onChange={(e) => setLocalBranding((p) => ({ ...p, factoryName: e.target.value }))}
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-primary">image</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--color-text)]">شعار المصنع</p>
              <p className="text-xs text-slate-400">PNG أو JPG — يظهر في الواجهة والتقارير</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {localBranding.logoUrl && (
              <img src={localBranding.logoUrl} alt="logo" className="w-12 h-12 rounded-[var(--border-radius-base)] object-contain border border-[var(--color-border)] bg-[var(--color-card)]" />
            )}
            <input ref={brandingLogoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onBrandingLogoUpload} />
            <button
              onClick={() => brandingLogoRef.current?.click()}
              disabled={uploadingLogo}
              className="px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {uploadingLogo ? <span className="material-icons-round animate-spin text-sm">refresh</span> : <span className="material-icons-round text-sm">upload</span>}
              {localBranding.logoUrl ? 'تغيير' : 'رفع'}
            </button>
            {localBranding.logoUrl && (
              <button onClick={() => setLocalBranding((p) => ({ ...p, logoUrl: '' }))} className="px-3 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-bold bg-rose-50 dark:bg-rose-900/10 text-rose-600 hover:bg-rose-100 transition-all">
                <span className="material-icons-round text-sm">delete</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-primary">payments</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--color-text)]">العملة</p>
              <p className="text-xs text-slate-400">العملة المستخدمة في التكاليف والتقارير</p>
            </div>
          </div>
          <select
            className="w-full sm:w-64 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            value={localBranding.currency}
            onChange={(e) => setLocalBranding((p) => ({ ...p, currency: e.target.value }))}
          >
            {currencies.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-primary">schedule</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--color-text)]">المنطقة الزمنية</p>
              <p className="text-xs text-slate-400">تحدد توقيت التقارير والعمليات</p>
            </div>
          </div>
          <select
            className="w-full sm:w-64 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            value={localBranding.timezone}
            onChange={(e) => setLocalBranding((p) => ({ ...p, timezone: e.target.value }))}
          >
            {timezones.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
          </select>
        </div>
      </div>
    </Card>
  );
};
