/** Quality commands live beside the services they coordinate. UI calls those services. */
export const QUALITY_USECASE_NOTES = {
  flow: 'UI -> services -> Firestore',
  boundary: 'Tenant id is stamped from the active company. Permissions are checked before writes and again in Firestore rules.',
} as const;
