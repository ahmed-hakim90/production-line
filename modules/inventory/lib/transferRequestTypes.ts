import type { TransferRequestType } from '../types';

export const TRANSFER_LIKE_TYPES: TransferRequestType[] = [
  'transfer',
  'manual_transfer',
  'production_auto_transfer',
  'finished_to_final',
  'packaging_transfer',
];

export function normalizeTransferRequestType(requestType?: TransferRequestType): TransferRequestType {
  if (!requestType || requestType === 'transfer') return 'manual_transfer';
  return requestType;
}

export function isTransferLikeType(requestType: TransferRequestType): boolean {
  return TRANSFER_LIKE_TYPES.includes(requestType);
}
