import React, { useEffect, useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { materialCategoryService, type MaterialCategory } from '../services/materialCategoryService';
import {
  buildCategoryTree,
  flattenCategoryTree,
} from '../../catalog/lib/categoryTree';

type Props = {
  value: string | null;
  onChange: (categoryId: string | null, breadcrumb: string) => void;
  disabled?: boolean;
  className?: string;
};

export const MaterialCategoryTreeSelect: React.FC<Props> = ({
  value,
  onChange,
  disabled = false,
  className = '',
}) => {
  const [flat, setFlat] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const tree = await materialCategoryService.getCategoryTree(true);
        if (!cancelled) setFlat(flattenCategoryTree(tree).map((n) => n.category));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayRows = useMemo(() => flattenCategoryTree(buildCategoryTree(flat)), [flat]);

  return (
    <Select
      value={value ?? ''}
      disabled={disabled || loading || displayRows.length === 0}
      onValueChange={(categoryId) => {
        const category = flat.find((item) => item.id === categoryId);
        onChange(categoryId, category?.name || '');
      }}
    >
      <SelectTrigger className={className} aria-label="فئة المادة">
        <SelectValue
          placeholder={
            loading
              ? 'جاري تحميل الفئات...'
              : displayRows.length === 0
                ? 'لا توجد فئات متاحة'
                : 'اختر فئة المادة'
          }
        />
      </SelectTrigger>
      <SelectContent dir="rtl" position="popper" className="max-h-72">
        {displayRows.map(({ category, depth }) => {
          if (!category.id) return null;
          const hasCode = Boolean(category.code?.trim());
          return (
            <SelectItem key={category.id} value={category.id} disabled={!hasCode}>
              <span
                className="flex min-w-0 items-center gap-2"
                style={{ paddingInlineStart: `${depth * 16}px` }}
              >
                <span className="truncate">{category.name}</span>
                <span
                  className={`font-mono text-xs ${hasCode ? 'text-muted-foreground' : 'text-destructive'}`}
                  dir="ltr"
                >
                  {hasCode ? category.code : 'بدون كود'}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};
