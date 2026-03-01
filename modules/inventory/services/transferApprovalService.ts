import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { InventoryTransferRequest, TransferRequestLine, TransferRequestStatus } from '../types';
import { stockService } from './stockService';

const COLLECTION = 'inventory_transfer_requests';
const toIsoNow = () => new Date().toISOString();

type CreateTransferRequestInput = {
  fromWarehouseId: string;
  fromWarehouseName?: string;
  toWarehouseId: string;
  toWarehouseName?: string;
  referenceNo: string;
  note?: string;
  lines: TransferRequestLine[];
  createdBy: string;
};

export const transferApprovalService = {
  async getAll(): Promise<InventoryTransferRequest[]> {
    if (!isConfigured) return [];
    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryTransferRequest));
  },

  async getByStatus(status: TransferRequestStatus): Promise<InventoryTransferRequest[]> {
    if (!isConfigured) return [];
    const q = query(
      collection(db, COLLECTION),
      where('status', '==', status),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryTransferRequest));
  },

  async getById(id: string): Promise<InventoryTransferRequest | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as InventoryTransferRequest;
  },

  async createRequest(input: CreateTransferRequestInput): Promise<string | null> {
    if (!isConfigured) return null;
    if (!input.fromWarehouseId || !input.toWarehouseId) {
      throw new Error('يجب تحديد المخزن المصدر والوجهة.');
    }
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new Error('المخزن المصدر يجب أن يكون مختلفا عن مخزن الوجهة.');
    }
    const lines = input.lines
      .filter((line) => Number(line.quantity) > 0)
      .map((line) => ({ ...line, quantity: Number(line.quantity) }));
    if (!lines.length) {
      throw new Error('لا توجد أصناف صالحة في طلب التحويل.');
    }
    const payload: InventoryTransferRequest = {
      fromWarehouseId: input.fromWarehouseId,
      fromWarehouseName: input.fromWarehouseName,
      toWarehouseId: input.toWarehouseId,
      toWarehouseName: input.toWarehouseName,
      referenceNo: input.referenceNo.trim(),
      note: input.note,
      lines,
      status: 'pending',
      createdBy: input.createdBy,
      createdAt: toIsoNow(),
    };
    const ref = await addDoc(collection(db, COLLECTION), payload);
    return ref.id;
  },

  async approveRequest(id: string, approvedBy: string): Promise<void> {
    if (!isConfigured || !id) return;
    const request = await this.getById(id);
    if (!request) throw new Error('طلب التحويل غير موجود.');
    if (request.status !== 'pending') {
      throw new Error('لا يمكن اعتماد طلب غير معلق.');
    }

    for (const line of request.lines) {
      await stockService.createMovement({
        warehouseId: request.fromWarehouseId,
        toWarehouseId: request.toWarehouseId,
        itemType: line.itemType,
        itemId: line.itemId,
        itemName: line.itemName,
        itemCode: line.itemCode,
        movementType: 'TRANSFER',
        quantity: Number(line.quantity || 0),
        minStock: line.minStock,
        note: request.note,
        referenceNo: request.referenceNo,
        createdBy: approvedBy,
      });
    }

    await updateDoc(doc(db, COLLECTION, id), {
      status: 'approved',
      approvedBy,
      approvedAt: toIsoNow(),
    });
  },

  async rejectRequest(id: string, rejectedBy: string, rejectionReason?: string): Promise<void> {
    if (!isConfigured || !id) return;
    const request = await this.getById(id);
    if (!request) throw new Error('طلب التحويل غير موجود.');
    if (request.status !== 'pending') {
      throw new Error('لا يمكن رفض طلب غير معلق.');
    }
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'rejected',
      rejectedBy,
      rejectedAt: toIsoNow(),
      rejectionReason: rejectionReason?.trim() || '',
    });
  },
};

