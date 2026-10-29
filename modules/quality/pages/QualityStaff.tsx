import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { usePermission } from '@/utils/permissions';
import { userService } from '@/services/userService';
import type { FirestoreUser } from '@/types';
import { localDateIso } from '../domain/time';
import type { QualityStaffAssignment } from '../model';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityPalletService } from '../services/qualityPalletService';
import { qualitySampleService } from '../services/qualitySampleService';
import { qualitySettingsService } from '../services/qualitySettingsService';
import { qualityStaffService } from '../services/qualityStaffService';
import { MasterSelect, QmsPage, useQualityMasters } from '../qms/QmsChrome';

export const QualityStaff: React.FC = () => {
  const { can } = usePermission();
  const canManage = can('quality.workers.manage');
  const canLink = can('employees.edit');
  const masters = useQualityMasters();
  const [rows, setRows] = useState<QualityStaffAssignment[]>([]);
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [stationIds, setStationIds] = useState<string[]>([]);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [userId, setUserId] = useState('');
  const [active, setActive] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [activity, setActivity] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [assignments, stationRows] = await Promise.all([
      qualityStaffService.list(),
      qualitySettingsService.listStations({ includeInactive: true }),
    ]);
    setRows(assignments);
    setStations(stationRows.map((station) => ({ id: station.id, name: station.name })));
    if (canLink) setUsers(await userService.getAll());
  };

  useEffect(() => {
    void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تحميل دليل الجودة')));
  }, [canLink]);

  const selected = rows.find((row) => row.id === selectedId);
  useEffect(() => {
    if (!selected) {
      setActivity([]);
      return;
    }
    const today = localDateIso();
    void Promise.all([
      qualityPalletService.listByDate(today).catch(() => []),
      qualitySampleService.listHourly(today).catch(() => []),
      qualitySampleService.listPulls(today).catch(() => []),
    ]).then(([pallets, hourly, pulls]) => {
      const lines = [
        ...pallets.filter((row) => row.inspectorEmployeeId === selected.employeeId).map((row) => `بالته ${row.palletNumber} — ${row.inspectionStatus}`),
        ...hourly.filter((row) => row.inspectorEmployeeId === selected.employeeId).map((row) => `عينة ${row.slotName}`),
        ...pulls.filter((row) => row.inspectorEmployeeId === selected.employeeId).map((row) => `سحبة ${row.stationName}`),
      ];
      setActivity(lines);
    });
  }, [selected]);

  const employeeOptions = useMemo(() => masters.employees.map((employee) => ({
    value: employee.id || '',
    label: employee.code ? `${employee.name} (${employee.code})` : employee.name,
  })), [masters.employees]);

  const toggle = (current: string[], id: string) => (
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  );

  const edit = (row: QualityStaffAssignment) => {
    setSelectedId(row.id);
    setEmployeeId(row.employeeId);
    setStationIds(row.stationIds || []);
    setLineIds(row.lineIds || []);
    setUserId(row.userId || '');
    setActive(row.isActive);
  };

  const save = async () => {
    setSaving(true);
    try {
      await qualityStaffService.save({
        employeeId,
        stationIds,
        lineIds,
        isActive: active,
        userId: canLink ? userId : undefined,
      });
      toast.success('تم حفظ تعيين الجودة');
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر حفظ التعيين'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <QmsPage title="دليل الجودة" subtitle="التعيين يحدد الموظف والمحطات والخطوط التي يمكن اختياره عليها في فحص جديد.">
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <MasterSelect label="الموظف" value={employeeId} onChange={setEmployeeId} placeholder="من سجل الموظفين" options={employeeOptions} />
          {canLink ? (
            <MasterSelect label="الحساب المرتبط" value={userId} onChange={setUserId} placeholder="اختياري" options={users.filter((user) => user.isActive && user.id).map((user) => ({ value: user.id || '', label: user.displayName || user.email }))} />
          ) : <p className="qms-muted">ربط الحساب يحتاج صلاحية تعديل الموظفين.</p>}
          <label className="qms-row"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> تعيين نشط</label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={!canManage || saving || !employeeId} onClick={() => void save()}>حفظ التعيين</button>
        </div>
        <div className="qms-row">
          {stations.filter((station) => station.id).map((station) => (
            <label key={station.id} className="qms-row"><input type="checkbox" checked={stationIds.includes(station.id)} onChange={() => setStationIds((current) => toggle(current, station.id))} /> {station.name}</label>
          ))}
          {masters.lines.map((line) => (
            <label key={line.id} className="qms-row"><input type="checkbox" checked={lineIds.includes(line.id || '')} onChange={() => setLineIds((current) => toggle(current, line.id || ''))} /> {line.name}</label>
          ))}
        </div>
        <p className="qms-muted">اترك المحطات والخطوط بلا تحديد ليُسمح بالمحطات والخطوط كلها. التحديد يقصر الاختيار الجديد فقط.</p>
      </section>
      <section className="qms-card">
        <table className="qms-table">
          <thead><tr><th>الموظف</th><th>الحالة</th><th>المحطات</th><th>الخطوط</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.employeeName}</td>
                <td>{row.isActive ? 'نشط' : 'موقوف'}</td>
                <td>{row.stationIds.length === 0 ? 'الكل' : row.stationIds.length}</td>
                <td>{row.lineIds.length === 0 ? 'الكل' : row.lineIds.length}</td>
                <td>
                  <button type="button" className="qms-btn qms-btn-ghost" onClick={() => edit(row)}>عرض</button>
                  {canManage && row.isActive ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void qualityStaffService.deactivate(row.employeeId).then(load).then(() => toast.success('تم إيقاف التعيين')).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الإيقاف')))}>إيقاف</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p>لا توجد تعيينات جودة. اختر موظفاً من سجل الموظفين.</p> : null}
        {selected ? (
          <div>
            <p className="qms-muted">نشاط اليوم للمراقب {selected.employeeName}. السجلات المكتملة تحتفظ بالاسم كما كُتب وقت الفحص.</p>
            {activity.length === 0 ? <p>لا يوجد فحص لهذا الموظف اليوم، أو ليست لديك صلاحية قراءة تلك السجلات.</p> : activity.map((line) => <p key={line}>{line}</p>)}
          </div>
        ) : null}
      </section>
    </QmsPage>
  );
};
