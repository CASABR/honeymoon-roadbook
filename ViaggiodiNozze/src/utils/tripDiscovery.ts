export interface TripDiscoveryPlan {
  indexedTripIds: string[];
  localCandidateIds: string[];
  uniqueTripIds: string[];
}

const normalizeTripIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean)));
};

export function buildTripDiscoveryPlan(
  associatedTripIds: unknown,
  lastTripId: unknown,
  localTripIds: unknown
): TripDiscoveryPlan {
  const indexedTripIds = normalizeTripIds(associatedTripIds);
  const cleanLastTripId = typeof lastTripId === 'string' ? lastTripId.trim() : '';
  if (cleanLastTripId && !indexedTripIds.includes(cleanLastTripId)) indexedTripIds.unshift(cleanLastTripId);

  const localCandidateIds = normalizeTripIds(localTripIds);
  return {
    indexedTripIds,
    localCandidateIds,
    uniqueTripIds: Array.from(new Set([...indexedTripIds, ...localCandidateIds]))
  };
}

export type VerifiedTripRole = 'owner' | 'copilota' | 'viewer' | null;

export function resolveVerifiedTripRole(
  uid: string,
  tripData: { ownerUid?: unknown; ownerId?: unknown; members?: unknown },
  memberDocumentExists = false,
  memberDocumentRole?: unknown
): VerifiedTripRole {
  if (!uid) return null;
  if (tripData.ownerUid === uid || tripData.ownerId === uid) return 'owner';

  // Se esiste il documento membro autoritativo nella sottocollezione /members/{uid},
  // il suo ruolo ha precedenza assoluta. Un membro Viewer NON deve mai essere interpretato come Copilota.
  if (memberDocumentExists) {
    const roleStr = typeof memberDocumentRole === 'string' ? memberDocumentRole.trim().toLowerCase() : '';
    if (roleStr === 'owner') return 'owner';
    if (roleStr === 'viewer' || roleStr === 'ospite' || roleStr === 'guest') return 'viewer';
    if (roleStr === 'copilota' || roleStr === 'guida') return 'copilota';
    return null; // Ruolo non autorizzato, non valido o revocato
  }

  // Se non esiste un documento membro puntuale, controlla l'array dei members sul documento del viaggio
  if (Array.isArray(tripData.members) && tripData.members.includes(uid)) {
    return 'copilota';
  }

  return null;
}
