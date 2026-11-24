/**
 * Creating a new UNAPPROVED unit draft is not the same as activating the
 * parent sector. The user may found the draft under a unique, existing,
 * active sector even while the sector's approval remains pending.
 * Employee assignment is still gated separately in Django.
 */
export type SectorUnitDraftEligibility = {
  status: string;
  can_create_link: boolean;
  sector_active: boolean;
  sector_activated: boolean;
};
export function canPreviewSectorUnitDraft(
  preflight: SectorUnitDraftEligibility | null | undefined,
): boolean {
  return Boolean(preflight &&
    preflight.status === 'unit_missing' &&
    preflight.can_create_link &&
    preflight.sector_active);
}
