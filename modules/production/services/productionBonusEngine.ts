import type { ProductionBonusSettings, ProductionReport, SupervisorBonusSettings } from '@/types';

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

export interface SupervisorWorkerContribution {
  workerId: string;
  workerName: string;
  targetQty: number;
  outputQty: number;
  cappedOutputQty: number;
  achievementPercent: number;
}

export interface SupervisorTeamBonusEstimate {
  totalTarget: number;
  totalAchieved: number;
  achievementPercent: number;
  cappedAchievementPercent: number;
  baseBonusAmount: number;
  supervisorMultiplier: number;
  tierMultiplier: number;
  bonusBeforeTier: number;
  bonusEstimate: number;
  workerContributionCapPercent: number;
  workerContributions: SupervisorWorkerContribution[];
}

const roundOne = (value: number): number => Math.round(value * 10) / 10;
const roundMoney = (value: number): number => Math.round(value * 100) / 100;

function resolveSupervisorTierMultiplier(settings: SupervisorBonusSettings, achievementPercent: number): number {
  const sorted = [...(settings.tiers ?? [])].sort((a, b) => a.fromPercent - b.fromPercent);
  const match = sorted.find((tier) => (
    achievementPercent >= Number(tier.fromPercent || 0)
    && (tier.toPercent === undefined || achievementPercent <= Number(tier.toPercent))
  ));
  return Number(match?.payoutMultiplier ?? 0);
}

export function calculateSupervisorTeamBonusEstimate(params: {
  settings: SupervisorBonusSettings;
  reports: ProductionReport[];
}): SupervisorTeamBonusEstimate {
  const { settings, reports } = params;
  const byWorker = new Map<string, SupervisorWorkerContribution>();

  for (const report of reports) {
    for (const output of report.workerOutputs ?? []) {
      if (output.isPresent === false) continue;
      const targetQty = Math.max(0, Number(output.dailyTargetQty || 0));
      if (targetQty <= 0) continue;

      const outputQty = Math.max(0, Number(output.outputQty || 0));
      const workerId = String(output.workerId || output.workerName || 'unknown').trim();
      const current = byWorker.get(workerId) ?? {
        workerId,
        workerName: output.workerName || workerId,
        targetQty: 0,
        outputQty: 0,
        cappedOutputQty: 0,
        achievementPercent: 0,
      };
      current.targetQty += targetQty;
      current.outputQty += outputQty;
      byWorker.set(workerId, current);
    }
  }

  const workerContributionCapPercent = Math.max(0, Number(settings.workerContributionCapPercent || 0));
  const capRatio = workerContributionCapPercent > 0 ? workerContributionCapPercent / 100 : Number.POSITIVE_INFINITY;
  const workerContributions = Array.from(byWorker.values())
    .map((row) => {
      const cappedOutputQty = Math.min(row.outputQty, row.targetQty * capRatio);
      return {
        ...row,
        cappedOutputQty,
        achievementPercent: row.targetQty > 0 ? roundOne((row.outputQty / row.targetQty) * 100) : 0,
      };
    })
    .sort((a, b) => b.cappedOutputQty - a.cappedOutputQty);

  const totalTarget = workerContributions.reduce((sum, row) => sum + row.targetQty, 0);
  const totalAchieved = workerContributions.reduce((sum, row) => sum + row.outputQty, 0);
  const totalCappedAchieved = workerContributions.reduce((sum, row) => sum + row.cappedOutputQty, 0);
  const achievementPercent = totalTarget > 0 ? roundOne((totalAchieved / totalTarget) * 100) : 0;
  const cappedAchievementPercent = totalTarget > 0 ? roundOne((totalCappedAchieved / totalTarget) * 100) : 0;

  const baseBonusAmount = Math.max(0, Number(settings.baseBonusAmount || 0));
  const supervisorMultiplier = Math.max(0, Number(settings.supervisorMultiplier || 0));
  const tierMultiplier = settings.enabled && cappedAchievementPercent >= Number(settings.minimumAchievementPercent || 0)
    ? resolveSupervisorTierMultiplier(settings, cappedAchievementPercent)
    : 0;
  const bonusBeforeTier = baseBonusAmount * (cappedAchievementPercent / 100) * supervisorMultiplier;
  const rawBonus = bonusBeforeTier * tierMultiplier;
  const maxBonus = Math.max(0, Number(settings.maxBonus || 0));
  const bonusEstimate = maxBonus > 0 ? Math.min(rawBonus, maxBonus) : rawBonus;

  return {
    totalTarget: roundOne(totalTarget),
    totalAchieved: roundOne(totalAchieved),
    achievementPercent,
    cappedAchievementPercent,
    baseBonusAmount,
    supervisorMultiplier,
    tierMultiplier,
    bonusBeforeTier: roundMoney(bonusBeforeTier),
    bonusEstimate: roundMoney(Math.max(0, bonusEstimate)),
    workerContributionCapPercent,
    workerContributions: workerContributions.map((row) => ({
      ...row,
      targetQty: roundOne(row.targetQty),
      outputQty: roundOne(row.outputQty),
      cappedOutputQty: roundOne(row.cappedOutputQty),
    })),
  };
}
