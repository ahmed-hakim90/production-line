import React, { useEffect, useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { categoryService, type ProductCategory } from '../services/categoryService';
import {
  buildCategoryTree,
  flattenCategoryTree,
  formatCategoryBreadcrumb,
} from '../lib/categoryTree';

type Props = {
  id?: string;
  value: string | null;
  onChange: (categoryId: string | null, breadcrumb: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

export const CategoryTreeSelect: React.FC<Props> = ({
  id,
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = 'اختر التصنيف',
  className = '',
}) => {
  const [flat, setFlat] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadFailed(false);
      try {
        const tree = await categoryService.getCategoryTree(true);
        if (!cancelled) {
          setFlat(flattenCategoryTree(tree).map((n) => n.category));
        }
      } catch {
        if (!cancelled) {
          setFlat([]);
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayRows = useMemo(() => flattenCategoryTree(buildCategoryTree(flat)), [flat]);

  const breadcrumb = useMemo(
    () => (value ? formatCategoryBreadcrumb(flat, value) : ''),
    [flat, value],
  );

  return (
    <div className={className}>
      <Select
        value={value ?? ''}
        required={required}
        disabled={disabled || loading || loadFailed || displayRows.length === 0}
        onValueChange={(categoryId) =>
          onChange(categoryId, formatCategoryBreadcrumb(flat, categoryId))
        }
      >
        <SelectTrigger id={id} aria-label="فئة المنتج" aria-required={required}>
          <SelectValue
            placeholder={
              loading
                ? 'جاري تحميل الفئات...'
                : loadFailed
                  ? 'تعذر تحميل الفئات'
                  : displayRows.length === 0
                    ? 'لا توجد فئات متاحة'
                    : placeholder
            }
          />
        </SelectTrigger>
        <SelectContent dir="rtl" position="popper" className="max-h-72">
          {displayRows.map(({ category, depth }) => {
            if (!category.id) return null;
            const id = category.id;
            const itemBreadcrumb = formatCategoryBreadcrumb(flat, id);
            return (
              <SelectItem
                key={id}
                value={id}
                textValue={itemBreadcrumb || category.name}
              >
                <span
                  className="block min-w-0 truncate"
                  style={{ paddingInlineStart: `${depth * 16}px` }}
                >
                  {category.name}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {breadcrumb ? (
        <p className="mt-1 text-xs text-muted-foreground" dir="rtl">
          {breadcrumb}
        </p>
      ) : null}
    </div>
  );
};
