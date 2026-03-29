/**
 * Common optional fields for `openModal(key, payload)`.
 * Individual modals narrow with their own types as needed.
 */
export type GlobalModalPayload = {
  source?: string;
  onSaved?: () => void | Promise<void>;
  onClose?: () => void;
};
