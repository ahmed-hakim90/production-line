import type { MaterialRequirementLine } from '../types';

/** Live plan cost from latest material requirement lines (estimatedCost is refreshed on generate). */
export function computeLivePlanCostFromLines(lines: MaterialRequirementLine[]): {
  totalEstimatedCost: number;
  lineCount: number;
} {
  const safeLines = lines || [];
  const totalEstimatedCost = safeLines.reduce((sum, line) => sum + Number(line.estimatedCost || 0), 0);
  return {
    totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
    lineCount: safeLines.length,
  };
}
