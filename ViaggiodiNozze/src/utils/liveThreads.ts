type ThreadMessage = { id: string; createdAt: number; replyToId?: string; hidden?: boolean; deleted?: boolean };
export type ThreadRow<T> = { item: T; depth: number };

/** Keep original messages and their replies together; missing parents remain readable.
 * Bound visual nesting, retain all visible records, and tolerate malformed cycles.
 */
export function groupLiveThreads<T extends ThreadMessage>(items: readonly T[], newestFirst = true): ThreadRow<T>[][] {
  const byId = new Map(items.filter(item => !item.deleted).map(item => [item.id, item]));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  const compare = (a: T, b: T) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  for (const item of byId.values()) {
    const parent = item.replyToId ? byId.get(item.replyToId) : undefined;
    if (parent && parent.id !== item.id) {
      const list = children.get(parent.id) || [];
      list.push(item);
      children.set(parent.id, list);
    } else roots.push(item);
  }
  const visited = new Set<string>();
  const groups: ThreadRow<T>[][] = [];
  const visit = (item: T, depth: number, rows: ThreadRow<T>[]) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    rows.push({ item, depth: Math.min(depth, 2) });
    for (const child of (children.get(item.id) || []).sort(compare)) visit(child, depth + 1, rows);
  };
  for (const root of [...roots.sort((a,b) => newestFirst ? compare(b,a) : compare(a,b)), ...Array.from(byId.values()).sort(compare)]) {
    if (visited.has(root.id)) continue;
    const rows: ThreadRow<T>[] = [];
    visit(root, 0, rows);
    groups.push(rows);
  }
  return groups;
}
