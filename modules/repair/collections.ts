import { collection } from 'firebase/firestore';
import { db } from '../auth/services/firebase';

export const REPAIR_BRANCHES_COL = 'repair_branches';
export const REPAIR_JOBS_COL = 'repair_jobs';
export const REPAIR_SPARE_PARTS_COL = 'repair_spare_parts';
export const REPAIR_SPARE_PARTS_STOCK_COL = 'repair_spare_parts_stock';
export const REPAIR_PARTS_TRANSACTIONS_COL = 'repair_parts_transactions';
export const REPAIR_CASH_TRANSACTIONS_COL = 'repair_cash_transactions';
export const REPAIR_CASH_SESSIONS_COL = 'repair_cash_sessions';
export const REPAIR_SALE_INVOICES_COL = 'repair_sale_invoices';
export const REPAIR_TECHNICIAN_ASSIGNMENTS_COL = 'repair_technician_branches';
export const REPAIR_COUNTERS_COL = '_repair_counters';

export const repairBranchesRef = () => collection(db, REPAIR_BRANCHES_COL);
export const repairJobsRef = () => collection(db, REPAIR_JOBS_COL);
export const repairSparePartsRef = () => collection(db, REPAIR_SPARE_PARTS_COL);
export const repairSparePartsStockRef = () => collection(db, REPAIR_SPARE_PARTS_STOCK_COL);
export const repairPartsTransactionsRef = () => collection(db, REPAIR_PARTS_TRANSACTIONS_COL);
export const repairCashTransactionsRef = () => collection(db, REPAIR_CASH_TRANSACTIONS_COL);
export const repairCashSessionsRef = () => collection(db, REPAIR_CASH_SESSIONS_COL);
export const repairSaleInvoicesRef = () => collection(db, REPAIR_SALE_INVOICES_COL);
export const repairTechnicianAssignmentsRef = () => collection(db, REPAIR_TECHNICIAN_ASSIGNMENTS_COL);
