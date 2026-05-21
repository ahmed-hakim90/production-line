import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { categoryService, type ProductCategory } from '../services/categoryService';
import {
  buildCategoryTree,
  flattenCategoryTree,
  formatCategoryBreadcrumb,
} from '../lib/categoryTree';

type Props = {
  value: string | null;
  onChange: (categoryId: string | null, breadcrumb: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

export const CategoryTreeSelect: React.FC<Props> = ({
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = 'اختر التصنيف',
  className = '',
}) => {
  const [flat, setFlat] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const tree = await categoryService.getCategoryTree(true);
        if (!cancelled) {
          setFlat(flattenCategoryTree(tree).map((n) => n.category));
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

  const visibleRows = useMemo(() => {
    const visible = new Set<string>();
    for (const { category, depth } of displayRows) {
      if (!category.id) continue;
      if (depth === 0) {
        visible.add(category.id);
        continue;
      }
      const path = category.path ?? [];
      const ancestorsVisible = path.every((aid) => expanded.has(aid));
      if (ancestorsVisible) visible.add(category.id);
    }
    return displayRows.filter(({ category }) => category.id && visible.has(category.id));
  }, [displayRows, expanded]);

  const breadcrumb = useMemo(
    () => (value ? formatCategoryBreadcrumb(flat, value) : ''),
    [flat, value],
  );

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasChildren = (id: string) => flat.some((c) => c.parentId === id);

  if (loading) {
    return <p className="text-sm text-slate-500">جاري تحميل التصنيفات...</p>;
  }

  return (
    <div className={className}>
      <div
        className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        role="listbox"
        aria-required={required}
      >
        {visibleRows.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">{placeholder}</p>
        ) : (
          visibleRows.map(({ category, depth }) => {
            if (!category.id) return null;
            const id = category.id;
            const isSelected = value === id;
            const childExists = hasChildren(id);
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                className={`flex w-full items-center gap-1 px-2 py-2 text-right text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  isSelected
                    ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : ''
                }`}
                style={{ paddingRight: `${8 + depth * 16}px` }}
                onClick={() => onChange(id, formatCategoryBreadcrumb(flat, id))}
              >
                {childExists ? (
                  <span
                    className="inline-flex shrink-0 rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                    onClick={(e) => toggleExpand(id, e)}
                    role="presentation"
                  >
                    {expanded.has(id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                ) : (
                  <span className="w-5 shrink-0" />
                )}
                <span className="flex-1 truncate">{category.name}</span>
              </button>
            );
          })
        )}
      </div>
      {breadcrumb ? (
        <p className="mt-1 text-xs text-slate-500" dir="rtl">
          {breadcrumb}
        </p>
      ) : null}
      {required && !value ? (
        <p className="mt-1 text-xs text-amber-600">التصنيف مطلوب</p>
      ) : null}
    </div>
  );
};
