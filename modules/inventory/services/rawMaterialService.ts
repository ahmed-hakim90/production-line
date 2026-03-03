import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { RawMaterial } from '../types';

const COLLECTION = 'raw_materials';
const PRODUCT_MATERIALS_COLLECTION = 'product_materials';
const RM_CODE_REGEX = /^RM-(\d+)$/i;

const normalizeRawMaterialName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

const formatRawMaterialCode = (seq: number) => `RM-${String(Math.max(1, Math.floor(seq))).padStart(4, '0')}`;

export const rawMaterialService = {
  async getAll(): Promise<RawMaterial[]> {
    if (!isConfigured) return [];
    const q = query(collection(db, COLLECTION), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RawMaterial));
  },

  async create(payload: Omit<RawMaterial, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(collection(db, COLLECTION), {
      ...payload,
      createdAt: new Date().toISOString(),
    });
    return ref.id;
  },

  async update(id: string, payload: Partial<RawMaterial>): Promise<void> {
    if (!isConfigured || !id) return;
    const { id: _id, ...data } = payload as RawMaterial;
    await updateDoc(doc(db, COLLECTION, id), data as any);
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await deleteDoc(doc(db, COLLECTION, id));
  },

  async syncFromProductMaterials(): Promise<{ created: number; linked: number; skipped: number }> {
    if (!isConfigured) return { created: 0, linked: 0, skipped: 0 };

    const [rawSnap, productMaterialsSnap] = await Promise.all([
      getDocs(query(collection(db, COLLECTION), orderBy('name', 'asc'))),
      getDocs(collection(db, PRODUCT_MATERIALS_COLLECTION)),
    ]);

    const rawMaterials = rawSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RawMaterial));
    const rawById = new Map<string, RawMaterial>();
    const rawByName = new Map<string, RawMaterial>();
    const usedCodes = new Set<string>();

    let maxCodeSeq = 0;
    for (const raw of rawMaterials) {
      if (!raw.id) continue;
      rawById.set(raw.id, raw);
      rawByName.set(normalizeRawMaterialName(raw.name || ''), raw);
      const code = String(raw.code || '').trim().toUpperCase();
      if (code) usedCodes.add(code);
      const match = code.match(RM_CODE_REGEX);
      if (match) maxCodeSeq = Math.max(maxCodeSeq, Number(match[1] || 0));
    }

    let created = 0;
    let linked = 0;
    let skipped = 0;

    for (const materialDoc of productMaterialsSnap.docs) {
      const data = materialDoc.data() as any;
      const materialName = String(data.materialName || '').trim();
      if (!materialName) {
        skipped += 1;
        continue;
      }

      const normalizedName = normalizeRawMaterialName(materialName);
      const existingById = data.materialId ? rawById.get(String(data.materialId)) : undefined;
      let targetRaw = existingById ?? rawByName.get(normalizedName);

      if (!targetRaw) {
        let nextCode = '';
        do {
          maxCodeSeq += 1;
          nextCode = formatRawMaterialCode(maxCodeSeq);
        } while (usedCodes.has(nextCode));
        usedCodes.add(nextCode);

        const createdRef = await addDoc(collection(db, COLLECTION), {
          name: materialName,
          code: nextCode,
          unit: 'unit',
          minStock: 0,
          isActive: true,
          createdAt: new Date().toISOString(),
        });

        targetRaw = {
          id: createdRef.id,
          name: materialName,
          code: nextCode,
          unit: 'unit',
          minStock: 0,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        rawById.set(targetRaw.id!, targetRaw);
        rawByName.set(normalizedName, targetRaw);
        created += 1;
      }

      const needsLink =
        String(data.materialId || '') !== String(targetRaw.id || '') ||
        String(data.materialName || '').trim() !== String(targetRaw.name || '').trim();

      if (needsLink && targetRaw.id) {
        await updateDoc(doc(db, PRODUCT_MATERIALS_COLLECTION, materialDoc.id), {
          materialId: targetRaw.id,
          materialName: targetRaw.name,
        });
        linked += 1;
      }
    }

    return { created, linked, skipped };
  },
};
