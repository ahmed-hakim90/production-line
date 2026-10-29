import { addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import {
  QMS_COLLECTIONS,
  activeTenantId,
  assertQualityPermission,
  auditQuality,
  currentQualityActor,
  listByTenant,
  qmsCollection,
  qmsDoc,
  readQualityDoc,
  stampTenant,
} from './qualityGateway';

export interface PalletSavedFilterCriteria {
  dateFrom: string;
  dateTo: string;
  lineId: string;
  productId: string;
  inspectionStatus: string;
  palletDecision: string;
}

export interface PalletSavedFilter {
  id: string;
  tenantId: string;
  name: string;
  filterType: 'pallets';
  criteria: PalletSavedFilterCriteria;
  createdByUid: string;
  createdByName: string;
}

export const qualityFilterService = {
  async list(): Promise<PalletSavedFilter[]> {
    assertQualityPermission('quality.pallets.view');
    const rows = await listByTenant<PalletSavedFilter>(QMS_COLLECTIONS.SAVED_FILTERS, activeTenantId());
    return rows.filter((row) => row.filterType === 'pallets');
  },

  async save(name: string, criteria: PalletSavedFilterCriteria): Promise<void> {
    assertQualityPermission('quality.pallets.view');
    const label = name.trim();
    if (!label) throw new Error('اكتب اسماً للفلتر.');
    const actor = currentQualityActor();
    await addDoc(qmsCollection(QMS_COLLECTIONS.SAVED_FILTERS), stampTenant({
      name: label,
      filterType: 'pallets',
      criteria,
      createdAt: serverTimestamp(),
      createdByUid: actor.uid,
      createdByName: actor.name,
    }));
    await auditQuality('QUALITY_EXPORT_DOCUMENT', `حفظ فلتر بالتات: ${label}`, { filterType: 'pallets' });
  },

  async remove(id: string): Promise<void> {
    const row = await readQualityDoc<PalletSavedFilter>(QMS_COLLECTIONS.SAVED_FILTERS, id);
    const actor = currentQualityActor();
    if (row.createdByUid !== actor.uid) assertQualityPermission('quality.records.delete');
    else assertQualityPermission('quality.pallets.view');
    await deleteDoc(qmsDoc(QMS_COLLECTIONS.SAVED_FILTERS, id));
    await auditQuality('QUALITY_EXPORT_DOCUMENT', `حذف فلتر بالتات: ${row.name}`, { filterId: id });
  },
};
