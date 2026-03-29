/**
 * Compare semantic versions major.minor.patch only (aligned with package.json / auto-version).
 * Returns negative if a < b, positive if a > b, 0 if equal or either side is invalid.
 */
export function parseSemVerTriplet(version: string): [number, number, number] | null {
  const trimmed = version.trim();
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(trimmed);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemVer(a: string, b: string): number {
  const pa = parseSemVerTriplet(a);
  const pb = parseSemVerTriplet(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
