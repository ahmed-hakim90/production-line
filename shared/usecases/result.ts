/**
 * Shared usecase result contract.
 * UseCases orchestrate engines + services and emit domain events.
 * UI/store consume results; pages must not call Firestore directly for writes.
 */

export type UseCaseOk<T> = {
  ok: true;
  data: T;
};

export type UseCaseErr = {
  ok: false;
  error: Error;
  code?: string;
};

export type UseCaseResult<T> = UseCaseOk<T> | UseCaseErr;

export function ok<T>(data: T): UseCaseOk<T> {
  return { ok: true, data };
}

export function err(error: unknown, code?: string): UseCaseErr {
  const normalized =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : 'Usecase failed');
  return { ok: false, error: normalized, code };
}

export async function runUseCase<T>(fn: () => Promise<T>): Promise<UseCaseResult<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(error);
  }
}

/** Unwrap for callers that prefer throw-on-failure (e.g. existing store actions). */
export function unwrapOrThrow<T>(result: UseCaseResult<T>): T {
  if (result.ok === true) {
    return result.data;
  }
  throw result.error;
}
