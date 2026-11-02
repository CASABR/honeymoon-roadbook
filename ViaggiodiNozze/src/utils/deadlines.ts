import type { Scadenza, StatoScadenza } from '../types';

export function getDeadlineTimestamp(deadline: Scadenza): number | null {
  if (!deadline.dueDate) return null;
  const time = deadline.dueTime || '23:59';
  const timestamp = new Date(`${deadline.dueDate}T${time}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getEffectiveDeadlineStatus(deadline: Scadenza, now = Date.now()): StatoScadenza {
  if (deadline.status === 'completata') return 'completata';
  const dueAt = getDeadlineTimestamp(deadline);
  if (dueAt !== null && dueAt < now) return 'scaduta';
  return deadline.status === 'scaduta' ? 'da_fare' : deadline.status;
}

export function isDeadlineReminderActive(deadline: Scadenza, now = Date.now()): boolean {
  const status = getEffectiveDeadlineStatus(deadline, now);
  if (status === 'completata') return false;
  const dueAt = getDeadlineTimestamp(deadline);
  if (dueAt === null) return false;
  return now >= dueAt - Math.max(0, deadline.reminderMinutesBefore || 0) * 60_000;
}

export function sortDeadlines(deadlines: Scadenza[]): Scadenza[] {
  return [...deadlines].sort((left, right) => {
    const leftDone = getEffectiveDeadlineStatus(left) === 'completata';
    const rightDone = getEffectiveDeadlineStatus(right) === 'completata';
    if (leftDone !== rightDone) return leftDone ? 1 : -1;
    const leftAt = getDeadlineTimestamp(left) ?? Number.MAX_SAFE_INTEGER;
    const rightAt = getDeadlineTimestamp(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftAt !== rightAt) return leftAt - rightAt;
    return right.updatedAt - left.updatedAt;
  });
}
