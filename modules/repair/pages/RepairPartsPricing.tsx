import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { withTenantPath } from '@/lib/tenantPaths';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { materialService } from '../../manufacturing/services/materialService';
import {
  type Material,
} from '../../manufacturing/types';
import { MATERIAL_UPDATE_PATHS } from '../../system/lib/operationPathSettings';
import { isRepairPartsPricingMaterial } from '../lib/repairPartsPricingMaterials';
import { planMaterialSalePriceBackfill } from '../lib/repairMaterialSalePriceBackfill';
import { repairBranchService } from '../services/repairBranchService';
import { sparePartsService } from '../services/sparePartsService';
import { normalizeRepairSalePrice } from '../utils/sparePartPricing';

const PAGE_SIZE = 20;

type PriceField = 'consumer' | 'trader' | 'cost';

type DraftRow = {
  consumer: string;
  trader: string;
  cost: string;
};

const PRICE_FIELDS: PriceField[] = ['consumer', 'trader', 'cost'];

const FIELD_LABELS: Record<PriceField, string> = {
  consumer: 'سعر المستهلك',
  trader: 'سعر التاجر',
  cost: 'سعر التكلفة',
};

function moneyDraft(value: unknown): string {
  const price = normalizeRepairSalePrice(value);
  return price > 0 ? String(price) : '';
}

function draftFromMaterial(material: Material): DraftRow {
  return {
    consumer: moneyDraft(material.defaultSalePrice),
    trader: moneyDraft(material.traderSalePrice),
    cost: moneyDraft(material.purchaseCost),
  };
}

function draftsFromMaterials(rows: Material[]): Record<string, DraftRow> {
  const next: Record<string, DraftRow> = {};
  for (const material of rows) {
    const id = String(material.id || '').trim();
    if (!id) continue;
    next[id] = draftFromMaterial(material);
  }
  return next;
}

function materialFieldValue(material: Material, field: PriceField): number {
  if (field === 'consumer') return normalizeRepairSalePrice(material.defaultSalePrice);
  if (field === 'trader') return normalizeRepairSalePrice(material.traderSalePrice);
  return normalizeRepairSalePrice(material.purchaseCost);
}

function patchPayload(field: PriceField, next: number): Partial<Material> {
  if (field === 'consumer') return { defaultSalePrice: next };
  if (field === 'trader') return { traderSalePrice: next };
  return { purchaseCost: next };
}

function inputKey(materialId: string, field: PriceField): string {
  return `${materialId}:${field}`;
}

export const RepairPartsPricing: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const canManagePricing = can('repair.pricing.manage');

  const [materials, setMaterials] = useState<Material[]>([]);
  const [draftPrices, setDraftPrices] = useState<Record<string, DraftRow>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [savingKeys, setSavingKeys] = useState<Record<string, true>>({});
  const [backfilling, setBackfilling] = useState(false);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const savingKeysRef = useRef<Record<string, true>>({});
  const skipBlurSaveKeysRef = useRef<Set<string>>(new Set());
  const pendingFocusKey = useRef<string | null>(null);
  const materialsRef = useRef(materials);
  const draftPricesRef = useRef(draftPrices);
  materialsRef.current = materials;
  draftPricesRef.current = draftPrices;

  const load = useCallback(async () => {
    if (!canManagePricing) return;
    setLoading(true);
    try {
      const rows = await materialService.getAll();
      const list = rows.filter(isRepairPartsPricingMaterial);
      setMaterials(list);
      setDraftPrices(draftsFromMaterials(list));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر تحميل المكونات للتسعير.');
      setMaterials([]);
      setDraftPrices({});
    } finally {
      setLoading(false);
    }
  }, [canManagePricing]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((material) => (
      String(material.name || '').toLowerCase().includes(q)
      || String(material.code || '').toLowerCase().includes(q)
      || String(material.categoryName || '').toLowerCase().includes(q)
    ));
  }, [materials, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const unpricedCount = useMemo(
    () => materials.filter((m) => !(normalizeRepairSalePrice(m.defaultSalePrice) > 0)).length,
    [materials],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  const focusPriceInput = useCallback((materialId: string, field: PriceField) => {
    const el = inputRefs.current.get(inputKey(materialId, field));
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const patchMaterialField = useCallback((materialId: string, field: PriceField, next: number) => {
    const draft = next > 0 ? String(next) : '';
    materialsRef.current = materialsRef.current.map((material) => {
      if (material.id !== materialId) return material;
      if (field === 'consumer') return { ...material, defaultSalePrice: next };
      if (field === 'trader') return { ...material, traderSalePrice: next };
      return { ...material, purchaseCost: next };
    });
    const prevDraft = draftPricesRef.current[materialId] ?? {
      consumer: '',
      trader: '',
      cost: '',
    };
    draftPricesRef.current = {
      ...draftPricesRef.current,
      [materialId]: { ...prevDraft, [field]: draft },
    };
    setMaterials(materialsRef.current);
    setDraftPrices(draftPricesRef.current);
  }, []);

  const saveField = useCallback(async (
    materialId: string,
    field: PriceField,
  ): Promise<boolean> => {
    const key = inputKey(materialId, field);
    if (!canManagePricing || !materialId || savingKeysRef.current[key]) return false;

    const material = materialsRef.current.find((row) => row.id === materialId);
    if (!material) return false;

    const draftRow = draftPricesRef.current[materialId] ?? draftFromMaterial(material);
    const raw = draftRow[field];
    const asNumber = Number(raw);
    if (raw !== '' && (!Number.isFinite(asNumber) || asNumber < 0)) {
      toast.error('أدخل سعرًا صالحًا.');
      return false;
    }

    const next = normalizeRepairSalePrice(raw);
    const current = materialFieldValue(material, field);
    if (next === current) return true;

    savingKeysRef.current = { ...savingKeysRef.current, [key]: true };
    setSavingKeys(savingKeysRef.current);
    try {
      await materialService.update(
        materialId,
        patchPayload(field, next),
        { path: MATERIAL_UPDATE_PATHS.repairPartsPricing },
      );
      patchMaterialField(materialId, field, next);
      return true;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر حفظ التسعير.');
      return false;
    } finally {
      const { [key]: _removed, ...rest } = savingKeysRef.current;
      savingKeysRef.current = rest;
      setSavingKeys(rest);
    }
  }, [canManagePricing, patchMaterialField]);

  // After page advance from last-row Enter, focus the pending input.
  useEffect(() => {
    const key = pendingFocusKey.current;
    if (!key || loading) return;
    pendingFocusKey.current = null;
    const [materialId, field] = key.split(':') as [string, PriceField];
    if (!materialId || !PRICE_FIELDS.includes(field)) return;
    focusPriceInput(materialId, field);
  }, [paged, loading, focusPriceInput, page]);

  const onPriceKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
    materialId: string,
    field: PriceField,
    rowIndexOnPage: number,
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const key = inputKey(materialId, field);
    skipBlurSaveKeysRef.current.add(key);
    const saved = await saveField(materialId, field);
    if (!saved) {
      skipBlurSaveKeysRef.current.delete(key);
      focusPriceInput(materialId, field);
      return;
    }

    const fieldIndex = PRICE_FIELDS.indexOf(field);
    const nextField = PRICE_FIELDS[fieldIndex + 1];
    if (nextField) {
      focusPriceInput(materialId, nextField);
      return;
    }

    const nextRow = paged[rowIndexOnPage + 1];
    if (nextRow?.id) {
      focusPriceInput(nextRow.id, 'consumer');
      return;
    }
    if (safePage < totalPages) {
      pendingFocusKey.current = `${paged[0]?.id || ''}:consumer`;
      // Will focus first of next page after page change; store intended first of next page.
      const nextPageFirst = filtered[(safePage) * PAGE_SIZE];
      if (nextPageFirst?.id) {
        pendingFocusKey.current = inputKey(nextPageFirst.id, 'consumer');
      }
      setPage(safePage + 1);
      return;
    }
    skipBlurSaveKeysRef.current.delete(key);
  };

  const backfillFromBranchCatalog = async () => {
    if (!canManagePricing || backfilling) return;
    setBackfilling(true);
    try {
      const branches = await repairBranchService.list();
      const branchIds = branches.map((b) => String(b.id || '').trim()).filter(Boolean);
      const parts = await sparePartsService.listPartsForBranches(branchIds);
      const plan = planMaterialSalePriceBackfill({ materials, parts });
      if (plan.length === 0) {
        toast.success('لا يوجد أسعار فروع لنقلها — إما الماستر مسعّر أو الكتالوج فارغ.');
        return;
      }
      let updated = 0;
      for (const item of plan) {
        await materialService.update(
          item.materialId,
          { defaultSalePrice: item.nextSalePrice },
          { path: MATERIAL_UPDATE_PATHS.repairPartsPricing },
        );
        patchMaterialField(item.materialId, 'consumer', item.nextSalePrice);
        updated += 1;
      }
      toast.success(`تم ترحيل سعر المستهلك لـ ${updated} مكوّن من كتالوج الفروع إلى الماستر.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'تعذر ترحيل أسعار الفروع.');
    } finally {
      setBackfilling(false);
    }
  };

  if (!canManagePricing) {
    return (
      <div className="erp-ds-clean space-y-4 p-4 md:p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية تسعير قطع الغيار.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-ds-clean space-y-4 p-4 md:p-6">
      <PageHeader
        title="تسعير قطع الغيار"
        subtitle="مكوّنات الماستر التي يبدأ كودها بـ MAT — سعر المستهلك والتاجر والتكلفة. Enter ينتقل للحقل التالي."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={loading || backfilling || unpricedCount === 0}
              onClick={() => void backfillFromBranchCatalog()}
            >
              {backfilling ? 'جاري الترحيل…' : 'ترحيل أسعار الفروع'}
            </Button>
            <Link to={withTenantPath(tenantSlug, '/repair/parts')}>
              <Button variant="outline">مخزون الفروع</Button>
            </Link>
          </div>
        )}
      />

      <Card>
        <SmartFilterBar
          pageId="repair-parts-pricing"
          searchPlaceholder="ابحث بالاسم أو الكود أو الفئة..."
          searchValue={search}
          onSearchChange={setSearch}
          extra={(
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              تحديث
            </Button>
          )}
        />
        <CardContent className="pt-0">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">جاري التحميل…</p>
          ) : (
            <div className="rounded border overflow-x-auto">
              <table className="erp-table w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th p-2 text-right">المكوّن</th>
                    <th className="erp-th p-2 text-right">الكود</th>
                    <th className="erp-th p-2 text-right">الفئة</th>
                    <th className="erp-th p-2 text-right w-32">{FIELD_LABELS.consumer}</th>
                    <th className="erp-th p-2 text-right w-32">{FIELD_LABELS.trader}</th>
                    <th className="erp-th p-2 text-right w-32">{FIELD_LABELS.cost}</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((material, rowIndex) => {
                    const id = String(material.id || '');
                    const draft = draftPrices[id] ?? draftFromMaterial(material);
                    return (
                      <tr key={id} className="border-t">
                        <td className="p-2 font-medium">{material.name}</td>
                        <td className="p-2">{material.code || '—'}</td>
                        <td className="p-2">{material.categoryName || '—'}</td>
                        {PRICE_FIELDS.map((field) => {
                          const key = inputKey(id, field);
                          const saving = Boolean(savingKeys[key]);
                          return (
                            <td key={field} className="p-2">
                              <Input
                                ref={(el) => {
                                  if (!id) return;
                                  if (el) inputRefs.current.set(key, el);
                                  else inputRefs.current.delete(key);
                                }}
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className="h-8 w-28 tabular-nums"
                                aria-label={`${FIELD_LABELS[field]} — ${material.name || material.code || id}`}
                                value={draft[field]}
                                disabled={saving || backfilling}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setDraftPrices((prev) => {
                                    const next = {
                                      ...prev,
                                      [id]: {
                                        ...(prev[id] ?? draftFromMaterial(material)),
                                        [field]: value,
                                      },
                                    };
                                    draftPricesRef.current = next;
                                    return next;
                                  });
                                }}
                                onBlur={() => {
                                  if (skipBlurSaveKeysRef.current.has(key)) {
                                    skipBlurSaveKeysRef.current.delete(key);
                                    return;
                                  }
                                  void saveField(id, field);
                                }}
                                onKeyDown={(e) => {
                                  void onPriceKeyDown(e, id, field, rowIndex);
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        لا توجد مكونات بكود يبدأ بـ MAT.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <DataPaginationFooter
                page={safePage}
                totalPages={totalPages}
                totalItems={filtered.length}
                onPageChange={setPage}
                itemLabel="مكوّن"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairPartsPricing;
