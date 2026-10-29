import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { STANDARD_AQL_LEVEL_II, type AqlPlanRange } from '../domain/aql';
import type { QualitySector } from '../domain/sector';
import type { QualityReason, QualitySampleSlot, QualitySectorTag, QualityStation } from '../model';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualitySettingsService } from '../services/qualitySettingsService';
import { inspectorOptions, useQualityAssignments } from '../hooks/useQualityAssignments';
import { MasterSelect, QmsPage, useQualityMasters } from '../qms/QmsChrome';

export const QualitySettings: React.FC = () => {
  const { can } = usePermission();
  const masters = useQualityMasters();
  const allEmployees = useAppStore((state) => state._rawEmployees);
  const staff = useQualityAssignments();
  const canManage = can('quality.settings.manage');
  const [plans, setPlans] = useState<AqlPlanRange[]>([]);
  const [usingStandard, setUsingStandard] = useState(true);
  const [closeRequired, setCloseRequired] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [reasonLabel, setReasonLabel] = useState('');
  const [reasonCategory, setReasonCategory] = useState('عام');
  const [reasonSector, setReasonSector] = useState<'' | QualitySector>('');
  const [editingReasonId, setEditingReasonId] = useState('');
  const [catalogReasons, setCatalogReasons] = useState<QualityReason[]>([]);
  const [stationName, setStationName] = useState('');
  const [stationInspector, setStationInspector] = useState('');
  const [editingStationId, setEditingStationId] = useState('');
  const [tagEntity, setTagEntity] = useState('');
  const [tagType, setTagType] = useState<'product' | 'line'>('product');
  const [tagSector, setTagSector] = useState<QualitySector>('home');
  const [stations, setStations] = useState<QualityStation[]>([]);
  const [slots, setSlots] = useState<QualitySampleSlot[]>([]);
  const [tags, setTags] = useState<QualitySectorTag[]>([]);
  const [reasonQuery, setReasonQuery] = useState('');
  const [slotKind, setSlotKind] = useState<'hourly' | 'line'>('hourly');
  const [slotStart, setSlotStart] = useState('08:00');
  const [slotEnd, setSlotEnd] = useState('09:00');
  const [planForm, setPlanForm] = useState<AqlPlanRange>({
    batchMin: 91, batchMax: 150, sampleSize: 20, acceptLimit: 2, rejectLimit: 3, aqlLevel: 'المستوى العام الثاني (Level II)', isActive: true,
  });

  const load = async () => {
    const [saved, policies, nextStations, hourlySlots, lineSlots, nextTags, nextReasons] = await Promise.all([
      qualitySettingsService.listAqlPlans(),
      qualitySettingsService.getPolicies(),
      qualitySettingsService.listStations({ includeInactive: true }),
      qualitySettingsService.listSlots('hourly'),
      qualitySettingsService.listSlots('line'),
      qualitySettingsService.listSectorTags(),
      qualitySettingsService.listReasons(),
    ]);
    setCatalogReasons(nextReasons);
    setStations(nextStations);
    setSlots([...hourlySlots, ...lineSlots]);
    setTags(nextTags);
    const active = saved.filter((plan) => plan.isActive);
    setUsingStandard(active.length === 0);
    setPlans(active.length > 0 ? active : STANDARD_AQL_LEVEL_II);
    setCloseRequired(policies.closeRequiresQualityApproval);
  };

  useEffect(() => { void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر التحميل'))); }, []);

  const save = async (work: () => Promise<void>, message: string) => {
    try {
      await work();
      toast.success(message);
      masters.reloadAux();
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر الحفظ'));
    }
  };

  return (
    <QmsPage title="إعدادات الجودة" subtitle="معايير الفحص ووسوم القطاع. الأجهزة المنزلية والسريا وسمان للجودة وليسا قسم موارد بشرية ولا تصنيف منتج.">
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">إغلاق أمر الشغل</h2>
        <label className="qms-row">
          <input type="checkbox" checked={closeRequired} disabled={!canManage} onChange={(event) => setCloseRequired(event.target.checked)} />
          <span>منع إغلاق أمر الشغل قبل اعتماد الجودة</span>
        </label>
        <p className="qms-muted">يُقبل الإغلاق إذا كانت حالة الجودة القديمة معتمدة أو غير مطلوبة، أو إذا كانت كل بالته مرتبطة بالأمر مكتملة ومقبولة.</p>
        <button type="button" className="qms-btn qms-btn-primary" disabled={!canManage} onClick={() => void save(() => qualitySettingsService.setPolicies({ closeRequiresQualityApproval: closeRequired }), 'تم حفظ السياسة')}>حفظ السياسة</button>
      </section>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">خطط AQL {usingStandard ? '(الجدول القياسي، لم يُحفظ بعد)' : ''}</h2>
        <table className="qms-table">
          <thead><tr><th>من</th><th>إلى</th><th>العينة</th><th>قبول</th><th>رفض</th></tr></thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={`${plan.batchMin}-${plan.batchMax}`}><td>{plan.batchMin}</td><td>{plan.batchMax}</td><td>{plan.sampleSize}</td><td>{plan.acceptLimit}</td><td>{plan.rejectLimit}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="qms-row" style={{ marginTop: 8 }}>
          <label><span className="qms-label">من</span><input className="qms-input" type="number" value={planForm.batchMin} onChange={(event) => setPlanForm({ ...planForm, batchMin: Number(event.target.value) })} /></label>
          <label><span className="qms-label">إلى</span><input className="qms-input" type="number" value={planForm.batchMax} onChange={(event) => setPlanForm({ ...planForm, batchMax: Number(event.target.value) })} /></label>
          <label><span className="qms-label">العينة</span><input className="qms-input" type="number" value={planForm.sampleSize} onChange={(event) => setPlanForm({ ...planForm, sampleSize: Number(event.target.value) })} /></label>
          <label><span className="qms-label">قبول</span><input className="qms-input" type="number" value={planForm.acceptLimit} onChange={(event) => setPlanForm({ ...planForm, acceptLimit: Number(event.target.value) })} /></label>
          <label><span className="qms-label">رفض</span><input className="qms-input" type="number" value={planForm.rejectLimit} onChange={(event) => setPlanForm({ ...planForm, rejectLimit: Number(event.target.value) })} /></label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={!canManage} onClick={() => void save(() => qualitySettingsService.saveAqlPlan(planForm), 'تم حفظ النطاق')}>حفظ النطاق</button>
        </div>
      </section>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">أسباب العيوب</h2>
        <label><span className="qms-label">بحث</span><input className="qms-input" value={reasonQuery} onChange={(event) => setReasonQuery(event.target.value)} placeholder="الرمز أو الاسم أو التصنيف" /></label>
        <table className="qms-table">
          <thead><tr><th>الرمز</th><th>الاسم</th><th>التصنيف</th><th>القطاع</th><th></th></tr></thead>
          <tbody>
            {catalogReasons.filter((reason) => {
              const query = reasonQuery.trim();
              return !query || `${reason.code} ${reason.labelAr} ${reason.category}`.includes(query);
            }).map((reason) => (
              <tr key={reason.id}>
                <td>{reason.code}</td>
                <td>{reason.labelAr}{reason.isActive === false ? ' — موقوف' : ''}</td>
                <td>{reason.category}</td>
                <td>{reason.sector === 'seria' ? 'السريا' : reason.sector === 'home' ? 'الأجهزة المنزلية' : 'مشترك'}</td>
                <td>{canManage ? (
                  <>
                    <button type="button" className="qms-btn qms-btn-ghost" onClick={() => {
                      setEditingReasonId(reason.id);
                      setReasonCode(reason.code);
                      setReasonLabel(reason.labelAr);
                      setReasonCategory(reason.category);
                      setReasonSector(reason.sector || '');
                    }}>تعديل</button>
                    {reason.isActive !== false ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void save(() => qualitySettingsService.deactivateReason(reason.id), 'تم إيقاف السبب')}>إيقاف</button> : null}
                  </>
                ) : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="qms-muted">الإيقاف يخفي السبب من التسجيل الجديد ويبقي العيوب المسجلة سابقاً. المصدر كان يحذف السجل؛ الحذف هنا غير مستخدم حتى لا تنقطع مراجع الفحص.</p>
        <div className="qms-row">
          <label><span className="qms-label">الرمز</span><input className="qms-input" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} /></label>
          <label><span className="qms-label">الاسم</span><input className="qms-input" value={reasonLabel} onChange={(event) => setReasonLabel(event.target.value)} /></label>
          <label><span className="qms-label">التصنيف</span><input className="qms-input" value={reasonCategory} onChange={(event) => setReasonCategory(event.target.value)} /></label>
          <label><span className="qms-label">القطاع</span>
            <select value={reasonSector} onChange={(event) => setReasonSector(event.target.value as '' | QualitySector)}>
              <option value="">مشترك</option>
              <option value="home">الأجهزة المنزلية</option>
              <option value="seria">السريا</option>
            </select>
          </label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={!canManage} onClick={() => void save(async () => {
            await qualitySettingsService.saveReason({
              id: editingReasonId || undefined,
              code: reasonCode,
              labelAr: reasonLabel,
              category: reasonCategory,
              sector: reasonSector || undefined,
              isActive: true,
            });
            setEditingReasonId('');
            setReasonCode('');
            setReasonLabel('');
          }, 'تم حفظ السبب')}>{editingReasonId ? 'حفظ التعديل' : 'إضافة سبب'}</button>
        </div>
      </section>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">محطات الفحص</h2>
        <div className="qms-row">
          <label><span className="qms-label">اسم المحطة</span><input className="qms-input" value={stationName} onChange={(event) => setStationName(event.target.value)} /></label>
          <MasterSelect label="المراقب الافتراضي" value={stationInspector} onChange={setStationInspector} placeholder="تعيين نشط" options={inspectorOptions(masters.employees, staff.assignments, { stationId: editingStationId || undefined, stationIsNew: !editingStationId })} />
          <button type="button" className="qms-btn qms-btn-primary" disabled={!canManage || !stationInspector} onClick={() => void save(async () => {
            await qualitySettingsService.saveStation({ id: editingStationId || undefined, name: stationName, defaultInspectorEmployeeId: stationInspector });
            setEditingStationId('');
            setStationName('');
          }, 'تم حفظ المحطة')}>{editingStationId ? 'حفظ تعديل المحطة' : 'حفظ المحطة'}</button>
        </div>
        <table className="qms-table">
          <thead><tr><th>المحطة</th><th>المراقب الافتراضي</th><th></th></tr></thead>
          <tbody>
            {stations.map((station) => {
              const inspector = allEmployees.find((employee) => employee.id === station.defaultInspectorEmployeeId);
              return (
                <tr key={station.id}>
                  <td>{station.name}{station.isActive === false ? ' — موقوفة' : ''}</td>
                  <td>{inspector ? inspector.name : '—'}</td>
                  <td>{canManage ? (
                    <>
                      <button type="button" className="qms-btn qms-btn-ghost" onClick={() => {
                        setEditingStationId(station.id);
                        setStationName(station.name);
                        setStationInspector(station.defaultInspectorEmployeeId || '');
                      }}>تعديل</button>
                      {station.isActive !== false ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void save(() => qualitySettingsService.hideStation(station.id), 'تم إيقاف المحطة')}>إيقاف</button> : null}
                    </>
                  ) : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="qms-muted">المحطة لها اسم ومراقب افتراضي فقط. لا يوجد رمز محطة ولا ربط إلزامي بخط أو منتج في المصدر. الإيقاف يخفيها من السحب الجديد.</p>
      </section>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">فترات السحب</h2>
        <p className="qms-muted">الفترات الظاهرة بلا معرف محفوظ هي الجدول القياسي 08:00–16:00. حفظ فترة ينشئ جدولاً خاصاً بالشركة.</p>
        <div className="qms-row">
          <label><span className="qms-label">النوع</span>
            <select value={slotKind} onChange={(event) => setSlotKind(event.target.value as 'hourly' | 'line')}>
              <option value="hourly">عينات الساعة</option>
              <option value="line">سحب الخط</option>
            </select>
          </label>
          <label><span className="qms-label">من</span><input className="qms-input" type="time" value={slotStart} onChange={(event) => setSlotStart(event.target.value)} /></label>
          <label><span className="qms-label">إلى</span><input className="qms-input" type="time" value={slotEnd} onChange={(event) => setSlotEnd(event.target.value)} /></label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={!canManage} onClick={() => void save(() => qualitySettingsService.saveSlot({
            slotKey: `${slotKind}-${slotStart}-${slotEnd}`,
            slotName: `${slotStart}–${slotEnd}`,
            startTime: slotStart,
            endTime: slotEnd,
            displayOrder: slots.filter((slot) => slot.kind === slotKind).length + 1,
            kind: slotKind,
            isActive: true,
          }), 'تم حفظ الفترة')}>حفظ الفترة</button>
        </div>
        <ul>
          {slots.filter((slot) => slot.kind === slotKind).map((slot) => (
            <li key={`${slot.kind}-${slot.id}`}>{slot.slotName}{slot.id.startsWith('standard-') ? ' — قياسي' : ''}</li>
          ))}
        </ul>
      </section>
      <section className="qms-card">
        <h2 className="qms-title">وسم قطاع الجودة</h2>
        <p className="qms-muted">الوسم يفلتر قوائم الجودة فقط. لا يغيّر قسم الموظف ولا فئة المنتج.</p>
        <div className="qms-row">
          <label><span className="qms-label">النوع</span>
            <select value={tagType} onChange={(event) => setTagType(event.target.value as 'product' | 'line')}>
              <option value="product">منتج</option>
              <option value="line">خط</option>
            </select>
          </label>
          <MasterSelect
            label={tagType === 'product' ? 'المنتج' : 'الخط'}
            value={tagEntity}
            onChange={setTagEntity}
            placeholder="اختر"
            options={(tagType === 'product' ? masters.products : masters.lines).map((item) => ({
              value: item.id || '',
              label: 'code' in item && item.code ? `${item.name} (${item.code})` : item.name,
            }))}
          />
          <label><span className="qms-label">القطاع</span>
            <select value={tagSector} onChange={(event) => setTagSector(event.target.value as QualitySector)}>
              <option value="home">الأجهزة المنزلية</option>
              <option value="seria">قسم السريا</option>
            </select>
          </label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={!canManage || !tagEntity} onClick={() => void save(() => qualitySettingsService.saveSectorTag({ entityType: tagType, entityId: tagEntity, sector: tagSector }), 'تم حفظ الوسم')}>حفظ الوسم</button>
        </div>
        <ul>
          {tags.map((tag) => {
            const source = tag.entityType === 'product' ? masters.products : masters.lines;
            const entity = source.find((item) => item.id === tag.entityId);
            return <li key={tag.id}>{tag.entityType === 'product' ? 'منتج' : 'خط'}: {entity?.name || tag.entityId} — {tag.sector === 'seria' ? 'السريا' : 'الأجهزة المنزلية'}</li>;
          })}
        </ul>
      </section>
    </QmsPage>
  );
};
