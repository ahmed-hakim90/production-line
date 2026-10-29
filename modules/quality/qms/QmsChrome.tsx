import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@/components/UI';
import { useEnsureStoreData } from '@/hooks/useEnsureStoreData';
import { useAppStore } from '@/store/useAppStore';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualitySettingsService } from '../services/qualitySettingsService';
import type { QualityReason, QualitySectorTag, QualityShiftOption } from '../model';
import { QUALITY_SECTORS, type QualitySector } from '../domain/sector';
import './qms.css';

export function QmsPage(props: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="qms-page">
      <div className="qms-band" />
      <div className="qms-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 className="qms-title">{props.title}</h1>
          {props.subtitle ? <p className="qms-muted">{props.subtitle}</p> : null}
        </div>
        <div className="qms-row">{props.actions}</div>
      </div>
      {props.children}
    </div>
  );
}

export function useQualityMasters() {
  const referenceLoading = useEnsureStoreData(['products', 'lines', 'employees', 'workOrders']);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s._rawLines);
  const employees = useAppStore((s) => s._rawEmployees);
  const workOrders = useAppStore((s) => s.workOrders);
  const [shifts, setShifts] = useState<QualityShiftOption[]>([]);
  const [tags, setTags] = useState<QualitySectorTag[]>([]);
  const [reasons, setReasons] = useState<QualityReason[]>([]);
  const [auxError, setAuxError] = useState('');

  const reloadAux = React.useCallback(() => {
    void Promise.allSettled([
      qualitySettingsService.listShifts(),
      qualitySettingsService.listSectorTags(),
      qualitySettingsService.listReasons(),
    ]).then(([nextShifts, nextTags, nextReasons]) => {
      if (nextShifts.status === 'fulfilled') setShifts(nextShifts.value);
      if (nextTags.status === 'fulfilled') setTags(nextTags.value);
      if (nextReasons.status === 'fulfilled') setReasons(nextReasons.value.filter((reason) => reason.isActive !== false));
      const failed = [nextShifts, nextTags, nextReasons].find((result) => result.status === 'rejected');
      setAuxError(failed && failed.status === 'rejected' ? qualityUserMessage(failed.reason, 'تعذر تحميل إعدادات الجودة') : '');
    });
  }, []);

  useEffect(() => { reloadAux(); }, [reloadAux]);

  const sectorOf = (entityType: 'product' | 'line', entityId: string): QualitySector | null =>
    tags.find((tag) => tag.entityType === entityType && tag.entityId === entityId)?.sector ?? null;

  const manufactured = useMemo(
    () => products.filter((product) => product.isManufactured !== false && product.id),
    [products],
  );
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive !== false && employee.id),
    [employees],
  );

  return {
    referenceLoading,
    products: manufactured,
    lines: lines.filter((line) => line.id),
    employees: activeEmployees,
    workOrders: workOrders.filter((order) => order.id),
    shifts,
    reasons,
    sectorOf,
    auxError,
    reloadAux,
  };
}

export function matchesSector(
  selected: QualitySector | 'all',
  tag: QualitySector | null,
): boolean {
  if (selected === 'all') return true;
  return tag == null || tag === selected;
}

export function SectorSwitch(props: { value: QualitySector | 'all'; onChange: (value: QualitySector | 'all') => void }) {
  const options: Array<QualitySector | 'all'> = ['all', 'home', 'seria'];
  const labels: Record<string, string> = { all: 'المصنع بالكامل', home: 'الأجهزة المنزلية', seria: 'قسم السريا' };
  return (
    <div className="qms-row">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={props.value === option ? 'qms-btn qms-btn-primary' : 'qms-btn qms-btn-ghost'}
          onClick={() => props.onChange(option)}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

export function MasterSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; keywords?: string }>;
  placeholder: string;
}) {
  return (
    <label style={{ minWidth: 220, flex: 1 }}>
      <span className="qms-label">{props.label}</span>
      <SearchableSelect
        value={props.value}
        onChange={props.onChange}
        placeholder={props.placeholder}
        searchPlaceholder="بحث بالاسم أو الرمز"
        options={props.options}
      />
    </label>
  );
}

export { QUALITY_SECTORS };
