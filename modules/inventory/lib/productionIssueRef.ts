/** Matches sequential references like PI-0001 (not legacy PI-YYYYMMDD-######). */
export const PI_REF_REGEX = /^PI-(\d+)$/i;

export const formatPiReference = (seq: number) =>
  `PI-${String(Math.max(1, Math.floor(seq))).padStart(4, '0')}`;

export function piSeqFromReferenceNo(referenceNo: string): number {
  const m = String(referenceNo || '').trim().match(PI_REF_REGEX);
  return m ? Number(m[1] || 0) : 0;
}
