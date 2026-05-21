import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { materialCategoryService, type MaterialCategory } from '../services/materialCategoryService';
import {
  buildCategoryTree,
  flattenCategoryTree,
  formatCategoryBreadcrumb,
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const visibleRows = useMemo(() => {
    const visible = new Set<string>();
    for (const { category, depth } of displayRows) {
      if (!category.id) continue;
      if (depth === 0) {
        visible.add(category.id);
        continue;
      }
      const path = category.path ?? [];
      if (path.every((aid) => expanded.has(aid))) visible.add(category.id);
    }
    return displayRows.filter(({ category }) => category.id && visible.has(category.id));
  }, [displayRows, expanded]);

  const breadcrumb = useMemo(
    () => (value ? formatCategoryBreadcrumb(flat, value) : ''),
    [flat, value],
  );

  if (loading) return <p className="text-sm text-slate-500">جاري تحميل الفئات...</p>;

  return (
    <div className={className}>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {visibleRows.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">لا توجد فئات — أضفها من فئات المواد</p>
        ) : (
          visibleRows.map(({ category, depth }) => {
            if (!category.id) return null;
            const id = category.id;
            const hasKids = flat.some((c) => c.parentId === id);
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                className={`flex w-full items-center gap-1 px-2 py-2 text-right text-sm hover:bg-slate-50 ${
                  value === id ? 'bg-blue-50 font-medium text-blue-700' : ''
                }`}
                style={{ paddingRight: `${8 + depth * 16}px` }}
                onClick={() => onChange(id, formatCategoryBreadcrumb(flat, id))}
              >
                {hasKids ? (
                  <span
                    className="inline-flex shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                    role="presentation"
                  >
                    {expanded.has(id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
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
    </div>
  );
};
