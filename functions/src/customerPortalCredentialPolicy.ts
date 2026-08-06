export const CUSTOMER_PORTAL_PIN_DIGITS = 6;
export const CUSTOMER_PORTAL_SESSION_MS = 12 * 60 * 60_000;

/** Login creates a session only; the credential version changes exclusively on an explicit PIN reset. */
export const nextPortalCredentialVersion = (current: unknown): number =>
  Math.max(0, Math.floor(Number(current || 0))) + 1;

export const portalSessionMatchesCredential = (credentialVersion: unknown, sessionVersion: unknown): boolean =>
  Number(credentialVersion || 0) === Number(sessionVersion ?? -1);

/** An active PIN is immutable unless the caller explicitly confirms a reset. */
export const canWritePortalPin = (configured: boolean, confirmReset: unknown): boolean =>
  !configured || confirmReset === true;
