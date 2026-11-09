import type { Tappa } from '../types';

export function isTaskTappa(tappa?: Pick<Tappa, 'sottocategoria'> | null): boolean {
  return tappa?.sottocategoria === 'Task';
}

/** Operational links are web URLs, never geographic destinations or executable schemes. */
export function getTaskLink(link?: string): string | undefined {
  if (!link?.trim()) return undefined;
  try {
    const url = new URL(link.trim());
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}
