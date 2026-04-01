import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { employeeService } from '../employeeService';
import { performanceService } from '../services/performanceService';
import {
  GRADE_CONFIG,
  calculateAttendanceScore,
  calculateGrade,
  calculateOverallScore,
  calculatePunctualityScore,
} from '../utils/performanceCalculator';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { attendanceProcessingService } from '@/modules/attendance/services/attendanceProcessingService';
import type { AttendanceRecord } from '@/modules/attendance/types';
import type { FirestoreEmployee } from '@/types';
import type { FirestoreEmployeePerformance } from '../types';

type ManualScore = {
  productivity: number;
  behavior: number;
  notes: string;
  bonusEligible: boolean;
  bonusAmount: number;
};

export const EmployeeEvaluation: React.FC = () => {
  const { can } = usePermission();
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const currentEmployee = useAppStore((s) => s.currentEmployee);

  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [savedScores, setSavedScores] = useState<Map<string, FirestoreEmployeePerformance>>(new Map());
  const [manualScores, setManualScores] = useState<Map<string, ManualScore>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);

  const canApprove = can('hr.evaluation.approve');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, records, scores] = await Promise.all([
        employeeService.getAll().then((list) => list.filter((emp) => emp.isActive !== false)),
        attendanceProcessingService.getRecordsForMonth(month),
        performanceService.getByMonth(month),
      ]);

      setEmployees(emps);
      setAttendanceRecords(records);

      const scoresMap = new Map<string, FirestoreEmployeePerformance>();
      const manualMap = new Map<string, ManualScore>();
      scores.forEach((score) => {
        scoresMap.set(score.employeeId, score);
        manualMap.set(score.employeeId, {
          productivity: score.productivityScore,
          behavior: score.behaviorScore,
          notes: score.notes,
          bonusEligible: score.bonusEligible,
          bonusAmount: score.bonusAmount,
        });
      });
      setSavedScores(scoresMap);
      setManualScores(manualMap);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const attendanceStats = useMemo(() => {
    const map = new Map<string, { presentDays: number; absentDays: number; lateDays: number; totalLateMinutes: number; workingDays: number }>();
    const uniqueDates = new Set(attendanceRecords.map((r) => r.date));
    const workingDays = uniqueDates.size || 26;

    attendanceRecords.forEach((record) => {
      const current = map.get(record.employeeId) ?? {
        presentDays: 0,
        absentDays: 0,
        lateDays: 0,
        totalLateMinutes: 0,
        workingDays,
      };
      if (record.status === 'absent') {
        current.absentDays += 1;
      } else {
        current.presentDays += 1;
      }
      if (record.lateMinutes > 0) {
        current.lateDays += 1;
        current.totalLateMinutes += record.lateMinutes;
      }
      map.set(record.employeeId, current);
    });

    return map;
  }, [attendanceRecords]);

  const getManual = (empId: string): ManualScore =>
    manualScores.get(empId) ?? {
      productivity: 75,
      behavior: 75,
      notes: '',
      bonusEligible: false,
      bonusAmount: 0,
    };

  const updateManual = (empId: string, field: keyof ManualScore, value: string | number | boolean) => {
    setManualScores((prev) => {
      const next = new Map(prev);
      next.set(empId, { ...getManual(empId), [field]: value } as ManualScore);
      return next;
    });
  };

  const handleSave = async (emp: FirestoreEmployee) => {
    if (!emp.id) return;
    setSaving(emp.id);
    try {
      const stats = attendanceStats.get(emp.id) ?? {
        presentDays: 0,
        absentDays: 0,
        lateDays: 0,
        totalLateMinutes: 0,
        workingDays: 26,
      };
      const manual = getManual(emp.id);
      const attendanceScore = calculateAttendanceScore(stats.presentDays, stats.workingDays);
      const punctualityScore = calculatePunctualityScore(stats.totalLateMinutes, stats.presentDays);
      const overallScore = calculateOverallScore(
        attendanceScore,
        punctualityScore,
        manual.productivity,
        manual.behavior,
      );

      await performanceService.upsert({
        employeeId: emp.id,
        employeeName: emp.name,
        month,
        attendanceScore,
        punctualityScore,
        presentDays: stats.presentDays,
        absentDays: stats.absentDays,
        lateDays: stats.lateDays,
        totalLateMinutes: stats.totalLateMinutes,
        workingDays: stats.workingDays,
        productivityScore: manual.productivity,
        behaviorScore: manual.behavior,
        overallScore,
        grade: calculateGrade(overallScore),
        bonusEligible: manual.bonusEligible,
        bonusAmount: manual.bonusAmount,
        bonusApproved: savedScores.get(emp.id)?.bonusApproved ?? false,
        notes: manual.notes,
        evaluatedBy: currentEmployee?.name ?? userDisplayName ?? '',
        evaluatedAt: new Date(),
      });

      await loadData();
    } finally {
      setSaving(null);
    }
  };

  const handleApproveAllBonuses = async () => {
    setApprovingAll(true);
    try {
      const eligible = Array.from(savedScores.values()).filter(
        (score) => score.bonusEligible && !score.bonusApproved && score.id,
      );
      for (const score of eligible) {
        await performanceService.approveBonus(score.id!, currentEmployee?.name ?? '', score.bonusAmount);
      }
      await loadData();
    } finally {
      setApprovingAll(false);
    }
  };

  const pendingBonuses = Array.from(savedScores.values()).filter(
    (score) => score.bonusEligible && !score.bonusApproved,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">تقييم الموظفين</h2>
          <p className="text-sm text-[var(--color-text-muted)] font-medium">مؤشرات الأداء الشهرية والمكافآت</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-3 py-2 text-sm bg-[var(--color-card)]"
          />
          {canApprove && pendingBonuses > 0 && (
            <Button onClick={handleApproveAllBonuses} disabled={approvingAll}>
              <span className="material-icons-round text-sm">done_all</span>
              اعتماد {pendingBonuses} مكافأة
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {Object.entries(GRADE_CONFIG).map(([grade, cfg]) => (
          <span key={grade} className={`text-xs px-2 py-1 rounded-full font-bold ${cfg.bg} ${cfg.color}`}>
            {grade} — {cfg.label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {employees.map((emp) => {
            if (!emp.id) return null;
            const stats = attendanceStats.get(emp.id) ?? {
              presentDays: 0,
              absentDays: 0,
              lateDays: 0,
              totalLateMinutes: 0,
              workingDays: 26,
            };
            const manual = getManual(emp.id);
            const saved = savedScores.get(emp.id);

            const attendanceScore = calculateAttendanceScore(stats.presentDays, stats.workingDays);
            const punctualityScore = calculatePunctualityScore(stats.totalLateMinutes, stats.presentDays);
            const overall = calculateOverallScore(
              attendanceScore,
              punctualityScore,
              manual.productivity,
              manual.behavior,
            );
            const grade = calculateGrade(overall);
            const gradeCfg = GRADE_CONFIG[grade];

            return (
              <Card key={emp.id}>
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="lg:w-48 shrink-0">
                    <p className="font-bold text-[var(--color-text)]">{emp.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{emp.code}</p>
                    <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-bold ${gradeCfg.bg} ${gradeCfg.color}`}>
                      {grade} — {gradeCfg.label} ({overall}%)
                    </span>
                  </div>

                  <div className="flex gap-4 lg:w-56 shrink-0">
                    <div className="text-center">
                      <p className="text-lg font-bold text-emerald-600">{attendanceScore}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">حضور</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-600">{punctualityScore}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">انضباط</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-[var(--color-text-muted)]">{stats.presentDays} حضور</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{stats.lateDays} تأخير</p>
                    </div>
                  </div>

                  <div className="flex gap-3 flex-1">
                    <div className="flex-1">
                      <label className="text-[10px] text-[var(--color-text-muted)] font-bold block mb-1">إنتاجية (0-100)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={manual.productivity}
                        onChange={(e) => updateManual(emp.id!, 'productivity', Number(e.target.value))}
                        className="w-full border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm bg-[var(--color-card)]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-[var(--color-text-muted)] font-bold block mb-1">سلوك (0-100)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={manual.behavior}
                        onChange={(e) => updateManual(emp.id!, 'behavior', Number(e.target.value))}
                        className="w-full border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm bg-[var(--color-card)]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="checkbox"
                      checked={manual.bonusEligible}
                      onChange={(e) => updateManual(emp.id!, 'bonusEligible', e.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                    {manual.bonusEligible && (
                      <input
                        type="number"
                        min={0}
                        value={manual.bonusAmount}
                        onChange={(e) => updateManual(emp.id!, 'bonusAmount', Number(e.target.value))}
                        placeholder="المكافأة"
                        className="w-24 border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm bg-[var(--color-card)]"
                      />
                    )}
                    {saved?.bonusApproved && <Badge variant="success">معتمد</Badge>}
                  </div>

                  <Button size="sm" onClick={() => handleSave(emp)} disabled={saving === emp.id}>
                    {saving === emp.id ? (
                      <span className="material-icons-round animate-spin text-sm">refresh</span>
                    ) : (
                      <span className="material-icons-round text-sm">save</span>
                    )}
                    حفظ
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
