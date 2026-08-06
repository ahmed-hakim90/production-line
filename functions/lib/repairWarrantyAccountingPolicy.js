export function buildWarrantySettlementTotals(grossInput) {
    const n = Number(grossInput || 0);
    const grossAmount = Number.isFinite(n) ? Math.round(Math.max(0, n) * 100) / 100 : 0;
    return {
        grossAmount,
        discountType: 'percent',
        discountValue: 100,
        discountAmount: grossAmount,
        netAmount: 0,
    };
}
export function warrantyJournalIsBalanced(input) {
    const credits = Math.round((Number(input.serviceGross || 0) + Number(input.partsGross || 0)) * 100) / 100;
    const debit = Math.round(Number(input.allowance || 0) * 100) / 100;
    return debit === credits;
}
