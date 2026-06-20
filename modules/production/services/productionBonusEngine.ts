import type { ProductionBonusSettings } from '@/types';

export function calculateBonusEstimate(params: {
  settings: ProductionBonusSettings;
  monthlyTarget: number;
  monthlyOutput: number;
  monthlyAchievement: number;
}): number {
  const { settings, monthlyTarget, monthlyOutput, monthlyAchievement } = params;
  if (!settings.enabled) return 0;
  if (monthlyAchievement < settings.minimumAchievementPercent) return 0;

  let raw = 0;
  switch (settings.method) {
    case 'target_plus_extra': {
      const threshold = Number(settings.minimumAchievementPercent || 100);
      const base = Number(settings.targetBonusAmount || 0);
      const extraOutput = Math.max(0, monthlyOutput - monthlyTarget);
      const extraAchievementPercent = Math.max(0, monthlyAchievement - threshold);
      const extraMethod = settings.extraBonusMethod ?? 'per_extra_unit';
      const extra =
        extraMethod === 'per_extra_unit'
          ? extraOutput * Number(settings.bonusPerExtraUnit || 0)
          : extraMethod === 'per_extra_achievement_percent'
            ? extraAchievementPercent * Number(settings.bonusPerAchievementPercent || 0)
            : 0;
      raw = base + extra;
      break;
    }
    case 'per_extra_unit': {
      const extra = Math.max(0, monthlyOutput - monthlyTarget);
      raw = extra * Number(settings.bonusPerExtraUnit || 0);
      break;
    }
    case 'per_achievement_percent': {
      raw = monthlyAchievement * Number(settings.bonusPerAchievementPercent || 0);
      break;
    }
    case 'fixed_tier': {
      raw = Number(settings.bonusPerAchievementPercent || 0);
      break;
    }
    default:
      raw = 0;
  }

  const maxBonus = Number(settings.maxBonus || 0);
  if (maxBonus > 0) return Math.min(raw, maxBonus);
  return Math.max(0, raw);
}

export function computePerformanceScore(monthlyAchievement: number, attendanceRate: number): number {
  return Math.round(monthlyAchievement * 0.7 + attendanceRate * 0.3);
}
