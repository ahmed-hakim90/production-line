import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, ClipboardList, Clock3, PackageCheck, XCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { usePrintEngine } from '@/utils/printManager';
import { QualityLinePullPrint } from '../components/QualityPrintDocuments';
import { qualityRecordPrintAllowed, rowsMatchingTenant } from '../print/qualityPrintModel';
import { activeTenantId, qualityUserMessage } from '../services/qualityGateway';
import { totalLinePullSampleCount, validateAdditionalInspectorAssignments } from '../domain/samples';
import { localDateIso } from '../domain/time';
import type {
  QualityDefectLine,
  QualityLinePull,
  QualityAdditionalInspector,
  QualityProductionTag,
  QualityReason,
  QualitySampleSlot,
  QualityStation,
  QualityTechnician,
} from '../model';
import { type QualitySector } from '../domain/sector';
import { qualitySampleService } from '../services/qualitySampleService';
import { qualitySettingsService, type QualityPolicySettings } from '../services/qualitySettingsService';
import { inspectorOptions, useQualityAssignments } from '../hooks/useQualityAssignments';
import { MasterSelect, QmsPage, SectorSwitch, matchesSector, useQualityMasters } from '../qms/QmsChrome';

interface PullEditDraft {
  id: string;
  originalStatus: QualityLinePull['status'];
  date: string;
  slotKey: string;
  startTime: string;
  endTime: string;
  productionTagId: string;
  lineId: string;
  lineName: string;
  productId: string;
  productName: string;
  sector: QualitySector;
  stationId: string;
  inspectorEmployeeId: string;
  inspectorName: string;
  additionalInspectorEmployeeId: string;
  additionalInspectors: QualityAdditionalInspector[];
  sampleCount: number;
  additionalSampleCount: number;
  rejectLimit: number;
  defects: QualityDefectLine[];
  decisionMode: 'auto' | 'manual_accept' | 'manual_reject';
  reopenReason: string;
}

export const QualityLineSamples: React.FC = () => {
  const { can } = usePermission();
  const permissions = useAppStore((state) => state.userPermissions);
  const printTemplate = useAppStore((state) => state.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();
  const canPrintSamples = qualityRecordPrintAllowed(permissions, 'quality.samples.view');
  const canCreatePull = can('quality.samples.inspect') || can('quality.settings.manage');
  const masters = useQualityMasters();
  const staff = useQualityAssignments();
  const [date, setDate] = useState(localDateIso());
  const [slots, setSlots] = useState<QualitySampleSlot[]>([]);
  const [stations, setStations] = useState<QualityStation[]>([]);
  const [managedStations, setManagedStations] = useState<QualityStation[]>([]);
  const [technicians, setTechnicians] = useState<QualityTechnician[]>([]);
  const [managedSlots, setManagedSlots] = useState<QualitySampleSlot[]>([]);
  const [productionTags, setProductionTags] = useState<QualityProductionTag[]>([]);
  const [rows, setRows] = useState<QualityLinePull[]>([]);
  const [policies, setPolicies] = useState<QualityPolicySettings>({ closeRequiresQualityApproval: false, lineSampleRejectLimit: 1 });
  const [slotKey, setSlotKey] = useState(() => {
    try {
      return localStorage.getItem(`quality:line-sample-slot:${activeTenantId()}`) || '';
    } catch {
      return '';
    }
  });
  const [sector, setSector] = useState<QualitySector | 'all'>('all');
  const [productionTagId, setProductionTagId] = useState('');
  const [lineId, setLineId] = useState('');
  const [stationId, setStationId] = useState('');
  const [inspectorId, setInspectorId] = useState('');
  const [additionalInspectors, setAdditionalInspectors] = useState<QualityAdditionalInspector[]>([]);
  const [sampleCount, setSampleCount] = useState(10);
  const [rejectLimit, setRejectLimit] = useState(1);
  const [reasonId, setReasonId] = useState('');
  const [defectCount, setDefectCount] = useState(1);
  const [defectNotes, setDefectNotes] = useState('');
  const [defects, setDefects] = useState<QualityDefectLine[]>([]);
  const [activeId, setActiveId] = useState('');
  const [completionRejectLimit, setCompletionRejectLimit] = useState(1);
  const [decisionMode, setDecisionMode] = useState<'auto' | 'manual_accept' | 'manual_reject'>('auto');
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [lineFilter, setLineFilter] = useState('');
  const [slotFilter, setSlotFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const [stationDraft, setStationDraft] = useState({ id: '', name: '', technicianId: '' });
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [slotDraft, setSlotDraft] = useState({ startTime: '', endTime: '' });
  const [editDraft, setEditDraft] = useState<PullEditDraft | null>(null);
  const [editReasonId, setEditReasonId] = useState('');
  const [editDefectCount, setEditDefectCount] = useState(1);
  const [editDefectNotes, setEditDefectNotes] = useState('');
  const [newReasonDraft, setNewReasonDraft] = useState<Pick<QualityReason, 'labelAr' | 'category'>>({
    labelAr: '',
    category: '',
  });
  const [newReasonOpen, setNewReasonOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [nextSlots, nextStations, nextManagedStations, nextManagedSlots, nextRows, nextPolicies, nextProductionTags, nextTechnicians] = await Promise.all([
      qualitySettingsService.listSlots('line'),
      qualitySettingsService.listStations(),
      qualitySettingsService.listStations({ includeInactive: true }),
      qualitySettingsService.listManagedSlots('line'),
      qualitySampleService.listPulls(date),
      qualitySettingsService.getPolicies(),
      qualitySettingsService.listProductionTags({ includeInactive: true }),
      qualitySettingsService.listTechnicians(),
    ]);
    setSlots(nextSlots);
    setStations(nextStations);
    setManagedStations(nextManagedStations);
    setManagedSlots(nextManagedSlots);
    setRows(nextRows);
    setPolicies(nextPolicies);
    setProductionTags(nextProductionTags);
    setTechnicians(nextTechnicians);
    setRejectLimit(nextPolicies.lineSampleRejectLimit);
  };

  useEffect(() => {
    void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تحميل بيانات سحب العينات')));
  }, [date]);

  useEffect(() => {
    setDefects([]);
    setReasonId('');
    setDefectCount(1);
    setDefectNotes('');
    const active = rows.find((row) => row.id === activeId);
    if (active) {
      setCompletionRejectLimit(active.rejectLimit ?? policies.lineSampleRejectLimit);
      setDecisionMode(active.decisionMode || 'auto');
    }
  }, [activeId]);

  const active = rows.find((row) => row.id === activeId);
  const inspectorChoices = inspectorOptions(masters.employees, staff.assignments, { lineId, stationId });
  const visibleProductionTags = productionTags
    .filter((tag) => tag.isActive !== false)
    .filter((tag) => matchesSector(sector, tag.sector))
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  const additionalAssignedCount = additionalInspectors.reduce((sum, item) => sum + item.sampleCount, 0);
  const primarySampleCount = Math.max(0, sampleCount - additionalAssignedCount);
  const totalSampleCount = sampleCount;
  const visibleRows = rows.filter((row) => (
    (!lineFilter || row.lineId === lineFilter)
    && (!slotFilter || row.slotKey === slotFilter)
    && (statusFilter === 'all' || row.status === statusFilter)
    && (sector === 'all' || row.sector === sector)
  ));
  const lineFilterOptions = [...new Map(rows.map((row) => [row.lineId, { id: row.lineId, name: row.lineName }])).values()];

  const saveRejectLimit = async () => {
    setSaving(true);
    try {
      await qualitySettingsService.setPolicies({ lineSampleRejectLimit: rejectLimit });
      setPolicies((current) => ({ ...current, lineSampleRejectLimit: rejectLimit }));
      toast.success('تم حفظ حد الرفض التلقائي.');
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر حفظ حد الرفض.'));
    } finally {
      setSaving(false);
    }
  };

  const addAdditionalInspector = (technicianId: string) => {
    if (!technicianId) return;
    if (technicianId === selectedStation?.defaultInspectorTechnicianId) {
      toast.error('المراقب الإضافي يجب أن يكون مختلفًا عن المراقب الأساسي.');
      return;
    }
    if (additionalInspectors.some((item) => item.employeeId === technicianId)) {
      toast.error('تمت إضافة هذا المراقب بالفعل.');
      return;
    }
    const technician = technicians.find((item) => item.id === technicianId);
    if (!technician) {
      toast.error('اختر فنيًا نشطًا من دليل الفنيين.');
      return;
    }
    setAdditionalInspectors((current) => [...current, {
      employeeId: technician.id,
      employeeName: technician.name,
      sampleCount: 1,
    }]);
  };

  const updateAdditionalInspectorCount = (employeeId: string, count: number) => {
    setAdditionalInspectors((current) => current.map((item) => item.employeeId === employeeId
      ? { ...item, sampleCount: Math.max(0, Math.floor(count)) }
      : item));
  };

  const create = async () => {
    const slot = slots.find((item) => item.slotKey === slotKey);
    const tag = visibleProductionTags.find((item) => item.id === productionTagId);
    const line = tag
      ? { id: tag.lineId || `quality-tag:${tag.id}`, name: tag.lineName }
      : null;
    const product = tag
      ? { id: tag.productId, name: tag.productName }
      : null;
    const station = stations.find((item) => item.id === stationId);
    const inspectorRecord = masters.employees.find((item) => item.id === inspectorId)
      || staff.assignments.find((item) => item.employeeId === inspectorId);
    const inspector = station
      ? {
        id: station.defaultInspectorEmployeeId || inspectorId || station.id,
        name: station.defaultInspectorName
          || (inspectorRecord
            ? ('employeeId' in inspectorRecord ? inspectorRecord.employeeName : inspectorRecord.name)
            : ''),
      }
      : null;
    if (!slot || !tag || !line || !product || !station || !inspector) {
      toast.error('أكمل التاريخ والفترة ووسم الخط والمنتج ومحطة الفحص.');
      return;
    }
    try {
      validateAdditionalInspectorAssignments(additionalInspectors, inspector.id || '', sampleCount);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تحقق من توزيع عينات المراقبين.');
      return;
    }

    setSaving(true);
    try {
      await qualitySampleService.createPull({
        date,
        slotKey: slot.slotKey,
        startTime: slot.startTime,
        endTime: slot.endTime,
        lineId: line.id,
        lineName: line.name,
        productionTagId: tag.id,
        productId: product.id,
        productName: product.name,
        stationId: station.id,
        stationName: station.name,
        inspectorEmployeeId: inspector.id || '',
        inspectorName: inspector.name,
        additionalInspectors,
        additionalInspectorEmployeeId: additionalInspectors[0]?.employeeId,
        additionalInspectorName: additionalInspectors[0]?.employeeName,
        additionalSampleCount: additionalInspectors[0]?.sampleCount || 0,
        sampleCount,
        rejectLimit,
        sector: tag.sector,
      });
      toast.success('تم تسجيل السحبة وبدء الفحص.');
      setAdditionalInspectors([]);
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر تسجيل السحبة.'));
    } finally {
      setSaving(false);
    }
  };

  const addDefect = () => {
    const reason = masters.reasons.find((item) => item.id === reasonId);
    if (!reason || !Number.isInteger(defectCount) || defectCount < 1) {
      toast.error('اختر سبب العيب وأدخل عددًا صحيحًا موجبًا.');
      return;
    }
    setDefects((current) => [...current, {
      tenantId: '',
      reasonId: reason.id,
      reasonCode: reason.code,
      reasonLabel: reason.labelAr,
      count: defectCount,
      notes: defectNotes.trim(),
    }]);
    setReasonId('');
    setDefectCount(1);
    setDefectNotes('');
  };

  const updateDefectCount = (index: number, count: number) => {
    setDefects((current) => current.map((defect, itemIndex) => itemIndex === index
      ? { ...defect, count: Math.max(1, Math.floor(count)) }
      : defect));
  };

  const complete = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const result = await qualitySampleService.completePull(active.id, {
        defects,
        rejectLimit: completionRejectLimit,
        decisionMode,
      });
      toast.success(result.palletRejected ? 'تم إنهاء السحبة بقرار: مرفوضة.' : 'تم إنهاء السحبة بقرار: مقبولة.');
      setDefects([]);
      setActiveId('');
      setInspectionOpen(false);
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر إنهاء الفحص.'));
    } finally {
      setSaving(false);
    }
  };

  const openInspection = async (row: QualityLinePull) => {
    setActiveId(row.id);
    setDefects([]);
    setInspectionOpen(true);
    try {
      const [detailed] = await qualitySampleService.withPullDefects([row]);
      setDefects(detailed.defects || []);
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر تحميل عيوب السحبة.'));
    }
  };

  const openEdit = async (row: QualityLinePull) => {
    if (!can('quality.samples.inspect') || (row.status === 'completed' && !can('quality.records.reopen'))) return;
    setSaving(true);
    try {
      const [detailed] = await qualitySampleService.withPullDefects([row]);
      setEditDraft({
        id: row.id,
        originalStatus: row.status,
        date: row.date,
        slotKey: row.slotKey,
        startTime: row.startTime,
        endTime: row.endTime,
        productionTagId: row.productionTagId || `legacy:${row.id}`,
        lineId: row.lineId,
        lineName: row.lineName,
        productId: row.productId,
        productName: row.productName,
        sector: row.sector,
        stationId: row.stationId,
        inspectorEmployeeId: row.inspectorEmployeeId,
        inspectorName: row.inspectorName,
        additionalInspectorEmployeeId: row.additionalInspectorEmployeeId || '',
        additionalInspectors: row.additionalInspectors?.map((item) => ({ ...item }))
          || (row.additionalInspectorEmployeeId
            ? [{
              employeeId: row.additionalInspectorEmployeeId,
              employeeName: row.additionalInspectorName || '',
              sampleCount: row.additionalSampleCount || 0,
            }]
            : []),
        sampleCount: row.sampleCount,
        additionalSampleCount: row.additionalSampleCount || 0,
        rejectLimit: row.rejectLimit ?? policies.lineSampleRejectLimit,
        defects: detailed.defects || [],
        decisionMode: row.decisionMode || 'auto',
        reopenReason: '',
      });
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر تحميل بيانات السحبة للتعديل.'));
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    const tag = productionTags.find((item) => item.id === editDraft.productionTagId);
    const line = tag
      ? { id: tag.lineId || `quality-tag:${tag.id}`, name: tag.lineName }
      : { id: editDraft.lineId, name: editDraft.lineName };
    const product = tag
      ? { id: tag.productId, name: tag.productName }
      : { id: editDraft.productId, name: editDraft.productName };
    const sector = tag?.sector || editDraft.sector;
    const station = [...stations, ...managedStations].find((item) => item.id === editDraft.stationId);
    const inspectorRecord = masters.employees.find((item) => item.id === editDraft.inspectorEmployeeId)
      || staff.assignments.find((item) => item.employeeId === editDraft.inspectorEmployeeId);
    const inspector = station
      ? {
        id: station.defaultInspectorEmployeeId || editDraft.inspectorEmployeeId || station.id,
        name: station.defaultInspectorName
          || (inspectorRecord
            ? ('employeeId' in inspectorRecord ? inspectorRecord.employeeName : inspectorRecord.name)
            : editDraft.inspectorName),
      }
      : null;
    const slot = [...slots, ...managedSlots].find((item) => item.slotKey === editDraft.slotKey);
    if (!line.id || !product.id || !station || !inspector || !slot) {
      toast.error('تحقق من اختيار الفترة ووسم الخط والمنتج والمحطة.');
      return;
    }
    if (editDraft.originalStatus === 'completed' && !editDraft.reopenReason.trim()) {
      toast.error('سبب إعادة الفتح مطلوب لتعديل سحبة مكتملة.');
      return;
    }
    try {
      validateAdditionalInspectorAssignments(editDraft.additionalInspectors, inspector?.id || '', editDraft.sampleCount);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تحقق من توزيع عينات المراقبين.');
      return;
    }
    setSaving(true);
    let reopened = false;
    try {
      if (editDraft.originalStatus === 'completed') {
        await qualitySampleService.reopenPull(editDraft.id, editDraft.reopenReason);
        reopened = true;
      }
      await qualitySampleService.updatePendingPull(editDraft.id, {
        date: editDraft.date,
        slotKey: slot.slotKey,
        startTime: slot.startTime,
        endTime: slot.endTime,
        productionTagId: editDraft.productionTagId.startsWith('legacy:') ? undefined : editDraft.productionTagId,
        lineId: line.id,
        lineName: line.name,
        productId: product.id,
        productName: product.name,
        stationId: station.id,
        stationName: station.name,
        inspectorEmployeeId: inspector.id || '',
        inspectorName: inspector.name,
        additionalInspectors: editDraft.additionalInspectors,
        additionalInspectorEmployeeId: editDraft.additionalInspectors[0]?.employeeId,
        additionalInspectorName: editDraft.additionalInspectors[0]?.employeeName,
        additionalSampleCount: editDraft.additionalInspectors[0]?.sampleCount || 0,
        sampleCount: editDraft.sampleCount,
        rejectLimit: editDraft.rejectLimit,
        sector,
      });
      await qualitySampleService.savePendingPullDefects(editDraft.id, editDraft.defects);
      if (editDraft.originalStatus === 'completed') {
        await qualitySampleService.completePull(editDraft.id, {
          defects: editDraft.defects,
          rejectLimit: editDraft.rejectLimit,
          decisionMode: editDraft.decisionMode,
        });
      }
      toast.success(editDraft.originalStatus === 'completed' ? 'تم تعديل السحبة وإعادة اعتمادها.' : 'تم حفظ تعديلات السحبة.');
      const dateChanged = date !== editDraft.date;
      setDate(editDraft.date);
      setEditDraft(null);
      if (!dateChanged) await load();
    } catch (error) {
      const message = qualityUserMessage(error, 'تعذر حفظ تعديلات السحبة.');
      toast.error(reopened
        ? `تمت إعادة فتح السحبة، لكن تعذر إكمال التعديل: ${message} يمكنك إعادة المحاولة من السحبات قيد الفحص.`
        : message);
      if (reopened) await load();
    } finally {
      setSaving(false);
    }
  };

  const deletePull = async (row: QualityLinePull) => {
    if (!window.confirm(`هل تريد حذف سحبة ${row.lineName} للفترة ${row.startTime}–${row.endTime}؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setSaving(true);
    try {
      await qualitySampleService.deletePull(row.id);
      toast.success('تم حذف السحبة.');
      if (activeId === row.id) {
        setActiveId('');
        setInspectionOpen(false);
      }
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر حذف السحبة.'));
    } finally {
      setSaving(false);
    }
  };

  const updateEditDraft = <K extends keyof PullEditDraft,>(key: K, value: PullEditDraft[K]) => {
    setEditDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const addEditDefect = () => {
    const reason = masters.reasons.find((item) => item.id === editReasonId);
    if (!reason || !Number.isInteger(editDefectCount) || editDefectCount < 1) {
      toast.error('اختر سبب العيب وأدخل عددًا صحيحًا موجبًا.');
      return;
    }
    setEditDraft((current) => current ? {
      ...current,
      defects: [...current.defects, {
        tenantId: '',
        reasonId: reason.id,
        reasonCode: reason.code,
        reasonLabel: reason.labelAr,
        count: editDefectCount,
        notes: editDefectNotes.trim(),
      }],
    } : current);
    setEditReasonId('');
    setEditDefectCount(1);
    setEditDefectNotes('');
  };

  const saveNewReason = async () => {
    if (!can('quality.settings.manage')) return;
    setSaving(true);
    try {
      await qualitySettingsService.saveReason({
        ...newReasonDraft,
        category: newReasonDraft.category || 'عام',
        isActive: true,
      });
      await masters.reloadAux();
      const saved = (await qualitySettingsService.listReasons()).find((reason) => reason.labelAr === newReasonDraft.labelAr.trim());
      if (saved) {
        if (editDraft) setEditReasonId(saved.id);
        else setReasonId(saved.id);
      }
      toast.success('تمت إضافة سبب العيب.');
      setNewReasonDraft({ labelAr: '', category: '' });
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر إضافة سبب العيب.'));
    } finally {
      setSaving(false);
    }
  };

  const saveStation = async () => {
    setSaving(true);
    try {
      await qualitySettingsService.saveStation({
        id: stationDraft.id || undefined,
        name: stationDraft.name,
        defaultInspectorTechnicianId: stationDraft.technicianId,
      });
      toast.success('تم حفظ محطة الفحص.');
      setStationDraft({ id: '', name: '', technicianId: '' });
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر حفظ محطة الفحص.'));
    } finally {
      setSaving(false);
    }
  };

  const hideStation = async (station: QualityStation) => {
    if (!window.confirm(`إيقاف محطة «${station.name}»؟ ستظل بيانات السحبات السابقة محفوظة.`)) return;
    setSaving(true);
    try {
      await qualitySettingsService.hideStation(station.id);
      toast.success('تم إيقاف المحطة مع الاحتفاظ بالسجلات السابقة.');
      setStationDraft((current) => current.id === station.id ? { id: '', name: '', technicianId: '' } : current);
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر إيقاف محطة الفحص.'));
    } finally {
      setSaving(false);
    }
  };

  const saveSlot = async () => {
    setSaving(true);
    try {
      await qualitySettingsService.saveSlot({
        kind: 'line',
        slotKey: `line-${slotDraft.startTime}-${slotDraft.endTime}`,
        slotName: `${slotDraft.startTime} - ${slotDraft.endTime}`,
        startTime: slotDraft.startTime,
        endTime: slotDraft.endTime,
        displayOrder: managedSlots.length + 1,
        isActive: true,
      });
      toast.success('تم حفظ فترة السحب.');
      setSlotDraft({ startTime: '', endTime: '' });
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر حفظ فترة السحب.'));
    } finally {
      setSaving(false);
    }
  };

  const hideSlot = async (slot: QualitySampleSlot) => {
    if (!slot.id || slot.id.startsWith('standard-')) {
      toast.error('الفترات الافتراضية لا يمكن حذفها؛ أضف فترات مخصصة بدلًا منها.');
      return;
    }
    if (!window.confirm(`إيقاف الفترة ${slot.startTime}–${slot.endTime}؟ ستظل السحبات السابقة محفوظة.`)) return;
    setSaving(true);
    try {
      await qualitySettingsService.hideSlot(slot.id);
      toast.success('تم إيقاف الفترة مع الاحتفاظ بالسحبات السابقة.');
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر إيقاف فترة السحب.'));
    } finally {
      setSaving(false);
    }
  };

  const editInspectorChoices = editDraft
    ? inspectorOptions(masters.employees, staff.assignments, {
      lineId: editDraft.lineId,
      stationId: editDraft.stationId,
    })
    : [];
  const editCurrentInspector = editDraft
    ? masters.employees.find((employee) => employee.id === editDraft.inspectorEmployeeId)
      || staff.assignments.find((employee) => employee.employeeId === editDraft.inspectorEmployeeId)
    : undefined;
  const editInspectorOptions = editCurrentInspector && !editInspectorChoices.some((option) => option.value === editDraft?.inspectorEmployeeId)
    ? [...editInspectorChoices, {
      value: editDraft?.inspectorEmployeeId || '',
      label: 'employeeId' in editCurrentInspector
        ? editCurrentInspector.employeeName
        : (editCurrentInspector.code
          ? `${editCurrentInspector.name} (${editCurrentInspector.code})`
          : editCurrentInspector.name),
    }]
    : editInspectorChoices;
  const editSlotOptions = editDraft
    ? [...slots, ...managedSlots.filter((slot) => slot.slotKey === editDraft.slotKey && !slots.some((activeSlot) => activeSlot.slotKey === slot.slotKey))]
    : slots;
  const editStations = editDraft
    ? [...stations, ...managedStations.filter((station) => station.id === editDraft.stationId && !stations.some((activeStation) => activeStation.id === station.id))]
    : stations;
  const editProductionTags = editDraft ? [
    ...productionTags.filter((tag) => tag.isActive !== false || tag.id === editDraft.productionTagId),
    ...(productionTags.some((tag) => tag.id === editDraft.productionTagId) ? [] : [{
      id: editDraft.productionTagId,
      tenantId: '',
      lineId: editDraft.lineId,
      lineName: editDraft.lineName,
      productId: editDraft.productId,
      productName: editDraft.productName,
      sector: editDraft.sector,
      isActive: true,
      displayOrder: 0,
    }]),
  ] : [];
  const editStation = editDraft ? editStations.find((station) => station.id === editDraft.stationId) : undefined;
  const editStationInspectorName = editStation?.defaultInspectorName
    || masters.employees.find((employee) => employee.id === editStation?.defaultInspectorEmployeeId)?.name
    || staff.assignments.find((assignment) => assignment.employeeId === editStation?.defaultInspectorEmployeeId)?.employeeName
    || editDraft?.inspectorName
    || '';
  const editTotalSamples = editDraft?.sampleCount || 0;
  const editDefectTotal = editDraft?.defects.reduce((sum, defect) => sum + defect.count, 0) || 0;
  const pullSlotOptions = [...slots, ...managedSlots, ...rows.map((row) => ({
    id: row.slotKey,
    tenantId: row.tenantId,
    slotKey: row.slotKey,
    slotName: `${row.startTime} - ${row.endTime}`,
    startTime: row.startTime,
    endTime: row.endTime,
    displayOrder: 0,
    kind: 'line' as const,
    isActive: false,
  }))].filter((slot, index, all) => all.findIndex((candidate) => candidate.slotKey === slot.slotKey) === index);
  const selectedProductionTag = visibleProductionTags.find((tag) => tag.id === productionTagId);
  const selectedStation = stations.find((station) => station.id === stationId);
  const selectedSlot = slots.find((slot) => slot.slotKey === slotKey);
  const summaryCounts = {
    pending: visibleRows.filter((row) => row.status !== 'completed').length,
    accepted: visibleRows.filter((row) => row.status === 'completed' && !row.palletRejected).length,
    rejected: visibleRows.filter((row) => row.status === 'completed' && row.palletRejected).length,
    samples: visibleRows.reduce((sum, row) => sum + totalLinePullSampleCount(row), 0),
  };
  const pullSetupSteps = [
    { label: 'الخط والمنتج', value: selectedProductionTag?.lineName || 'لم يتم الاختيار', complete: Boolean(selectedProductionTag) },
    { label: 'محطة الفحص', value: selectedStation?.name || 'لم يتم الاختيار', complete: Boolean(selectedStation) },
    { label: 'فترة السحب', value: selectedSlot ? `${selectedSlot.startTime}–${selectedSlot.endTime}` : 'لم يتم الاختيار', complete: Boolean(selectedSlot) },
  ];

  return (
    <QmsPage
      title="سحب عينات للخطوط"
      subtitle="اختر وسم الخط والمنتج حسب القسم، ثم سجّل السحبة وابدأ الفحص."
      actions={
        <>
          {can('quality.settings.manage') ? (
            <button type="button" className="qms-btn qms-btn-dark qms-action-link" onClick={() => setStationDialogOpen(true)}>
              ☷ إدارة محطات الفحص
            </button>
          ) : null}
          {can('quality.settings.manage') ? (
            <button type="button" className="qms-btn qms-btn-primary qms-action-link" onClick={() => setSlotDialogOpen(true)}>
              ◷ إدارة فترات السحب
            </button>
          ) : null}
        </>
      }
    >
      <section className="qms-line-pull-overview" aria-label="ملخص سحبات العينات المعروضة">
        <div className="qms-line-stat qms-line-stat--total">
          <span className="qms-line-stat-icon" aria-hidden="true"><ClipboardList size={20} /></span>
          <span className="qms-line-stat-copy"><span>السحبات المعروضة</span><strong>{visibleRows.length}</strong></span>
        </div>
        <div className="qms-line-stat qms-line-stat--pending">
          <span className="qms-line-stat-icon" aria-hidden="true"><Clock3 size={20} /></span>
          <span className="qms-line-stat-copy"><span>قيد الفحص</span><strong>{summaryCounts.pending}</strong></span>
        </div>
        <div className="qms-line-stat qms-line-stat--accepted">
          <span className="qms-line-stat-icon" aria-hidden="true"><CheckCircle2 size={20} /></span>
          <span className="qms-line-stat-copy"><span>مقبولة</span><strong>{summaryCounts.accepted}</strong></span>
        </div>
        <div className="qms-line-stat qms-line-stat--rejected">
          <span className="qms-line-stat-icon" aria-hidden="true"><XCircle size={20} /></span>
          <span className="qms-line-stat-copy"><span>مرفوضة</span><strong>{summaryCounts.rejected}</strong></span>
        </div>
        <div className="qms-line-stat qms-line-stat--samples">
          <span className="qms-line-stat-icon" aria-hidden="true"><PackageCheck size={20} /></span>
          <span className="qms-line-stat-copy"><span>إجمالي العينات</span><strong>{summaryCounts.samples}</strong></span>
        </div>
      </section>

      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">القسم</h2>
        <SectorSwitch value={sector} onChange={(value) => {
          setSector(value);
          setProductionTagId('');
          setLineId('');
          setLineFilter('');
        }} />
        {visibleProductionTags.length === 0 ? (
          <p className="qms-muted">لا توجد أوسمة نشطة لهذا القسم. أضف وسم الخط والمنتج من إعدادات الجودة.</p>
        ) : null}
      </section>
      <section className="qms-card qms-reject-limit">
        <div className="qms-reject-limit-control">
          <label>
            <span className="qms-label">حد العيوب للرفض التلقائي للبالتة</span>
            <input
              className="qms-input"
              type="number"
              min={0}
              step={1}
              value={rejectLimit}
              disabled={!can('quality.settings.manage')}
              onChange={(event) => setRejectLimit(Math.max(0, Number(event.target.value)))}
            />
          </label>
          <p className="qms-muted">تُرفض البالتة تلقائيًا إذا تجاوز مجموع العيوب هذا الحد. يمكنك تعديل الحد لكل سحبة عند إنهاء الفحص.</p>
        </div>
        {can('quality.settings.manage') ? (
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving} onClick={() => void saveRejectLimit()}>
            حفظ حد الرفض
          </button>
        ) : null}
      </section>

      <section className="qms-card qms-pull-form">
        <div className="qms-pull-form-heading">
          <span className="qms-pull-form-mark" aria-hidden="true">＋</span>
          <div>
            <h2 className="qms-title">تسجيل سحبة عينات جديدة</h2>
            <p className="qms-muted">اختَر بيانات التشغيل أولًا، ثم حدّد حجم العينة وسجّل السحبة.</p>
          </div>
        </div>
        <div className="qms-pull-setup" aria-label="اكتمال بيانات السحبة">
          {pullSetupSteps.map((step, index) => (
            <div className={`qms-pull-setup-step${step.complete ? ' is-complete' : ''}`} key={step.label}>
              <span className="qms-pull-setup-number">{step.complete ? <CheckCircle2 size={17} aria-hidden="true" /> : index + 1}</span>
              <span><strong>{step.label}</strong><small>{step.value}</small></span>
            </div>
          ))}
        </div>
        <div className="qms-pull-selection-box">
          <div className="qms-pull-selection-column">
            <span className="qms-pull-selection-title">وسم الخط والمنتج</span>
            <div className="qms-pull-card-list">
              {visibleProductionTags.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  className={`qms-pull-option-card${productionTagId === tag.id ? ' is-selected' : ''}`}
                  onClick={() => {
                    setProductionTagId(tag.id);
                    setLineId(tag.lineId || `quality-tag:${tag.id}`);
                    const station = stations.find((item) => item.id === stationId);
                    setInspectorId(station?.defaultInspectorEmployeeId || '');
                  }}
                >
                  <span className="qms-pull-option-mark">خط</span>
                  <span><strong>{tag.lineName}</strong><small>{tag.productName}</small></span>
                  {productionTagId === tag.id ? <CheckCircle2 size={18} aria-hidden="true" /> : null}
                </button>
              ))}
              {visibleProductionTags.length === 0 ? <p className="qms-muted">لا توجد أوسمة نشطة لهذا القسم.</p> : null}
            </div>
          </div>
          <div className="qms-pull-selection-column">
            <span className="qms-pull-selection-title">محطة الفحص والمراقب</span>
            <div className="qms-pull-card-list">
              {stations.map((station) => (
                <button
                  type="button"
                  key={station.id}
                  className={`qms-pull-option-card${stationId === station.id ? ' is-selected' : ''}`}
                  onClick={() => {
                    setStationId(station.id);
                    setInspectorId(station.defaultInspectorEmployeeId || '');
                  }}
                >
                  <span className="qms-pull-option-mark is-station">محطة</span>
                  <span><strong>{station.name}</strong><small>{station.defaultInspectorName || 'المراقب غير محدد'}</small></span>
                  {stationId === station.id ? <CheckCircle2 size={18} aria-hidden="true" /> : null}
                </button>
              ))}
              {stations.length === 0 ? <p className="qms-muted">لا توجد محطات نشطة.</p> : null}
            </div>
          </div>
        </div>
        <div className="qms-pull-form-grid">
          <label>
            <span className="qms-label">تاريخ السحب</span>
            <input className="qms-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <MasterSelect
            label="فترة السحب"
            value={slotKey}
            onChange={(value) => {
              setSlotKey(value);
              try {
                localStorage.setItem(`quality:line-sample-slot:${activeTenantId()}`, value);
              } catch {
                // localStorage can be unavailable in restricted browser sessions.
              }
            }}
            placeholder="اختر فترة السحب..."
            options={slots.map((slot) => ({ value: slot.slotKey, label: `${slot.startTime}–${slot.endTime}` }))}
          />
          <label>
            <span className="qms-label">إجمالي عينات السحبة</span>
            <input className="qms-input" type="number" min={1} step={1} value={sampleCount} onChange={(event) => setSampleCount(Number(event.target.value))} />
          </label>
        </div>
        <div className="qms-inspector-distribution">
          <div className="qms-inspector-distribution-header">
            <div>
              <strong>توزيع العينات على المراقبين</strong>
              <small>إجمالي السحبة {totalSampleCount} عينة؛ المراقب الأساسي يأخذ المتبقي تلقائيًا.</small>
            </div>
          </div>
          <div className="qms-inspector-split">
            <div className="qms-inspector-primary">
              <span className="qms-pull-option-mark is-primary">أساسي</span>
              <span><strong>{selectedStation?.defaultInspectorName || 'المراقب الأساسي للمحطة'}</strong><small>العدد التلقائي: {primarySampleCount} عينة</small></span>
            </div>
            {additionalInspectors.map((item) => (
              <div className="qms-inspector-additional" key={item.employeeId}>
                <span className="qms-pull-option-mark is-additional">إضافي</span>
                <span className="qms-inspector-additional-name"><strong>{item.employeeName}</strong><small>مراقب إضافي</small></span>
                <label>
                  <span>العدد</span>
                  <input
                    className="qms-input"
                    type="number"
                    min={1}
                    step={1}
                    value={item.sampleCount}
                    onChange={(event) => updateAdditionalInspectorCount(item.employeeId, Number(event.target.value))}
                  />
                </label>
                <button type="button" className="qms-btn qms-btn-ghost qms-btn-danger" onClick={() => setAdditionalInspectors((current) => current.filter((entry) => entry.employeeId !== item.employeeId))}>إزالة</button>
              </div>
            ))}
          </div>
          <div className="qms-add-inspector">
            <MasterSelect
              label="إضافة مراقب إضافي"
              value=""
              onChange={addAdditionalInspector}
              placeholder="اختر مراقبًا إضافيًا..."
              options={technicians
                .filter((technician) => technician.isActive !== false
                  && technician.id !== selectedStation?.defaultInspectorTechnicianId
                  && !additionalInspectors.some((item) => item.employeeId === technician.id))
                .map((technician) => ({
                  value: technician.id,
                  label: `${technician.name} (${technician.code})`,
                }))}
            />
          </div>
          {additionalAssignedCount >= sampleCount ? (
            <p className="qms-error qms-inline-error">توزيع المراقبين الإضافيين يستهلك كامل السحبة؛ يجب ترك عينة للمراقب الأساسي.</p>
          ) : null}
        </div>
        <div className="qms-form-actions">
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !canCreatePull} onClick={() => void create()}>
            ▣ تسجيل السحبة
          </button>
        </div>
      </section>

      <section className="qms-card qms-pull-records">
        <div className="qms-row qms-record-heading">
          <h2 className="qms-title">سجل سحبات العينات</h2>
          {canPrintSamples ? (
            <button type="button" className="qms-btn qms-btn-ghost" disabled={rows.length === 0} onClick={() => {
              const scoped = rowsMatchingTenant(rows, activeTenantId());
              if (scoped.length === 0) return;
              void Promise.all([
                qualitySampleService.withPullDefects(scoped),
                qualitySampleService.listPeriodStatuses(date),
              ]).then(([detailed, periods]) => {
                const lineNames = Object.fromEntries(masters.lines.map((line) => [line.id || '', line.name]));
                printDocument({
                  documentTitle: `سحب-خطوط-${date}`,
                  printSettings: printTemplate,
                  render: (ref) => (
                    <QualityLinePullPrint
                      ref={ref}
                      date={date}
                      rows={detailed}
                      periods={rowsMatchingTenant(periods, activeTenantId())}
                      lineNames={lineNames}
                      printSettings={printTemplate}
                    />
                  ),
                });
              }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تجهيز الطباعة')));
            }}>طباعة</button>
          ) : null}
        </div>
        <div className="qms-line-pull-filters">
          <label>
            <span className="qms-label">تاريخ السحب</span>
            <input className="qms-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span className="qms-label">خط الإنتاج</span>
            <select className="qms-input" value={lineFilter} onChange={(event) => setLineFilter(event.target.value)}>
              <option value="">كل الخطوط</option>
              {lineFilterOptions.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
            </select>
          </label>
          <label>
            <span className="qms-label">فترة السحب</span>
            <select className="qms-input" value={slotFilter} onChange={(event) => setSlotFilter(event.target.value)}>
              <option value="">كل الفترات</option>
              {pullSlotOptions.map((slot) => <option key={slot.slotKey} value={slot.slotKey}>{slot.startTime}–{slot.endTime}{slot.isActive ? '' : ' (متوقفة)'}</option>)}
            </select>
          </label>
          <label>
            <span className="qms-label">حالة الفحص</span>
            <select className="qms-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">كل الحالات</option>
              <option value="pending">قيد الفحص</option>
              <option value="completed">مكتملة</option>
            </select>
          </label>
          <button type="button" className="qms-btn qms-btn-ghost" onClick={() => {
            setLineFilter('');
            setSlotFilter('');
            setStatusFilter('all');
          }}>إعادة ضبط الفلاتر</button>
        </div>
        <div className="qms-line-status-legend" aria-label="دليل ألوان حالات الفحص">
          <span><i className="qms-line-status-dot is-pending" />قيد الفحص</span>
          <span><i className="qms-line-status-dot is-accepted" />مقبولة</span>
          <span><i className="qms-line-status-dot is-rejected" />مرفوضة</span>
        </div>
        <div className="qms-table-wrap">
          <table className="qms-table qms-line-pull-table">
            <thead><tr><th>التاريخ</th><th>الفترة</th><th>خط الإنتاج</th><th>المنتج</th><th>محطة الفحص</th><th>المراقب</th><th>العينات</th><th>العيوب</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className={`qms-line-pull-row ${row.status !== 'completed' ? 'is-pending' : row.palletRejected ? 'is-rejected' : 'is-accepted'}`}>
                  <td>{row.date}</td>
                  <td>{row.startTime}–{row.endTime}</td>
                  <td>{row.lineName}</td>
                  <td>{row.productName}</td>
                  <td>{row.stationName}</td>
                  <td>{row.inspectorName}{row.additionalInspectors?.length
                    ? ` + ${row.additionalInspectors.map((item) => `${item.employeeName} (${item.sampleCount})`).join(' + ')}`
                    : row.additionalInspectorName ? ` + ${row.additionalInspectorName} (${row.additionalSampleCount} عينة)` : ''}</td>
                  <td><span className="qms-line-count qms-line-count--samples">{totalLinePullSampleCount(row)}</span></td>
                  <td><span className={`qms-line-count${row.defectCount > 0 ? ' qms-line-count--defects' : ''}`}>{row.defectCount}</span></td>
                  <td>
                    <span className={`qms-line-status${row.status !== 'completed' ? ' is-pending' : row.palletRejected ? ' is-rejected' : ' is-accepted'}`}>
                      <i className={`qms-line-status-dot${row.status !== 'completed' ? ' is-pending' : row.palletRejected ? ' is-rejected' : ' is-accepted'}`} />
                      {row.status !== 'completed' ? 'قيد الفحص' : row.palletRejected ? 'مرفوضة' : 'مقبولة'}
                    </span>
                  </td>
                  <td className="qms-line-pull-actions">
                    <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void openInspection(row)}>
                      {row.status === 'completed' ? 'عرض الفحص' : 'فتح الفحص'}
                    </button>
                    {can('quality.samples.inspect')
                      && (row.status !== 'completed' || can('quality.records.reopen'))
                      && (row.defectCount === 0 || can('quality.defects.record')) ? (
                        <button type="button" className="qms-btn qms-btn-ghost" disabled={saving} onClick={() => void openEdit(row)}>تعديل</button>
                      ) : null}
                    {can('quality.records.delete') ? (
                      <button type="button" className="qms-btn qms-btn-ghost qms-btn-danger" disabled={saving} onClick={() => void deletePull(row)}>
                        {row.status === 'pending' ? 'إلغاء الفحص' : 'حذف'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 ? <p className="qms-muted">لا توجد سحبات تطابق الفلاتر المحددة.</p> : null}
        </div>
      </section>

      <Dialog open={inspectionOpen} onOpenChange={setInspectionOpen}>
        <DialogContent dir="rtl" className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{active ? `فحص السحبة — ${active.lineName} / ${active.startTime}–${active.endTime}` : 'فحص السحبة'}</DialogTitle>
            <DialogDescription>سجّل أسباب العيوب واتخذ قرار السحبة قبل اعتمادها.</DialogDescription>
          </DialogHeader>
          {active ? (
            <div className="qms-dialog-body">
              <p className="qms-muted">التاريخ: {active.date} — المنتج: {active.productName} — العينة: {totalLinePullSampleCount(active)} قطعة</p>
              {active.status === 'completed' ? (
                <p className={active.palletRejected ? 'qms-inspection-result qms-inspection-rejected' : 'qms-inspection-result qms-inspection-accepted'}>
                  الفحص مكتمل — القرار: {active.palletRejected ? 'مرفوض' : 'مقبول'} — طريقة القرار: {active.decisionMode === 'manual_accept' ? 'قبول يدوي' : active.decisionMode === 'manual_reject' ? 'رفض يدوي' : 'تلقائي'}
                </p>
              ) : can('quality.samples.inspect') ? (
                <>
                  {can('quality.defects.record') ? (
                    <div className="qms-line-defect-form">
                      <MasterSelect
                        label="سبب العيب"
                        value={reasonId}
                        onChange={setReasonId}
                        placeholder="ابحث عن سبب العيب..."
                        options={masters.reasons.map((reason) => ({
                          value: reason.id,
                          label: `${reason.labelAr} (${reason.code})`,
                          keywords: reason.category,
                        }))}
                      />
                      <label><span className="qms-label">عدد مرات الظهور</span><input className="qms-input" type="number" min={1} step={1} value={defectCount} onChange={(event) => setDefectCount(Number(event.target.value))} /></label>
                      <label><span className="qms-label">ملاحظة فنية</span><input className="qms-input" value={defectNotes} onChange={(event) => setDefectNotes(event.target.value)} /></label>
                      <button type="button" className="qms-btn qms-btn-ghost" disabled={saving} onClick={addDefect}>إضافة العيب</button>
                    </div>
                  ) : <p className="qms-muted">ليست لديك صلاحية تسجيل العيوب.</p>}
                  {can('quality.settings.manage') ? (
                    <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setNewReasonOpen((current) => !current)}>
                      {newReasonOpen ? 'إلغاء إضافة سبب' : 'العيب غير موجود؟ أضف سببًا جديدًا'}
                    </button>
                  ) : null}
                  {newReasonOpen ? (
                    <div className="qms-new-reason-form">
                      <label><span className="qms-label">اسم العيب</span><input className="qms-input" value={newReasonDraft.labelAr} onChange={(event) => setNewReasonDraft((current) => ({ ...current, labelAr: event.target.value }))} /></label>
                      <label><span className="qms-label">التصنيف</span><input className="qms-input" value={newReasonDraft.category} onChange={(event) => setNewReasonDraft((current) => ({ ...current, category: event.target.value }))} /></label>
                      <button type="button" className="qms-btn qms-btn-primary" disabled={saving} onClick={() => void saveNewReason()}>حفظ السبب</button>
                    </div>
                  ) : null}
                </>
              ) : <p className="qms-muted">ليست لديك صلاحية إنهاء الفحص.</p>}

              <div className="qms-line-defect-list">
                {defects.length > 0 ? defects.map((defect, index) => (
                  <div className="qms-row qms-defect-entry" key={`${defect.reasonId}-${index}`}>
                    <span className="qms-defect-edit-row">
                      <strong>{defect.reasonLabel}</strong>
                      {defect.notes ? <small>{defect.notes}</small> : null}
                      {active.status === 'pending' && can('quality.defects.record') ? (
                        <label>
                          <span>العدد</span>
                          <input className="qms-input" type="number" min={1} step={1} value={defect.count} onChange={(event) => updateDefectCount(index, Number(event.target.value))} />
                        </label>
                      ) : <b>× {defect.count}</b>}
                    </span>
                    {active.status === 'pending' && can('quality.defects.record') ? (
                      <button type="button" className="qms-btn qms-btn-ghost" disabled={saving} onClick={() => setDefects((current) => current.filter((_, itemIndex) => itemIndex !== index))}>حذف</button>
                    ) : null}
                  </div>
                )) : <p className="qms-muted">لم تُسجل عيوب لهذه السحبة.</p>}
              </div>

              {active.status === 'pending' && can('quality.samples.inspect') ? (
                <>
                  <div className="qms-decision-grid">
                    <label><span className="qms-label">حد الرفض لهذه السحبة</span><input className="qms-input" type="number" min={0} step={1} value={completionRejectLimit} onChange={(event) => setCompletionRejectLimit(Math.max(0, Number(event.target.value)))} /></label>
                    <p className="qms-muted">إجمالي العيوب: {defects.reduce((sum, defect) => sum + defect.count, 0)} — الرفض التلقائي عند تجاوز {completionRejectLimit}</p>
                  </div>
                  <fieldset className="qms-decision-options">
                    <legend className="qms-label">قرار السحبة</legend>
                    <label><input type="radio" name="pull-decision" checked={decisionMode === 'auto'} onChange={() => setDecisionMode('auto')} /> تلقائي حسب حد الرفض</label>
                    <label><input type="radio" name="pull-decision" checked={decisionMode === 'manual_accept'} onChange={() => setDecisionMode('manual_accept')} /> قبول يدوي</label>
                    <label><input type="radio" name="pull-decision" checked={decisionMode === 'manual_reject'} onChange={() => setDecisionMode('manual_reject')} /> رفض يدوي</label>
                  </fieldset>
                  {decisionMode === 'manual_accept' ? <p className="qms-muted">القبول اليدوي يتجاوز نتيجة حد الرفض التلقائي، ويُحفظ كقرار يدوي.</p> : null}
                  {decisionMode === 'manual_reject' ? <p className="qms-muted">الرفض اليدوي يتجاوز نتيجة حد الرفض التلقائي، ويُحفظ كقرار يدوي.</p> : null}
                </>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setInspectionOpen(false)}>إغلاق</button>
            {active?.status === 'pending' && can('quality.samples.inspect') ? (
              <button type="button" className="qms-btn qms-btn-primary" disabled={saving} onClick={() => void complete()}>إنهاء الفحص واعتماد القرار</button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stationDialogOpen} onOpenChange={setStationDialogOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>إدارة محطات الفحص</DialogTitle>
            <DialogDescription>أضف المحطة واختر فنيًا من دليل فنيي الجودة. إيقاف المحطة لا يحذف السجلات السابقة.</DialogDescription>
          </DialogHeader>
          <div className="qms-dialog-body">
            <div className="qms-station-form">
              <label><span className="qms-label">اسم محطة الفحص</span><input className="qms-input" value={stationDraft.name} onChange={(event) => setStationDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <MasterSelect
                label="فني الجودة"
                value={stationDraft.technicianId}
                onChange={(technicianId) => setStationDraft((current) => ({ ...current, technicianId }))}
                placeholder="اختر فنيًا مسجلًا"
                options={technicians.map((technician) => ({
                  value: technician.id,
                  label: `${technician.name} (${technician.code})`,
                }))}
              />
              <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !stationDraft.name.trim() || !stationDraft.technicianId} onClick={() => void saveStation()}>
                {stationDraft.id ? 'حفظ التعديل' : 'إضافة المحطة'}
              </button>
              {stationDraft.id ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setStationDraft({ id: '', name: '', technicianId: '' })}>إلغاء التعديل</button> : null}
            </div>
            <div className="qms-master-list">
              {managedStations.map((station) => (
                <div className="qms-master-list-item" key={station.id}>
                  <span>
                    <strong>{station.name}</strong>{station.isActive === false ? ' — متوقفة' : ''}
                    <small className="qms-muted">
                      {' '}— الفني: {technicians.find((item) => item.id === station.defaultInspectorTechnicianId)?.name || station.defaultInspectorName || 'غير محدد'}
                    </small>
                  </span>
                  <div className="qms-row">
                    <button type="button" className="qms-btn qms-btn-ghost" disabled={station.isActive === false} onClick={() => setStationDraft({
                      id: station.id,
                      name: station.name,
                      technicianId: station.defaultInspectorTechnicianId || '',
                    })}>تعديل</button>
                    {station.isActive !== false ? <button type="button" className="qms-btn qms-btn-ghost qms-btn-danger" disabled={saving} onClick={() => void hideStation(station)}>إيقاف</button> : null}
                  </div>
                </div>
              ))}
              {managedStations.length === 0 ? <p className="qms-muted">لا توجد محطات فحص بعد.</p> : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={slotDialogOpen} onOpenChange={setSlotDialogOpen}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader>
            <DialogTitle>إدارة فترات السحب</DialogTitle>
            <DialogDescription>حدد وقت بداية ونهاية كل فترة. الفترات التي أُوقف استخدامها تبقى مرتبطة بالسحبات السابقة.</DialogDescription>
          </DialogHeader>
          <div className="qms-dialog-body">
            <div className="qms-slot-form">
              <label><span className="qms-label">من</span><input className="qms-input" type="time" value={slotDraft.startTime} onChange={(event) => setSlotDraft((current) => ({ ...current, startTime: event.target.value }))} /></label>
              <label><span className="qms-label">إلى</span><input className="qms-input" type="time" value={slotDraft.endTime} onChange={(event) => setSlotDraft((current) => ({ ...current, endTime: event.target.value }))} /></label>
              <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !slotDraft.startTime || !slotDraft.endTime} onClick={() => void saveSlot()}>إضافة الفترة</button>
            </div>
            <div className="qms-master-list">
              {managedSlots.map((slot) => (
                <div className="qms-master-list-item" key={slot.id}>
                  <span><strong>{slot.startTime}–{slot.endTime}</strong>{slot.isActive ? '' : ' — متوقفة'}</span>
                  {slot.isActive && !slot.id.startsWith('standard-') ? (
                    <button type="button" className="qms-btn qms-btn-ghost qms-btn-danger" disabled={saving} onClick={() => void hideSlot(slot)}>إيقاف</button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDraft} onOpenChange={(open) => { if (!open && !saving) setEditDraft(null); }}>
        <DialogContent dir="rtl" className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>تعديل سحبة العينات</DialogTitle>
            <DialogDescription>عدّل سياق الفحص والعينة والعيوب. تعديل السحبة المكتملة يتطلب سبب إعادة الفتح ثم يعيد اعتمادها بالقرار المحدد.</DialogDescription>
          </DialogHeader>
          {editDraft ? (
            <div className="qms-dialog-body">
              <div className="qms-edit-pull-grid">
                <label><span className="qms-label">تاريخ السحب</span><input className="qms-input" type="date" value={editDraft.date} onChange={(event) => updateEditDraft('date', event.target.value)} /></label>
                <MasterSelect
                  label="وسم الخط والمنتج"
                  value={editDraft.productionTagId}
                  onChange={(value) => {
                    const tag = editProductionTags.find((item) => item.id === value);
                    if (!tag) return;
                    setEditDraft((current) => current ? {
                      ...current,
                      productionTagId: value,
                      lineId: tag.lineId || `quality-tag:${tag.id}`,
                      lineName: tag.lineName,
                      productId: tag.productId,
                      productName: tag.productName,
                      sector: tag.sector,
                    } : current);
                  }}
                  placeholder="اختر الوسم..."
                  options={editProductionTags.map((tag) => ({
                    value: tag.id,
                    label: `${tag.lineName} — ${tag.productName}${tag.isActive === false ? ' (موقوف)' : ''}`,
                  }))}
                />
                <MasterSelect label="محطة الفحص" value={editDraft.stationId} onChange={(value) => {
                  const station = editStations.find((item) => item.id === value);
                  setEditDraft((current) => current ? {
                    ...current,
                    stationId: value,
                    inspectorEmployeeId: station?.defaultInspectorEmployeeId || '',
                    inspectorName: station?.defaultInspectorName || '',
                  } : current);
                }} placeholder="اختر المحطة..." options={editStations.map((station) => ({ value: station.id, label: station.isActive === false ? `${station.name} (متوقفة)` : station.name }))} />
                <MasterSelect label="الفترة" value={editDraft.slotKey} onChange={(value) => updateEditDraft('slotKey', value)} placeholder="اختر الفترة..." options={editSlotOptions.map((slot) => ({ value: slot.slotKey, label: `${slot.startTime}–${slot.endTime}${slot.isActive ? '' : ' (متوقفة)'}` }))} />
                <label><span className="qms-label">مراقب المحطة</span><input className="qms-input" value={editStationInspectorName} readOnly placeholder="اختر محطة الفحص أولاً" /></label>
                <label><span className="qms-label">إجمالي عينات السحبة</span><input className="qms-input" type="number" min={1} step={1} value={editDraft.sampleCount} onChange={(event) => updateEditDraft('sampleCount', Number(event.target.value))} /></label>
                <label><span className="qms-label">حد الرفض</span><input className="qms-input" type="number" min={0} step={1} value={editDraft.rejectLimit} onChange={(event) => updateEditDraft('rejectLimit', Math.max(0, Number(event.target.value)))} /></label>
              </div>
              <div className="qms-inspector-distribution">
                <div className="qms-inspector-distribution-header"><strong>توزيع العينات على المراقبين</strong></div>
                <div className="qms-inspector-split">
                  <div className="qms-inspector-primary">
                    <span className="qms-pull-option-mark is-primary">أساسي</span>
                    <span><strong>{editStationInspectorName || 'المراقب الأساسي'}</strong><small>المتبقي: {editDraft.sampleCount - editDraft.additionalInspectors.reduce((sum, item) => sum + item.sampleCount, 0)} عينة</small></span>
                  </div>
                  {editDraft.additionalInspectors.map((item) => (
                    <div className="qms-inspector-additional" key={item.employeeId}>
                      <span className="qms-pull-option-mark is-additional">إضافي</span>
                      <span className="qms-inspector-additional-name"><strong>{item.employeeName}</strong></span>
                      <label><span>العدد</span><input className="qms-input" type="number" min={1} step={1} value={item.sampleCount} onChange={(event) => updateEditDraft('additionalInspectors', editDraft.additionalInspectors.map((entry) => entry.employeeId === item.employeeId
                        ? { ...entry, sampleCount: Math.max(0, Math.floor(Number(event.target.value))) }
                        : entry))} /></label>
                      <button type="button" className="qms-btn qms-btn-ghost qms-btn-danger" onClick={() => updateEditDraft('additionalInspectors', editDraft.additionalInspectors.filter((entry) => entry.employeeId !== item.employeeId))}>إزالة</button>
                    </div>
                  ))}
                </div>
                <div className="qms-add-inspector">
                  <MasterSelect
                    label="إضافة مراقب إضافي"
                    value=""
                    onChange={(employeeId) => {
                      const technician = technicians.find((item) => item.id === employeeId);
                      if (!technician || technician.id === editStation?.defaultInspectorTechnicianId
                        || editDraft.additionalInspectors.some((item) => item.employeeId === technician.id)) return;
                      updateEditDraft('additionalInspectors', [...editDraft.additionalInspectors, {
                        employeeId: technician.id,
                        employeeName: technician.name,
                        sampleCount: 1,
                      }]);
                    }}
                    placeholder="اختر مراقبًا إضافيًا..."
                    options={technicians
                      .filter((technician) => technician.isActive !== false
                        && technician.id !== editStation?.defaultInspectorTechnicianId
                        && !editDraft.additionalInspectors.some((item) => item.employeeId === technician.id))
                      .map((technician) => ({
                        value: technician.id,
                        label: `${technician.name} (${technician.code})`,
                      }))}
                  />
                </div>
              </div>
              {editDraft.originalStatus === 'completed' ? (
                <label><span className="qms-label">سبب إعادة الفتح</span><input className="qms-input" value={editDraft.reopenReason} onChange={(event) => updateEditDraft('reopenReason', event.target.value)} /></label>
              ) : null}
              <h3 className="qms-subtitle">العيوب المسجلة</h3>
              {can('quality.defects.record') ? (
                <div className="qms-line-defect-form">
                  <MasterSelect label="سبب العيب" value={editReasonId} onChange={setEditReasonId} placeholder="ابحث عن سبب العيب..." options={masters.reasons.map((reason) => ({ value: reason.id, label: `${reason.labelAr} (${reason.code})`, keywords: reason.category }))} />
                  <label><span className="qms-label">العدد</span><input className="qms-input" type="number" min={1} step={1} value={editDefectCount} onChange={(event) => setEditDefectCount(Number(event.target.value))} /></label>
                  <label><span className="qms-label">ملاحظات</span><input className="qms-input" value={editDefectNotes} onChange={(event) => setEditDefectNotes(event.target.value)} /></label>
                  <button type="button" className="qms-btn qms-btn-ghost" onClick={addEditDefect}>إضافة</button>
                </div>
              ) : null}
              <div className="qms-line-defect-list">
                {editDraft.defects.map((defect, index) => (
                  <div className="qms-row qms-defect-entry" key={`${defect.reasonId}-${index}`}>
                    <span className="qms-defect-edit-row">
                      <strong>{defect.reasonLabel}</strong>
                      {defect.notes ? <small>{defect.notes}</small> : null}
                      {can('quality.defects.record') ? (
                        <label>
                          <span>العدد</span>
                          <input className="qms-input" type="number" min={1} step={1} value={defect.count} onChange={(event) => {
                            const count = Math.max(1, Math.floor(Number(event.target.value)));
                            updateEditDraft('defects', editDraft.defects.map((item, itemIndex) => itemIndex === index
                              ? { ...item, count }
                              : item));
                          }} />
                        </label>
                      ) : <b>× {defect.count}</b>}
                    </span>
                    {can('quality.defects.record') ? (
                      <button type="button" className="qms-btn qms-btn-ghost" onClick={() => updateEditDraft('defects', editDraft.defects.filter((_, itemIndex) => itemIndex !== index))}>حذف</button>
                    ) : null}
                  </div>
                ))}
                {editDraft.defects.length === 0 ? <p className="qms-muted">لا توجد عيوب مسجلة.</p> : null}
              </div>
              <p className="qms-muted">إجمالي العيوب: {editDefectTotal}</p>
              {editDraft.originalStatus === 'completed' ? (
                <fieldset className="qms-decision-options">
                  <legend className="qms-label">قرار السحبة بعد التعديل</legend>
                  <label><input type="radio" name="edit-pull-decision" checked={editDraft.decisionMode === 'auto'} onChange={() => updateEditDraft('decisionMode', 'auto')} /> تلقائي حسب حد الرفض</label>
                  <label><input type="radio" name="edit-pull-decision" checked={editDraft.decisionMode === 'manual_accept'} onChange={() => updateEditDraft('decisionMode', 'manual_accept')} /> قبول يدوي</label>
                  <label><input type="radio" name="edit-pull-decision" checked={editDraft.decisionMode === 'manual_reject'} onChange={() => updateEditDraft('decisionMode', 'manual_reject')} /> رفض يدوي</label>
                </fieldset>
              ) : null}
              {editDraft.originalStatus === 'completed' && editDraft.decisionMode === 'manual_accept' ? <p className="qms-muted">القبول اليدوي يتجاوز نتيجة حد الرفض التلقائي.</p> : null}
              {editDraft.originalStatus === 'completed' && editDraft.decisionMode === 'manual_reject' ? <p className="qms-muted">الرفض اليدوي يتجاوز نتيجة حد الرفض التلقائي.</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <button type="button" className="qms-btn qms-btn-ghost" disabled={saving} onClick={() => setEditDraft(null)}>إلغاء</button>
            <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !can('quality.samples.inspect')} onClick={() => void saveEdit()}>
              {editDraft?.originalStatus === 'completed' ? 'حفظ وإعادة الاعتماد' : 'حفظ التعديلات'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </QmsPage>
  );
};
