/**
 * Public repair approval payload builder.
 * Mirrors modules/repair/lib/repairApprovalPublic.ts (functions package is isolated).
 */
import { isFullManufacturerWarrantyJob, warrantyProductItemIds, } from './repairManufacturerWarranty.js';
import { buildRepairPaymentAccountBreakdown } from './repairPaymentProductBreakdown.js';
const money = (value) => {
    const n = Number(value || 0);
    return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
};
const text = (value, max = 200) => String(value || '').trim().slice(0, max);
const warrantyLineLabel = (inWarranty) => (inWarranty ? 'داخل الضمان' : 'بدون ضمان');
export function buildPublicRepairApprovalView(job, authorization) {
    const rawProducts = Array.isArray(job.jobProducts) ? job.jobProducts : [];
    const fullWarranty = isFullManufacturerWarrantyJob({
        warrantyScope: job.warrantyScope,
        jobProducts: rawProducts,
    });
    const warrantyIds = warrantyProductItemIds(rawProducts);
    const rawParts = Array.isArray(job.partsUsed) ? job.partsUsed : [];
    const parts = rawParts
        .slice(0, 50)
        .map((row) => {
        const partName = text(row?.partName, 120) || 'قطعة غيار';
        const quantity = Math.max(0, Math.round(Number(row?.quantity || 0)));
        const productItemId = String(row?.productItemId || '').trim();
        const inWarranty = fullWarranty || Boolean(productItemId && warrantyIds.has(productItemId));
        const unitPrice = inWarranty ? 0 : money(row?.unitCost);
        return {
            partName,
            quantity,
            unitPrice,
            lineTotal: money(quantity * unitPrice),
            inWarranty,
            warrantyLabel: warrantyLineLabel(inWarranty),
        };
    })
        .filter((row) => row.quantity > 0);
    const products = rawProducts
        .slice(0, 30)
        .map((row) => {
        const name = text(row?.productName, 120) || 'منتج';
        const quantity = Math.max(1, Math.round(Number(row?.quantity || 1)));
        const inWarranty = Boolean(row?.inWarranty);
        const rawCost = money(row?.finalCost ?? row?.estimatedCost);
        const lineCost = inWarranty ? 0 : rawCost;
        return {
            name,
            quantity,
            lineCost,
            inWarranty,
            warrantyLabel: warrantyLineLabel(inWarranty),
        };
    })
        .filter((row) => row.name.length > 0);
    const partsCost = money(parts.reduce((sum, row) => sum + row.lineTotal, 0));
    const laborCost = fullWarranty ? 0 : money(job.laborCost);
    const serviceOnlyCost = fullWarranty ? 0 : money(job.serviceOnlyCost);
    const billableProductsCost = money(products.filter((row) => !row.inWarranty).reduce((sum, row) => sum + row.lineCost, 0));
    const warrantyProductsCost = money(rawProducts
        .filter((row) => Boolean(row?.inWarranty))
        .reduce((sum, row) => sum + money(row?.finalCost ?? row?.estimatedCost), 0));
    const productsCost = billableProductsCost;
    const computed = money(partsCost + laborCost + serviceOnlyCost + productsCost);
    const estimatedStored = money(job.estimatedCost);
    const estimatedTotal = computed > 0
        ? computed
        : (estimatedStored > 0 ? estimatedStored : money(job.finalCostOverride ?? job.finalCost));
    const view = {
        receiptNo: text(job.receiptNo, 64),
        customerName: text(job.customerName, 120),
        customerPhone: text(job.customerPhone, 32),
        deviceBrand: text(job.deviceBrand, 80),
        deviceModel: text(job.deviceModel, 80),
        deviceType: text(job.deviceType, 80),
        problemDescription: text(job.problemDescription, 1000),
        approvalStatus: text(job.approvalStatus, 32) || 'pending',
        laborCost,
        serviceOnlyCost,
        partsCost,
        productsCost,
        warrantyProductsCost,
        billableProductsCost,
        estimatedTotal,
        parts,
        products,
    };
    if (!authorization)
        return view;
    const account = buildRepairPaymentAccountBreakdown(job, authorization);
    const pricedProducts = account.products.map((row) => ({
        name: text(row.productLabel, 120) || 'منتج',
        quantity: 1,
        lineCost: row.customerTotal,
        inWarranty: row.inWarranty,
        warrantyLabel: row.warrantyLabel,
        works: row.works.map((work) => ({
            kind: work.kind,
            name: work.name,
            quantity: work.quantity,
            unitPrice: work.unitPrice,
            catalogTotal: work.catalogTotal,
            lineCost: work.customerTotal,
            inWarranty: work.inWarranty,
        })),
    }));
    const authPartsCost = money(authorization.partsGross);
    const authServiceCost = money(authorization.serviceGross);
    const authNet = money(authorization.netAmount);
    const authGross = money(authorization.grossAmount);
    return {
        ...view,
        products: pricedProducts.length > 0 ? pricedProducts : view.products,
        unassignedWorks: account.unassigned.map((work) => ({
            kind: work.kind,
            name: work.name,
            quantity: work.quantity,
            unitPrice: work.unitPrice,
            catalogTotal: work.catalogTotal,
            lineCost: work.customerTotal,
            inWarranty: work.inWarranty,
        })),
        partsCost: authPartsCost > 0 || authServiceCost > 0 ? authPartsCost : view.partsCost,
        productsCost: authServiceCost > 0 || authPartsCost > 0 ? authServiceCost : view.productsCost,
        billableProductsCost: money(pricedProducts.filter((row) => !row.inWarranty).reduce((sum, row) => sum + row.lineCost, 0)),
        laborCost: 0,
        serviceOnlyCost: 0,
        estimatedTotal: authNet > 0 || authGross > 0 ? authNet : view.estimatedTotal,
    };
}
