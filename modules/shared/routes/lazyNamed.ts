import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Route-level code splitting: `React.lazy` for a named export from a module.
 * Preserves the component's prop types (unlike `ComponentType<unknown>`).
 */
export function lazyNamed<
  M extends Record<string, ComponentType<any>>,
  K extends keyof M & string,
>(importFn: () => Promise<M>, exportName: K): LazyExoticComponent<M[K]> {
  return lazy(async () => {
    const mod = await importFn();
    return { default: mod[exportName] };
  });
}
