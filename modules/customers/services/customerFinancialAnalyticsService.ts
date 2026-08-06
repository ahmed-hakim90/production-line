import { getCustomerFinancialAnalyticsCallable } from '@/modules/auth/services/firebase';
import type { CustomerFinancialAnalytics } from '../types';

export const customerFinancialAnalyticsService = {
  get(customerId: string, period?: { from?: string; to?: string }) {
    return getCustomerFinancialAnalyticsCallable<CustomerFinancialAnalytics>({
      customerId,
      from: period?.from || '',
      to: period?.to || '',
    });
  },
};
