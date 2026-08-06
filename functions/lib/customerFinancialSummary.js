const money = (value) => Math.round(Math.max(0, Number(value || 0)) * 100) / 100;
export function summarizeCustomerFinancialRows(repairs, invoices, payments) {
    const validRepairs = repairs.filter((row) => !row.cancelled);
    const postedInvoices = invoices.filter((row) => row.status === 'posted');
    const activePayments = payments.filter((row) => row.status === 'posted');
    const sum = (rows, pick) => money(rows.reduce((total, row) => total + pick(row), 0));
    const repairPaid = sum(activePayments, (row) => row.amount);
    const salesNetPaid = sum(postedInvoices, (row) => row.netAmount);
    return {
        repairJobs: validRepairs.length,
        warrantyJobs: validRepairs.filter((row) => row.warranty).length,
        outOfWarrantyJobs: validRepairs.filter((row) => !row.warranty).length,
        repairGross: sum(validRepairs, (row) => row.grossAmount),
        repairDiscounts: sum(validRepairs.filter((row) => !row.warranty), (row) => row.discountAmount),
        warrantyAllowances: sum(validRepairs.filter((row) => row.warranty), (row) => row.warrantyAllowance),
        repairPaid,
        repairBalanceDue: sum(validRepairs, (row) => row.balanceDue),
        warrantyActualCost: sum(validRepairs.filter((row) => row.warranty), (row) => row.warrantyActualCost),
        warrantyPartsCost: sum(validRepairs.filter((row) => row.warranty), (row) => row.warrantyPartsActualCost),
        warrantyServiceCost: sum(validRepairs.filter((row) => row.warranty), (row) => row.warrantyServiceInternalCost),
        salesInvoices: postedInvoices.length,
        salesGross: sum(postedInvoices, (row) => row.grossAmount),
        salesDiscounts: sum(postedInvoices, (row) => row.discountAmount),
        salesNetPaid,
        salesQuantity: sum(postedInvoices, (row) => row.quantity),
        fullDiscountInvoices: postedInvoices.filter((row) => row.fullDiscount).length,
        totalCustomerPaid: money(repairPaid + salesNetPaid),
        legacyIncompleteWarrantyJobs: validRepairs.filter((row) => row.warranty && row.legacyIncomplete).length,
    };
}
