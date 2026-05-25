# UI Skeleton Guidelines

## الهدف

توحيد تجربة التحميل على مستويين:

1. تحميل الـ route chunk (lazy route fallback)
2. تحميل بيانات الصفحة بعد mount

## المكوّنات الأساسية

- `PageContentSkeleton` من `src/shared/ui/skeletons/pageSkeletons.tsx`
- `PageRouteFallback` يحدد `variant` تلقائياً حسب المسار
- `TableSkeleton` للاستخدام داخل الجداول
- `PageLoadingGate` لسيناريو `if (loading) return ...` بشكل موحّد

## Variants

- `list`: صفحات قوائم/جداول
- `dashboard`: لوحات مؤشرات
- `detail`: صفحات تفاصيل
- `form`: صفحات إنشاء/إعدادات

## الاستخدام

```tsx
if (loading) {
  return <PageContentSkeleton variant="list" showFilters tableRows={8} />;
}
```

```tsx
if (loading) {
  return <PageContentSkeleton variant="dashboard" kpiCount={6} />;
}
```

## Route metadata (اختياري)

يمكن تحديد skeleton لكل route عبر:

```ts
{ path: '/quick-action', permission: 'quickAction.view', component: QuickAction, skeleton: 'form' }
```

إذا لم يتم التحديد، يتم استخدام heuristic من `lib/routeSkeletonMap.ts`.

## الوصولية والحركة

- كل skeleton يعلن `aria-busy="true"` و `aria-label` عبر i18n (`ui.loadingPageContent`)
- تم دعم `prefers-reduced-motion` عبر `motion-reduce:animate-none` في primitive `Skeleton`

## checklist مراجعة سريعة

- [ ] الانتقال بين الصفحات لا يعرض فراغ/وميض
- [ ] نوع skeleton مناسب لنوع الصفحة
- [ ] RTL سليم
- [ ] ألوان skeleton تتبع متغيرات الثيم (`--color-border`, `--color-card`)
- [ ] لا توجد استثناءات lint/typecheck
