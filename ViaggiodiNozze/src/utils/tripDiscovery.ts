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

export function resolveVerifiedTripRole(
  uid: string,
  tripData: { ownerUid?: unknown; ownerId?: unknown; members?: unknown },
  memberDocumentExists = false,
  memberDocumentRole?: unknown
): 'owner' | 'copilota' | null {
  if (tripData.ownerUid === uid || tripData.ownerId === uid) return 'owner';
  if (Array.isArray(tripData.members) && tripData.members.includes(uid)) return 'copilota';
  if (!memberDocumentExists) return null;
  return memberDocumentRole === 'owner' ? 'owner' : 'copilota';
}
