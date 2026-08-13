import { useEffect, useState } from 'react';

import { useAppStore } from '@/store/useAppStore';

export type StoreDataResource =
  | 'products'
  | 'lines'
  | 'employees'
  | 'productionPlans'
  | 'workOrders';

const resourceIsEmpty = (resource: StoreDataResource): boolean => {
  const state = useAppStore.getState();
  switch (resource) {
    case 'products':
      return state._rawProducts.length === 0;
    case 'lines':
      return state._rawLines.length === 0;
    case 'employees':
      return state._rawEmployees.length === 0;
    case 'productionPlans':
      return state.productionPlans.length === 0;
    case 'workOrders':
      return state.workOrders.length === 0;
  }
};

/**
 * Loads route-owned legacy store data and distinguishes a cold request from a
 * confirmed empty result. Store fetch actions already deduplicate concurrent
 * calls, so several mounted consumers can safely request the same resource.
 */
export function useEnsureStoreData(resources: readonly StoreDataResource[]): boolean {
  const resourceKey = resources.join('|');
  const productsPresent = useAppStore((state) => state._rawProducts.length > 0);
  const linesPresent = useAppStore((state) => state._rawLines.length > 0);
  const employeesPresent = useAppStore((state) => state._rawEmployees.length > 0);
  const plansPresent = useAppStore((state) => state.productionPlans.length > 0);
  const workOrdersPresent = useAppStore((state) => state.workOrders.length > 0);
  const fetchProducts = useAppStore((state) => state.fetchProducts);
  const fetchLines = useAppStore((state) => state.fetchLines);
  const fetchEmployees = useAppStore((state) => state.fetchEmployees);
  const fetchProductionPlans = useAppStore((state) => state.fetchProductionPlans);
  const fetchWorkOrders = useAppStore((state) => state.fetchWorkOrders);
  const [loading, setLoading] = useState(() => resources.some(resourceIsEmpty));
  const presenceByResource: Record<StoreDataResource, boolean> = {
    products: productsPresent,
    lines: linesPresent,
    employees: employeesPresent,
    productionPlans: plansPresent,
    workOrders: workOrdersPresent,
  };
  const resourcePresenceKey = resources
    .map((resource) => `${resource}:${presenceByResource[resource] ? '1' : '0'}`)
    .join('|');

  useEffect(() => {
    let active = true;
    const requested = resourceKey.split('|').filter(Boolean) as StoreDataResource[];
    if (requested.some(resourceIsEmpty)) setLoading(true);

    const actions = requested.map((resource) => {
      switch (resource) {
        case 'products':
          return fetchProducts();
        case 'lines':
          return fetchLines();
        case 'employees':
          return fetchEmployees();
        case 'productionPlans':
          return fetchProductionPlans();
        case 'workOrders':
          return fetchWorkOrders();
      }
    });

    void Promise.all(actions).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [
    fetchEmployees,
    fetchLines,
    fetchProductionPlans,
    fetchProducts,
    fetchWorkOrders,
    resourceKey,
    resourcePresenceKey,
  ]);

  return loading;
}
