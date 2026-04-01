export type SpcPoint = { index: number; value: number };

export type SpcSummary = {
  mean: number;
  sigma: number;
  ucl: number;
  lcl: number;
  outOfControlPoints: SpcPoint[];
};

const round2 = (value: number) => Number(value.toFixed(2));

export const spcService = {
  summarize(values: number[]): SpcSummary {
    const safe = values.filter((v) => Number.isFinite(v));
    if (safe.length === 0) {
      return { mean: 0, sigma: 0, ucl: 0, lcl: 0, outOfControlPoints: [] };
    }
    const mean = safe.reduce((s, v) => s + v, 0) / safe.length;
    const variance = safe.reduce((s, v) => s + ((v - mean) ** 2), 0) / safe.length;
    const sigma = Math.sqrt(Math.max(0, variance));
    const ucl = mean + (3 * sigma);
    const lcl = Math.max(0, mean - (3 * sigma));
    const outOfControlPoints = safe
      .map((value, index) => ({ index, value }))
      .filter((point) => point.value > ucl || point.value < lcl);
    return {
      mean: round2(mean),
      sigma: round2(sigma),
      ucl: round2(ucl),
      lcl: round2(lcl),
      outOfControlPoints,
    };
  },
};
