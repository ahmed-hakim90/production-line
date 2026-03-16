import type { PerformanceGrade } from '../types';

/**
 * Employee Performance Calculator — Pure functions, no Firestore.
 */
export function calculateAttendanceScore(presentDays: number, workingDays: number): number {
  if (workingDays <= 0) return 0;
  return Math.min(100, Math.round((presentDays / workingDays) * 100));
}

export function calculatePunctualityScore(totalLateMinutes: number, presentDays: number): number {
  if (presentDays <= 0) return 100;
  const avgLatePerDay = totalLateMinutes / presentDays;
  // 0 min/day = 100, 60+ min/day = 0
  return Math.max(0, Math.round(100 - (avgLatePerDay / 60) * 100));
}

export function calculateOverallScore(
  attendanceScore: number,
  punctualityScore: number,
  productivityScore: number,
  behaviorScore: number,
): number {
  return Math.round(
    attendanceScore * 0.4 +
    punctualityScore * 0.3 +
    productivityScore * 0.2 +
    behaviorScore * 0.1,
  );
}

export function calculateGrade(overallScore: number): PerformanceGrade {
  if (overallScore >= 90) return 'A';
  if (overallScore >= 75) return 'B';
  if (overallScore >= 60) return 'C';
  return 'D';
}

export const GRADE_CONFIG: Record<PerformanceGrade, { label: string; color: string; bg: string }> = {
  A: { label: 'ممتاز', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/20' },
  B: { label: 'جيد جداً', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/20' },
  C: { label: 'جيد', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/20' },
  D: { label: 'يحتاج تحسين', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/20' },
};
