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
  A: { label: 'ممتاز', color: 'text-[rgb(var(--color-success))] dark:text-[rgb(var(--color-success))]', bg: 'bg-[rgb(var(--color-success)/0.1)] dark:bg-[rgb(var(--color-success)/0.2)]' },
  B: { label: 'جيد جداً', color: 'text-[rgb(var(--color-primary))] dark:text-[rgb(var(--color-primary))]', bg: 'bg-[rgb(var(--color-primary)/0.1)] dark:bg-[rgb(var(--color-primary)/0.2)]' },
  C: { label: 'جيد', color: 'text-[rgb(var(--color-warning))] dark:text-[rgb(var(--color-warning))]', bg: 'bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.2)]' },
  D: { label: 'يحتاج تحسين', color: 'text-[rgb(var(--color-danger))] dark:text-[rgb(var(--color-danger))]', bg: 'bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.2)]' },
};
