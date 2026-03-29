import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type PageBackRegistration = {
  label: string;
  disabled: boolean;
  onClick: () => void;
} | null;

type PageBackContextValue = {
  registration: PageBackRegistration;
  setRegistration: (value: PageBackRegistration) => void;
};

const PageBackContext = createContext<PageBackContextValue | null>(null);

export function PageBackProvider({ children }: { children: React.ReactNode }) {
  const [registration, setRegistrationState] = useState<PageBackRegistration>(null);
  const setRegistration = useCallback((value: PageBackRegistration) => {
    setRegistrationState(value);
  }, []);

  const value = useMemo(
    () => ({ registration, setRegistration }),
    [registration, setRegistration],
  );

  return <PageBackContext.Provider value={value}>{children}</PageBackContext.Provider>;
}

/** Returns null when PageHeader is rendered outside AppLayout (no-op registration). */
export function usePageBackSetter(): ((value: PageBackRegistration) => void) | null {
  const ctx = useContext(PageBackContext);
  return ctx?.setRegistration ?? null;
}

export function usePageBackRegistration(): PageBackRegistration {
  const ctx = useContext(PageBackContext);
  return ctx?.registration ?? null;
}
