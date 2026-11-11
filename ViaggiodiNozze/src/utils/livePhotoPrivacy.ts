export function canReadLocalLivePhoto(
  photo: { tripId?: string; userId?: string } | null | undefined,
  tripId: string | null,
  userId: string | null,
  cloudRole: string | null,
  external: boolean,
): boolean {
  return Boolean(photo && !external && (cloudRole === 'owner' || cloudRole === 'copilota')
    && tripId && userId && photo.tripId === tripId && photo.userId === userId);
}
