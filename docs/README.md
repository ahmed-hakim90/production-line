# Docs index / فهرس الوثائق

Bilingual short index. Technical detail lives in the linked English docs unless noted.

فهرس مختصر ثنائي اللغة. التفاصيل التقنية في الملفات الإنجليزية المرتبطة ما لم يُذكر غير ذلك.

## Architecture / المعمارية

| Doc | EN | AR summary |
|-----|----|------------|
| [ARCHITECTURE/overview.md](./ARCHITECTURE/overview.md) | Stack, modules, tenancy, settings, Inventory V2 | نظرة على المكدس والوحدات والعزل والإعدادات والمخزون V2 |
| [ARCHITECTURE/dependency-rules.md](./ARCHITECTURE/dependency-rules.md) | UI → usecase → service → Firebase | طبقات الاعتماد؛ الصفحات لا تكتب Firestore مباشرة |

## Security & settings / الأمان والإعدادات

| Doc | EN | AR summary |
|-----|----|------------|
| [security-tenancy.md](./security-tenancy.md) | P0 tenancy / privilege controls | ضوابط العزل والصلاحيات الحرجة |
| [settings-contract.md](./settings-contract.md) | `resolveSystemSettings`, operation paths, routing | عقد إعدادات النظام ومسارات العمليات |
| [TENANT_ISOLATION_CHECKLIST.md](./TENANT_ISOLATION_CHECKLIST.md) | Manual tenant isolation checks | قائمة تحقق يدوية لعزل المستأجر |

## Routing / التنقل

| Doc | EN | AR summary |
|-----|----|------------|
| [routing-and-navigation.md](./routing-and-navigation.md) | RouteErrorBoundary, tenant paths, chunk recovery | حدود الأخطاء ومسارات المستأجر واستعادة الـ chunks |

## Testing / الاختبارات

| Doc | EN | AR summary |
|-----|----|------------|
| [testing.md](./testing.md) | Harness, suites, rules tests | مجموعات الاختبار و`test:rules` |

## Migrations & deploy / الترحيل والنشر

| Doc | EN | AR summary |
|-----|----|------------|
| [migrations-backfills.md](./migrations-backfills.md) | Singleton settings, floor cutover, report snapshots | سكربتات الترحيل والقطع للإنتاج |
| [deployment.md](./deployment.md) | Compose rules, functions build, indexes, hosting | نشر القواعد والدوال والاستضافة |
| [rollback.md](./rollback.md) | Rules / hosting / functions rollback | ملاحظات التراجع |

## ADRs

| ADR | Topic |
|-----|--------|
| [adr/ADR-001-tenant-scoped-settings.md](./adr/ADR-001-tenant-scoped-settings.md) | Tenant-scoped singleton settings docs |
| [adr/ADR-002-server-owned-stock-mutations.md](./adr/ADR-002-server-owned-stock-mutations.md) | Server-owned stock mutations |
| [adr/ADR-003-functions-src-is-source-of-truth.md](./adr/ADR-003-functions-src-is-source-of-truth.md) | `functions/src` is source of truth |

## Onboarding / البدء

| Doc | EN | AR summary |
|-----|----|------------|
| [ONBOARDING.md](./ONBOARDING.md) | Day-1 setup (Node 20, env, smoke) | إعداد اليوم الأول ومسارات الدخان |
| Root [README.md](../README.md) | Product overview + local run | نظرة المنتج والتشغيل المحلي |

## Other existing docs / وثائق أخرى

- [FIREBASE_SCALE_READINESS_REPORT_AR.md](./FIREBASE_SCALE_READINESS_REPORT_AR.md) — تقييم جاهزية Firebase لحجم 7k صنف / 8k عميل / 100 يوزر + فواتير وHR وبصمة
- [BASELINE_HARDENING_REPORT.md](./BASELINE_HARDENING_REPORT.md) — hardening baseline (2026-08-03)
- [PROJECT_DOC.md](./PROJECT_DOC.md) — older project overview
- [handover/](./handover/) — ops handover routines
- [service-workflow.md](./service-workflow.md), [service-data-model.md](./service-data-model.md), [service-dashboard.md](./service-dashboard.md)
- Arabic product notes: `PROJECT_FULL_DOCUMENTATION_AR.md`, `cost-calculation-explained-ar.md`, `whatsapp-share-fix-ar.md`, `dead-code-cleanup-ar.md`
- Decision log (repo root): [`MIGRATION_DECISIONS_LOG.md`](../MIGRATION_DECISIONS_LOG.md)
