import React from 'react';
import { AlertTriangle, Barcode, Boxes, CircleDollarSign, Layers3, PackageCheck, Power } from 'lucide-react';
import type { MaterialCatalogRow, MaterialDataHealth } from '../lib/materialCatalog';

type SummaryFilter = MaterialDataHealth | 'all' | 'active';

type Props = {
  rows: MaterialCatalogRow[];
  activeFilter?: SummaryFilter;
  onFilter: (filter: SummaryFilter) => void;
};

export const MaterialsMasterSummary: React.FC<Props> = ({ rows, activeFilter, onFilter }) => {
  const count = (health: MaterialDataHealth) => rows.filter((row) => row.dataHealth.includes(health)).length;
  const cards: Array<{ key: SummaryFilter; label: string; value: number; icon: React.ElementType }> = [
    { key: 'all', label: 'إجمالي المواد', value: rows.length, icon: Boxes },
    { key: 'active', label: 'المواد النشطة', value: rows.filter((row) => row.isActive !== false).length, icon: Power },
    { key: 'missing_category', label: 'بلا فئة', value: count('missing_category'), icon: Layers3 },
    { key: 'missing_cost', label: 'بلا تكلفة', value: count('missing_cost'), icon: CircleDollarSign },
    { key: 'missing_barcode', label: 'بلا باركود', value: count('missing_barcode'), icon: Barcode },
    { key: 'missing_min_stock', label: 'بلا حد أدنى', value: count('missing_min_stock'), icon: AlertTriangle },
    { key: 'missing_bom', label: 'نصف مصنع بلا BOM', value: count('missing_bom'), icon: PackageCheck },
  ];

  return (
    <section aria-label="ملخص جاهزية ماستر المواد" className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      {cards.map(({ key, label, value, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={activeFilter === key}
          onClick={() => onFilter(key)}
          className={`rounded-xl border bg-card p-3 text-right transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeFilter === key ? 'border-primary ring-1 ring-primary/30' : 'border-border'}`}
        >
          <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {label}<Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <strong className="mt-2 block text-xl tabular-nums">{value.toLocaleString('ar-EG')}</strong>
        </button>
      ))}
    </section>
  );
};
