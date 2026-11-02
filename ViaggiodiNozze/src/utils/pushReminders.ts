export interface ClientPushReminder {
  kind: 'transport_departure' | 'rental_return' | 'activity_start' | 'lodging_checkin' | 'lodging_checkout' | 'deadline_due';
  eventAt: number;
  leadMinutes?: number;
}

function parseDateTime(date: unknown, time: unknown): number[] | null {
  if (typeof date !== 'string' || typeof time !== 'string') return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  return [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]), Number(timeMatch[1]), Number(timeMatch[2])];
}

function zonedDateTimeToUtc(date: unknown, time: unknown, timeZone: unknown): number | null {
  const desired = parseDateTime(date, time);
  if (!desired || typeof timeZone !== 'string') return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    const desiredAsUtc = Date.UTC(desired[0], desired[1] - 1, desired[2], desired[3], desired[4]);
    let candidate = desiredAsUtc;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = formatter.formatToParts(new Date(candidate));
      const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value || 0);
      const actualAsUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'));
      candidate += desiredAsUtc - actualAsUtc;
    }
    return candidate > Date.now() ? candidate : null;
  } catch {
    return null;
  }
}

function candidate(kind: ClientPushReminder['kind'], eventAt: number | null, leadMinutes?: number): ClientPushReminder[] {
  return eventAt ? [{ kind, eventAt, ...(leadMinutes === undefined ? {} : { leadMinutes }) }] : [];
}

export function buildClientPushReminders(entityType: string, data: Record<string, unknown>): ClientPushReminder[] {
  if (entityType === 'trasporto' || entityType === 'trasporti') {
    if (!['prenotato', 'completato'].includes(String(data.status || ''))) return [];
    const timeZone = data.departureTimeZone || data.timeZone;
    return [
      ...candidate('transport_departure', zonedDateTimeToUtc(data.date, data.departureTime, timeZone)),
      ...(['auto', 'camper'].includes(String(data.type || ''))
        ? candidate('rental_return', zonedDateTimeToUtc(data.dropoffDate, data.dropoffTime, data.dropoffTimeZone || timeZone))
        : [])
    ];
  }
  if (entityType === 'attivita' || entityType === 'activity') {
    if (data.status !== 'prenotato') return [];
    return candidate('activity_start', zonedDateTimeToUtc(data.date, data.orarioInizio || data.time, data.timeZone));
  }
  if (entityType === 'alloggio' || entityType === 'alloggi') {
    if (!['prenotato', 'completato'].includes(String(data.status || ''))) return [];
    return [
      ...candidate('lodging_checkin', zonedDateTimeToUtc(data.checkIn, data.checkInTime, data.timeZone)),
      ...candidate('lodging_checkout', zonedDateTimeToUtc(data.checkOut, data.checkOutTime, data.timeZone))
    ];
  }
  if ((entityType === 'note' || entityType === 'nota') && data.recordKind === 'scadenza'
    && data.dateVerified === true && data.status !== 'completata') {
    const leadMinutes = Number(data.reminderMinutesBefore);
    if (!Number.isFinite(leadMinutes) || leadMinutes < 0 || leadMinutes > 43_200) return [];
    return candidate('deadline_due', zonedDateTimeToUtc(data.dueDate, data.dueTime, data.timeZone), leadMinutes);
  }
  return [];
}
