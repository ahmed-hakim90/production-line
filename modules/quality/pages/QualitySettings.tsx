import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { usePermission } from '@/utils/permissions';
import { STANDARD_AQL_LEVEL_II, type AqlPlanRange } from '../domain/aql';
import type { QualitySector } from '../domain/sector';
import type {
  QualityProductionTag,
  QualityReason,
  QualitySampleSlot,
  QualitySectorTag,
  QualityStation,
  QualityTechnician,
} from '../model';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualitySettingsService } from '../services/qualitySettingsService';
import { MasterSelect, QmsPage, useQualityMasters } from '../qms/QmsChrome';

export const QualitySettings: React.FC = () => {
  const { can } = usePermission();
  const masters = useQualityMasters();
  const canManage = can('quality.settings.manage');
  const [plans, setPlans] = useState<AqlPlanRange[]>([]);
  const [usingStandard, setUsingStandard] = useState(true);
  const [closeRequired, setCloseRequired] = useState(false);
  const [reasonLabel, setReasonLabel] = useState('');
  const [reasonCategory, setReasonCategory] = useState('عام');
  const [reasonSector, setReasonSector] = useState<'' | QualitySector>('');
  const [reasonImporting, setReasonImporting] = useState(false);
  const [editingReasonId, setEditingReasonId] = useState('');
  const [catalogReasons, setCatalogReasons] = useState<QualityReason[]>([]);
  const [stationName, setStationName] = useState('');
  const [stationTechnicianId, setStationTechnicianId] = useState('');
  const [editingStationId, setEditingStationId] = useState('');
  const [technicians, setTechnicians] = useState<QualityTechnician[]>([]);
  const [technicianName, setTechnicianName] = useState('');
  const [technicianCode, setTechnicianCode] = useState('');
  const [editingTechnicianId, setEditingTechnicianId] = useState('');
  const [tagEntity, setTagEntity] = useState('');
  const [tagType, setTagType] = useState<'product' | 'line'>('product');
  const [tagSector, setTagSector] = useState<QualitySector>('home');
  const [productionTags, setProductionTags] = useState<QualityProductionTag[]>([]);
  const [productionTagId, setProductionTagId] = useState('');
  const [productionTagLineId, setProductionTagLineId] = useState('');
  const [productionTagCustomLine, setProductionTagCustomLine] = useState(false);
  const [productionTagLineName, setProductionTagLineName] = useState('');
  const [productionTagProductId, setProductionTagProductId] = useState('');
  const [productionTagSector, setProductionTagSector] = useState<QualitySector>('home');
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
    const [saved, policies, nextStations, hourlySlots, lineSlots, nextTags, nextReasons, nextTechnicians, nextProductionTags] = await Promise.all([
      qualitySettingsService.listAqlPlans(),
      qualitySettingsService.getPolicies(),
      qualitySettingsService.listStations({ includeInactive: true }),
      qualitySettingsService.listSlots('hourly'),
      qualitySettingsService.listSlots('line'),
      qualitySettingsService.listSectorTags(),
      qualitySettingsService.listReasons(),
      qualitySettingsService.listTechnicians({ includeInactive: true }),
      qualitySettingsService.listProductionTags({ includeInactive: true }),
    ]);
    setCatalogReasons(nextReasons);
    setStations(nextStations);
    setSlots([...hourlySlots, ...lineSlots]);
    setTags(nextTags);
    setTechnicians(nextTechnicians);
    setProductionTags(nextProductionTags);
    const active = saved.filter((plan) => plan.isActive);
    setUsingStandard(active.length === 0);
    setPlans(active.length > 0 ? active : STANDARD_AQL_LEVEL_II);
    setCloseRequired(policies.closeRequiresQualityApproval);
  };

  useEffect(() => { void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر التحميل'))); }, []);

  const importReasons = async (file: File) => {
    if (!canManage) return;
    setReasonImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error('ملف Excel لا يحتوي على أوراق عمل.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
        defval: '',
        raw: false,
      });
      const existing = await qualitySettingsService.listReasons();
      const knownNames = new Set(existing
        .filter((reason) => reason.isActive !== false)
        .map((reason) => reason.labelAr.trim()));
      let imported = 0;
      let duplicates = 0;
      for (const row of rows) {
        const normalized = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key.trim().toLocaleLowerCase(), String(value ?? '').trim()]),
        );
        const name = normalized['اسم العيب'] || normalized['العيب'] || normalized['name'] || normalized['defect'];
        if (!name) continue;
        if (knownNames.has(name)) {
          duplicates += 1;
          continue;
        }
        const category = normalized['التصنيف'] || normalized['category'] || 'عام';
        const sectorValue = normalized['القطاع'] || normalized['sector'] || '';
        const sector = sectorValue.includes('سريا') ? 'seria' : sectorValue.includes('منزل') ? 'home' : undefined;
        await qualitySettingsService.saveReason({
          labelAr: name,
          category,
          sector,
          isActive: true,
        });
        knownNames.add(name);
        imported += 1;
      }
      await load();
      masters.reloadAux();
      toast.success(`تم استيراد ${imported} عيبًا${duplicates ? `، وتجاهل ${duplicates} مكررًا` : ''}.`);
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر استيراد عيوب الجودة.'));
    } finally {
      setReasonImporting(false);
    }
  };

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
        <label><span className="qms-label">بحث</span><input className="qms-input" value={reasonQuery} onChange={(event) => setReasonQuery(event.target.value)} placeholder="الاسم أو التصنيف" /></label>
        <table className="qms-table">
          <thead><tr><th>#</th><th>اسم العيب</th><th>التصنيف</th><th>القطاع</th><th></th></tr></thead>
          <tbody>
            {catalogReasons.filter((reason) => {
              const query = reasonQuery.trim();
                  return !query || `${reason.labelAr} ${reason.category}`.includes(query);
            }).map((reason, index) => (
              <tr key={reason.id}>
                <td>{index + 1}</td>
                <td>{reason.labelAr}{reason.isActive === false ? ' — موقوف' : ''}</td>
                <td>{reason.category}</td>
                <td>{reason.sector === 'seria' ? 'السريا' : reason.sector === 'home' ? 'الأجهزة المنزلية' : 'مشترك'}</td>
                <td>{canManage ? (
                  <>
                    <button type="button" className="qms-btn qms-btn-ghost" onClick={() => {
                      setEditingReasonId(reason.id);
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
              labelAr: reasonLabel,
              category: reasonCategory,
              sector: reasonSector || undefined,
              isActive: true,
            });
            setEditingReasonId('');
            setReasonLabel('');
          }, 'تم حفظ السبب')}>{editingReasonId ? 'حفظ التعديل' : 'إضافة سبب'}</button>
        </div>
      </section>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">استيراد أسماء العيوب من Excel</h2>
        <p className="qms-muted">يدعم الملف عمود «اسم العيب» أو «العيب»، ويقبل اختياريًا «التصنيف» و«القطاع». لا يلزم إدخال كود للعيب؛ سيتم توليده تلقائيًا.</p>
        <div className="qms-row">
          <label>
            <span className="qms-label">ملف Excel</span>
            <input
              className="qms-input"
              type="file"
              accept=".xlsx,.xls"
              disabled={!canManage || reasonImporting}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importReasons(file);
              }}
            />
          </label>
        </div>
      </section>
      <section className="qms-card" id="quality-technicians" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">فنيون الجودة</h2>
        <p className="qms-muted">أضف الفنيين مرة واحدة، ثم اختر الفني المسجل عند إعداد كل محطة بدل كتابة اسمه يدويًا.</p>
        <div className="qms-row">
          <label><span className="qms-label">اسم الفني</span><input className="qms-input" value={technicianName} onChange={(event) => setTechnicianName(event.target.value)} /></label>
          <label><span className="qms-label">الكود</span><input className="qms-input" value={technicianCode} onChange={(event) => setTechnicianCode(event.target.value)} /></label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={!canManage || !technicianName.trim() || !technicianCode.trim()} onClick={() => void save(async () => {
            await qualitySettingsService.saveTechnician({
              id: editingTechnicianId || undefined,
              name: technicianName,
              code: technicianCode,
            });
            setEditingTechnicianId('');
            setTechnicianName('');
            setTechnicianCode('');
          }, 'تم حفظ فني الجودة')}>{editingTechnicianId ? 'حفظ تعديل الفني' : 'إضافة فني'}</button>
          {editingTechnicianId ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => {
            setEditingTechnicianId('');
            setTechnicianName('');
            setTechnicianCode('');
          }}>إلغاء التعديل</button> : null}
        </div>
        <table className="qms-table">
          <thead><tr><th>الفني</th><th>الكود</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {technicians.map((technician) => (
              <tr key={technician.id}>
                <td>{technician.name}</td>
                <td>{technician.code}</td>
                <td>{technician.isActive === false ? 'موقوف' : 'نشط'}</td>
                <td>{canManage ? (
                  <>
                      <button type="button" className="qms-btn qms-btn-ghost" onClick={() => {
                        setEditingTechnicianId(technician.id);
                        setTechnicianName(technician.name);
                        setTechnicianCode(technician.code);
                      }}>تعديل</button>
                      {technician.isActive !== false ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void save(() => qualitySettingsService.hideTechnician(technician.id), 'تم إيقاف الفني')}>إيقاف</button> : null}
                  </>
                ) : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {technicians.length === 0 ? <p className="qms-muted">لم تتم إضافة فنيين بعد.</p> : null}
      </section>
      <section className="qms-card" id="quality-stations" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">محطات الفحص</h2>
        <div className="qms-row">
          <label><span className="qms-label">اسم المحطة</span><input className="qms-input" value={stationName} onChange={(event) => setStationName(event.target.value)} /></label>
          <MasterSelect
            label="فني الجودة"
            value={stationTechnicianId}
            onChange={setStationTechnicianId}
            placeholder="اختر فنيًا مسجلًا"
            options={technicians.filter((technician) => technician.isActive !== false).map((technician) => ({
              value: technician.id,
              label: `${technician.name} (${technician.code})`,
            }))}
          />
          <button type="button" className="qms-btn qms-btn-primary" disabled={!canManage || !stationName.trim() || !stationTechnicianId} onClick={() => void save(async () => {
            await qualitySettingsService.saveStation({
              id: editingStationId || undefined,
              name: stationName,
              defaultInspectorTechnicianId: stationTechnicianId,
            });
            setEditingStationId('');
            setStationName('');
            setStationTechnicianId('');
          }, 'تم حفظ المحطة')}>{editingStationId ? 'حفظ تعديل المحطة' : 'حفظ المحطة'}</button>
        </div>
        <table className="qms-table">
          <thead><tr><th>الترتيب</th><th>المحطة</th><th>فني الجودة</th><th></th></tr></thead>
          <tbody>
            {stations.map((station, index) => {
              const technician = technicians.find((item) => item.id === station.defaultInspectorTechnicianId);
              return (
                <tr key={station.id}>
                  <td>{index + 1}</td>
                  <td>{station.name}{station.isActive === false ? ' — موقوفة' : ''}</td>
                  <td>{technician ? `${technician.name} (${technician.code})` : station.defaultInspectorName || '—'}</td>
                  <td>{canManage ? (
                    <>
                      <button type="button" className="qms-btn qms-btn-ghost" onClick={() => {
                        setEditingStationId(station.id);
                        setStationName(station.name);
                        setStationTechnicianId(station.defaultInspectorTechnicianId || '');
                      }}>تعديل</button>
                      {station.isActive !== false ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void save(() => qualitySettingsService.hideStation(station.id), 'تم إيقاف المحطة')}>إيقاف</button> : null}
                    </>
                  ) : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="qms-muted">المحطات مرتبة حسب تاريخ إضافتها، ويظهر فنيها تلقائيًا عند اختيار المحطة في سحب العينات. الإيقاف يخفي المحطة من السحب الجديد.</p>
      </section>
      <section className="qms-card" id="quality-slots" style={{ marginBottom: 12 }}>
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
      <section className="qms-card" id="quality-production-tags" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">وسم خطوط الإنتاج</h2>
        <p className="qms-muted">كل وسم يربط اسم الخط بمنتجه وقطاعه. في تسجيل العينات تختار الوسم مرة واحدة فيظهر الخط والمنتج المرتبطان به فقط.</p>
        <div className="qms-row">
          <label className="qms-row">
            <input type="checkbox" checked={productionTagCustomLine} onChange={(event) => {
              setProductionTagCustomLine(event.target.checked);
              setProductionTagLineId('');
              setProductionTagLineName('');
            }} />
            <span>الخط غير موجود في القائمة، سأكتب اسمه</span>
          </label>
          {productionTagCustomLine ? (
            <label>
              <span className="qms-label">اسم الخط</span>
              <input className="qms-input" value={productionTagLineName} onChange={(event) => setProductionTagLineName(event.target.value)} />
            </label>
          ) : (
            <MasterSelect
              label="خط الإنتاج"
              value={productionTagLineId}
              onChange={(value) => setProductionTagLineId(value)}
              placeholder="اختر الخط"
              options={masters.lines.map((line) => ({
                value: line.id || '',
                label: line.code ? `${line.name} (${line.code})` : line.name,
              }))}
            />
          )}
          <MasterSelect
            label="المنتج"
            value={productionTagProductId}
            onChange={setProductionTagProductId}
            placeholder="اختر المنتج"
            options={masters.products.map((product) => ({
              value: product.id || '',
              label: product.code ? `${product.name} (${product.code})` : product.name,
            }))}
          />
          <label><span className="qms-label">القسم</span>
            <select className="qms-input" value={productionTagSector} onChange={(event) => setProductionTagSector(event.target.value as QualitySector)}>
              <option value="home">الأجهزة المنزلية</option>
              <option value="seria">السريا</option>
            </select>
          </label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={!canManage || !productionTagProductId || (productionTagCustomLine ? !productionTagLineName.trim() : !productionTagLineId)} onClick={() => void save(async () => {
            const line = masters.lines.find((item) => item.id === productionTagLineId);
            const product = masters.products.find((item) => item.id === productionTagProductId);
            if (!product || (!productionTagCustomLine && !line)) throw new Error('اختر خطًا ومنتجًا صحيحين.');
            await qualitySettingsService.saveProductionTag({
              id: productionTagId || undefined,
              lineId: productionTagCustomLine ? undefined : line?.id,
              lineName: productionTagCustomLine ? productionTagLineName : line?.name || '',
              productId: product.id || '',
              productName: product.name,
              sector: productionTagSector,
            });
            setProductionTagId('');
            setProductionTagLineId('');
            setProductionTagCustomLine(false);
            setProductionTagLineName('');
            setProductionTagProductId('');
          }, 'تم حفظ الوسم')}>{productionTagId ? 'حفظ تعديل الوسم' : 'إضافة الوسم'}</button>
          {productionTagId ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => {
            setProductionTagId('');
            setProductionTagLineId('');
            setProductionTagCustomLine(false);
            setProductionTagLineName('');
            setProductionTagProductId('');
          }}>إلغاء التعديل</button> : null}
        </div>
        <table className="qms-table">
          <thead><tr><th>الوسم</th><th>القسم</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {productionTags.map((tag) => (
              <tr key={tag.id}>
                <td>{tag.lineName} — {tag.productName}</td>
                <td>{tag.sector === 'seria' ? 'السريا' : 'الأجهزة المنزلية'}</td>
                <td>{tag.isActive === false ? 'موقوف' : 'نشط'}</td>
                <td>{canManage ? (
                  <>
                    <button type="button" className="qms-btn qms-btn-ghost" onClick={() => {
                      setProductionTagId(tag.id);
                      setProductionTagLineId(tag.lineId || '');
                      setProductionTagCustomLine(!tag.lineId);
                      setProductionTagLineName(tag.lineName);
                      setProductionTagProductId(tag.productId);
                      setProductionTagSector(tag.sector);
                    }}>تعديل</button>
                    {tag.isActive !== false ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void save(() => qualitySettingsService.hideProductionTag(tag.id), 'تم إيقاف الوسم')}>إيقاف</button> : null}
                  </>
                ) : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {productionTags.length === 0 ? <p className="qms-muted">لم تتم إضافة أوسمة خطوط إنتاج بعد.</p> : null}
      </section>
      <section className="qms-card">
        <h2 className="qms-title">وسم المنتج أو الخط في إعدادات القطاع</h2>
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
