import type { QualitySector } from './domain/sector';
import type { AqlDecision, AqlDecisionMode } from './domain/aql';

export type { QualitySector, AqlDecision, AqlDecisionMode };

export type PalletInspectionStatus = 'في انتظار الفحص' | 'جاري الفحص' | 'تم الفحص';

export interface QualityActor {
  uid: string;
  name: string;
}

export interface QualityDefectLine {
  id?: string;
  tenantId: string;
  reasonId: string;
  reasonCode: string;
  reasonLabel: string;
  count: number;
  notes?: string;
  inspectorEmployeeId?: string;
  inspectorName?: string;
}

export interface QualityPallet {
  id: string;
  tenantId: string;
  moduleSource: 'qms';
  date: string;
  receivedTime: string;
  shiftId: string;
  shiftName: string;
  lineId: string;
  lineName: string;
  palletNumber: number;
  productId: string;
  productName: string;
  productCode: string;
  workOrderId?: string;
  workOrderNumber?: string;
  sector: QualitySector;
  quantityOnPallet: number;
  inspectionStatus: PalletInspectionStatus;
  inspectionDate?: string;
  inspectionStartedAt?: string;
  inspectionCompletedAt?: string;
  sampleSizeRequired: number;
  maxAllowedDefects: number;
  rejectLimit: number;
  aqlLevel: string;
  inspectedQuantity: number;
  rejectedQuantity: number;
  palletDecision: AqlDecision;
  decisionMode: AqlDecisionMode;
  inspectorEmployeeId?: string;
  inspectorName?: string;
  notes?: string;
  overrideReason?: string;
  reopenReason?: string;
  createdByUid: string;
  createdByName: string;
  updatedByUid?: string;
  updatedByName?: string;
  defects?: QualityDefectLine[];
}

export interface QualityReason {
  id: string;
  tenantId: string;
  code: string;
  labelAr: string;
  category: string;
  sector?: QualitySector;
  isActive: boolean;
}

export interface QualitySampleSlot {
  id: string;
  tenantId: string;
  slotKey: string;
  slotName: string;
  startTime: string;
  endTime: string;
  displayOrder: number;
  kind: 'hourly' | 'line';
  isActive: boolean;
}

export interface QualityStation {
  id: string;
  tenantId: string;
  name: string;
  defaultInspectorName?: string;
  defaultInspectorEmployeeId?: string;
  defaultInspectorTechnicianId?: string;
  isActive: boolean;
  displayOrder?: number;
  createdAt?: { toMillis?: () => number } | string;
}

export interface QualityTechnician {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  isActive: boolean;
  displayOrder?: number;
  createdAt?: { toMillis?: () => number } | string;
}

export interface QualityProductionTag {
  id: string;
  tenantId: string;
  lineId?: string;
  lineName: string;
  productId: string;
  productName: string;
  defaultSampleCount?: number;
  sector: QualitySector;
  isActive: boolean;
  displayOrder: number;
  createdAt?: { toMillis?: () => number } | string;
}

export interface QualitySectorTag {
  id: string;
  tenantId: string;
  entityType: 'product' | 'line';
  entityId: string;
  sector: QualitySector;
}

export interface QualityHourlySample {
  id: string;
  tenantId: string;
  moduleSource: 'qms';
  date: string;
  slotKey: string;
  slotName: string;
  lineId: string;
  lineName: string;
  productId: string;
  productName: string;
  shiftId: string;
  shiftName: string;
  inspectorEmployeeId: string;
  inspectorName: string;
  sampleCount: number;
  defectCount: number;
  decision: 'مقبول' | 'مرفوض';
  sector: QualitySector;
  notes?: string;
  defects?: QualityDefectLine[];
  createdByUid: string;
  createdByName: string;
}

export interface QualityAdditionalInspector {
  employeeId: string;
  employeeName: string;
  sampleCount: number;
}

export interface QualityLinePull {
  id: string;
  tenantId: string;
  moduleSource: 'qms';
  date: string;
  slotKey: string;
  startTime: string;
  endTime: string;
  lineId: string;
  lineName: string;
  productionTagId?: string;
  productId: string;
  productName: string;
  stationId: string;
  stationName: string;
  inspectorEmployeeId: string;
  inspectorName: string;
  additionalInspectorEmployeeId?: string;
  additionalInspectorName?: string;
  additionalInspectors?: QualityAdditionalInspector[];
  additionalInspectorTechnician?: QualityTechnician | null;
  sampleCount: number;
  additionalSampleCount: number;
  sampleCountSemantics?: 'base_plus_additional';
  rejectLimit?: number;
  status: 'pending' | 'completed';
  defectCount: number;
  palletRejected?: boolean;
  decisionMode?: 'auto' | 'manual_accept' | 'manual_reject';
  sector: QualitySector;
  notes?: string;
  reopenReason?: string;
  defects?: QualityDefectLine[];
  createdByUid: string;
  createdByName: string;
  createdAt?: { toMillis?: () => number } | string;
  completedAt?: string;
}

export interface QualityPeriodStatus {
  id: string;
  tenantId: string;
  date: string;
  slotKey: string;
  lineId: string;
  isStopped: boolean;
  noSampleReason: string;
  updatedByUid: string;
  updatedByName: string;
}

export interface QualityNamedReason {
  id: string;
  tenantId: string;
  name: string;
  nameKey: string;
  isActive?: boolean;
}

export interface QualitySecondSortReturn {
  id: string;
  tenantId: string;
  moduleSource: 'qms';
  reportDate: string;
  productId: string;
  productName: string;
  productCode: string;
  sector: QualitySector;
  quantity: number;
  notes: string;
  signatures: Array<{ title: string; name: string }>;
  createdByUid: string;
  createdByName: string;
}

export interface QualityScrapPeriod {
  slotName: string;
  reasonId: string;
  reasonLabel: string;
  quantity: number;
}

export interface QualityScrapReport {
  id: string;
  tenantId: string;
  moduleSource: 'qms';
  reportDate: string;
  reportType: 'hourly' | 'manual';
  lineId: string;
  lineName: string;
  productId?: string;
  productName: string;
  sector: QualitySector;
  quantity: number;
  reasonId?: string;
  reasonLabel: string;
  /** Hourly scrap stores one product for every period. Manual rows leave this empty. */
  periods?: QualityScrapPeriod[];
  slotKey?: string;
  slotName?: string;
  productionSupervisorName: string;
  qualitySupervisorName: string;
  recommendation: string;
  createdByUid: string;
  createdByName: string;
}

export interface QualityPhotoRef {
  storagePath: string;
  imageUrl: string;
  createdAt: string;
}

export interface QualitySecondSortReport {
  id: string;
  tenantId: string;
  moduleSource: 'qms';
  reportDate: string;
  productId: string;
  productName: string;
  productCode: string;
  problem: string;
  reasonId?: string;
  reasonName?: string;
  discountPercent: number;
  quantity: number;
  approval: string;
  fontScale: number;
  sector: QualitySector;
  signatures: Array<{ title: string; name: string }>;
  photos: QualityPhotoRef[];
  createdByUid: string;
  createdByName: string;
  updatedByUid?: string;
  updatedByName?: string;
}

/** Who may be selected for a new inspection. It does not grant a Hakim role. */
export interface QualityStaffAssignment {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName: string;
  userId: string;
  stationIds: string[];
  lineIds: string[];
  isActive: boolean;
  createdByUid: string;
  createdByName: string;
  updatedByUid: string;
  updatedByName: string;
}

export interface QualityShiftOption {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface QualityCartonReceipt {
  id: string;
  tenantId: string;
  moduleSource: 'qms';
  supplier: string;
  receivedDate: string;
  shipmentNumber: string;
  shipmentCount: 0 | 1;
  totalQuantity: number;
  deliveryNoteNumber: string;
  totalItems: number;
  acceptedItems: number;
  rejectedItems: number;
  rejectedItemCode: string;
  notes: string;
  createdByUid: string;
  createdByName: string;
}

export interface QualityPlasticReceipt {
  id: string;
  tenantId: string;
  moduleSource: 'qms';
  supplier: string;
  receivedDate: string;
  productName: string;
  partName: string;
  quantity: number;
  inspectedSamples: number;
  rejectedSamples: number;
  reasonIds: string[];
  reasonLabels: string[];
  notes: string;
  finalDecision: 'مقبول' | 'مرفوض' | 'في انتظار فحص المورد' | 'مقبول بنسبة';
  acceptedPercentage: number | null;
  createdByUid: string;
  createdByName: string;
}
