// A handoff is only a local text proposal, never an instruction to mutate data.
export const ROADBOOK_DRAFT_PREFIX = '#hounigo-draft=';
const MAX_BYTES = 4096;
export type RoadbookDraft = { schema: 1; tripId: string; text: string };

export function decodeRoadbookDraft(hash: string): RoadbookDraft | null {
  if (!hash.startsWith(ROADBOOK_DRAFT_PREFIX)) return null;
  const hex = hash.slice(ROADBOOK_DRAFT_PREFIX.length);
  if (!hex || hex.length > MAX_BYTES * 2 || hex.length % 2 || !/^[0-9a-f]+$/i.test(hex)) return null;
  try {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const p = payload as Record<string, unknown>;
    if (Object.keys(p).some(key => !['schema', 'tripId', 'text'].includes(key)) ||
      p.schema !== 1 || typeof p.tripId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(p.tripId) ||
      typeof p.text !== 'string' || !p.text.trim() || p.text.length > MAX_BYTES) return null;
    return { schema: 1, tripId: p.tripId, text: p.text };
  } catch { return null; }
}

export function mayOpenRoadbookDraft(draft: RoadbookDraft, session: {
  authenticated: boolean; external: boolean; admin: boolean; simulated: boolean;
  tripId?: string; role: string | null; uid: string | null; authUid: string | null; anonymous: boolean;
}): boolean {
  return session.authenticated && !session.external && !session.admin && !session.simulated
    && session.tripId === draft.tripId && Boolean(session.uid && session.uid === session.authUid)
    && !session.anonymous && (session.role === 'owner' || session.role === 'copilota');
}
