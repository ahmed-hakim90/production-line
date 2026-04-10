/** حزمة تصدير/استيراد موديول إيداعات العملاء — يجب أن يبقى المخطط متوافقًا مع Cloud Function. */
export const CUSTOMER_DEPOSITS_PACK_VERSION = 1 as const;

export type CustomerDepositsPackMode = 'merge' | 'replace_module';

export type CustomerDepositsPackMetadata = {
  customerDepositsPackVersion: typeof CUSTOMER_DEPOSITS_PACK_VERSION;
  /** يُملأ عند التصدير الكامل؛ يُستبدل تلقائيًا من الخادم عند الاستيراد إن وُجد الملف بلا معرّف شركة. */
  tenantId?: string;
  exportedAt: string;
};

/** مستند قابل للتسلسل: حقول Firestore مع طوابع زمنية كسلاسل ISO؛ `_docId` اختياري في القوالب الجديدة */
export type SerializedCustomerDepositDoc = Record<string, unknown> & { _docId?: string };

export type CustomerDepositsPack = {
  metadata: CustomerDepositsPackMetadata;
  customers: SerializedCustomerDepositDoc[];
  companyBankAccounts: SerializedCustomerDepositDoc[];
  entries: SerializedCustomerDepositDoc[];
  adjustments: SerializedCustomerDepositDoc[];
};
