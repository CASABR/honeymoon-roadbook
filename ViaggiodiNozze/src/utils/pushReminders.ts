import {
  getStrictTimeZoneFromCoordinates,
  isValidIanaTimeZone,
  resolveReliableIataTimeZone,
  resolveTimeZoneFromTextList,
  resolveUnambiguousPlaceTimeZone,
  zonedDateTimeToEpochMs,
} from './reliableTimeZone';

export interface ClientPushReminder {
  kind: 'transport_departure' | 'rental_return' | 'activity_start' | 'lodging_checkin' | 'lodging_checkout' | 'deadline_due';
  eventAt: number;
  leadMinutes?: number;
}

export interface ClientPushSyncItem {
  entityType: string;
  entityId: string;
  reminders: ClientPushReminder[];
}

export interface PushReminderResolutionContext {
  dayLocationsByDate?: Record<string, string>;
  nowMs?: number;
}

export interface TripReminderCollections {
  giorni?: Array<Record<string, unknown>>;
  trasporti?: Array<Record<string, unknown>>;
  attivita?: Array<Record<string, unknown>>;
  alloggi?: Array<Record<string, unknown>>;
  ristoranti?: Array<Record<string, unknown>>;
  tappe?: Array<Record<string, unknown>>;
  shopping?: Array<Record<string, unknown>>;
  note?: Array<Record<string, unknown>>;
}

function readEntityDate(data: Record<string, unknown>): string | undefined {
  if (typeof data.date === 'string' && data.date.trim()) return data.date.trim();
  if (typeof data.data === 'string' && data.data.trim()) return data.data.trim();
  if (typeof data.dayId === 'string' && data.dayId.startsWith('day_')) return data.dayId.slice(4).trim();
  return undefined;
}

function isConfirmedCardTime(data: Record<string, unknown>, allowLegacyBookedWithoutTimeStatus: boolean): boolean {
  if (data.completed === true) return false;
  const status = String(data.status || '');
  if (status === 'annullato' || status === 'completata') return false;
  const timeStatus = String(data.timeStatus || '');
  if (timeStatus === 'indicativo' || timeStatus === 'non_specificato') return false;
  if (timeStatus === 'confermato') return true;
  if (allowLegacyBookedWithoutTimeStatus) {
    return status === 'prenotato' || status === 'completato';
  }
  return false;
}

export function buildDayLocationsMap(days: Array<Record<string, unknown>> = []): Record<string, string> {
  const map: Record<string, string> = {};
  for (const day of days) {
    const date = typeof day?.date === 'string'
      ? day.date.trim()
      : (typeof day?.data === 'string' ? day.data.trim() : '');
    const place = [day?.location, day?.title].filter(v => typeof v === 'string' && v.trim()).join(' · ');
    if (date && place) {
      map[date] = place;
    }
  }
  return map;
}

function coordTimeZone(coord: unknown): string | null {
  if (!coord || typeof coord !== 'object') return null;
  const lat = Number((coord as { lat?: unknown }).lat);
  const lng = Number((coord as { lng?: unknown }).lng);
  return getStrictTimeZoneFromCoordinates(lat, lng);
}

export function resolveReliableEntityTimeZone(
  entityType: string,
  data: Record<string, unknown>,
  options: { isDropoff?: boolean; dateHint?: string; context?: PushReminderResolutionContext } = {},
): string | null {
  const explicitZone = options.isDropoff
    ? (data.dropoffTimeZone || data.timeZone || data.departureTimeZone)
    : (entityType === 'trasporto' || entityType === 'trasporti'
      ? (data.departureTimeZone || data.timeZone)
      : data.timeZone);
  if (isValidIanaTimeZone(explicitZone)) {
    return explicitZone.trim();
  }

  if (options.isDropoff) {
    const dropoffCoordTz = coordTimeZone(data.dropoffCoordinate);
    if (dropoffCoordTz) return dropoffCoordTz;
    const dropoffPlaceTz = resolveTimeZoneFromTextList([data.dropoffLocation, data.arrivalLocation]);
    if (dropoffPlaceTz) return dropoffPlaceTz;
  }

  const primaryCoordTz = coordTimeZone(data.coordinate);
  if (primaryCoordTz) return primaryCoordTz;

  if (entityType === 'trasporto' || entityType === 'trasporti') {
    const iataTz = resolveReliableIataTimeZone(options.isDropoff ? data.arrivalIata : data.departureIata);
    if (iataTz) return iataTz;
    const locTz = resolveTimeZoneFromTextList([
      options.isDropoff ? data.dropoffLocation : data.departureLocation,
      data.location,
      data.address,
    ]);
    if (locTz) return locTz;
  } else {
    const placeTz = resolveTimeZoneFromTextList([
      data.indirizzo,
      data.address,
      data.location,
      data.title,
      data.titolo,
      data.nome,
      data.name,
    ]);
    if (placeTz) return placeTz;
  }

  const dateKey = options.dateHint || readEntityDate(data) || (typeof data.checkIn === 'string' ? data.checkIn : undefined) || (typeof data.dueDate === 'string' ? data.dueDate : undefined);
  if (dateKey && options.context?.dayLocationsByDate?.[dateKey]) {
    const dayTz = resolveUnambiguousPlaceTimeZone(options.context.dayLocationsByDate[dateKey]);
    if (dayTz) return dayTz;
  }

  return null;
}

function futureUtcCandidate(
  kind: ClientPushReminder['kind'],
  date: unknown,
  time: unknown,
  timeZone: string | null,
  nowMs: number,
  leadMinutes?: number,
): ClientPushReminder[] {
  if (!timeZone) return [];
  const eventAt = zonedDateTimeToEpochMs(date, time, timeZone);
  if (!eventAt || eventAt <= nowMs) return [];
  return [{ kind, eventAt, ...(leadMinutes === undefined ? {} : { leadMinutes }) }];
}

export function buildClientPushReminders(
  entityType: string,
  data: Record<string, unknown>,
  context: PushReminderResolutionContext = {},
): ClientPushReminder[] {
  if (!data || typeof data !== 'object') return [];
  const nowMs = context.nowMs ?? Date.now();

  if (entityType === 'trasporto' || entityType === 'trasporti') {
    if (!isConfirmedCardTime(data, true)) return [];
    const depDate = readEntityDate(data);
    const depTz = resolveReliableEntityTimeZone(entityType, data, { dateHint: depDate, context });
    const dropDate = typeof data.dropoffDate === 'string' ? data.dropoffDate : undefined;
    const dropTz = ['auto', 'camper'].includes(String(data.type || ''))
      ? (resolveReliableEntityTimeZone(entityType, data, { isDropoff: true, dateHint: dropDate, context }) || depTz)
      : null;

    return [
      ...futureUtcCandidate('transport_departure', depDate, data.departureTime || data.time || data.orario, depTz, nowMs),
      ...(['auto', 'camper'].includes(String(data.type || '')) && data.dropoffDone !== true
        ? futureUtcCandidate('rental_return', dropDate, data.dropoffTime, dropTz, nowMs)
        : []),
    ];
  }

  if (entityType === 'attivita' || entityType === 'activity') {
    if (!isConfirmedCardTime(data, true)) return [];
    const date = readEntityDate(data);
    const timeZone = resolveReliableEntityTimeZone(entityType, data, { dateHint: date, context });
    return futureUtcCandidate(
      'activity_start',
      date,
      data.orarioInizio || data.time || data.orario || data.orarioRitrovo,
      timeZone,
      nowMs,
    );
  }

  if (entityType === 'alloggio' || entityType === 'alloggi') {
    if (!isConfirmedCardTime(data, true)) return [];
    const checkInDate = typeof data.checkIn === 'string' ? data.checkIn : undefined;
    const checkOutDate = typeof data.checkOut === 'string' ? data.checkOut : undefined;
    const tzIn = resolveReliableEntityTimeZone(entityType, data, { dateHint: checkInDate, context });
    const tzOut = resolveReliableEntityTimeZone(entityType, data, { dateHint: checkOutDate, context }) || tzIn;
    return [
      ...(data.checkInDone === true
        ? []
        : futureUtcCandidate('lodging_checkin', checkInDate, data.arrivalTime || data.checkInTime, tzIn, nowMs)),
      ...(data.checkOutDone === true
        ? []
        : futureUtcCandidate('lodging_checkout', checkOutDate, data.checkOutTime, tzOut, nowMs)),
    ];
  }

  if (['ristorante', 'ristoranti', 'tappa', 'tappe', 'shopping'].includes(entityType)) {
    if (!isConfirmedCardTime(data, false)) return [];
    const date = readEntityDate(data);
    const timeZone = resolveReliableEntityTimeZone(entityType, data, { dateHint: date, context });
    return futureUtcCandidate('activity_start', date, data.orario || data.time, timeZone, nowMs);
  }

  if ((entityType === 'note' || entityType === 'nota' || entityType === 'scadenza' || entityType === 'scadenze')
    && data.recordKind === 'scadenza'
    && data.dateVerified === true
    && data.status !== 'completata') {
    const leadMinutes = Number(data.reminderMinutesBefore);
    if (!Number.isFinite(leadMinutes) || leadMinutes < 0 || leadMinutes > 43_200) return [];
    const dueDate = typeof data.dueDate === 'string' ? data.dueDate : undefined;
    const timeZone = resolveReliableEntityTimeZone(entityType, data, { dateHint: dueDate, context });
    return futureUtcCandidate('deadline_due', dueDate, data.dueTime, timeZone, nowMs, leadMinutes);
  }

  return [];
}

export function collectTripPushReminderItems(
  collections: TripReminderCollections,
  nowMs: number = Date.now(),
): ClientPushSyncItem[] {
  const context: PushReminderResolutionContext = {
    dayLocationsByDate: buildDayLocationsMap(collections.giorni || []),
    nowMs,
  };
  const sources: Array<[string, Array<Record<string, unknown>> | undefined]> = [
    ['trasporti', collections.trasporti],
    ['attivita', collections.attivita],
    ['alloggi', collections.alloggi],
    ['ristoranti', collections.ristoranti],
    ['tappe', collections.tappe],
    ['shopping', collections.shopping],
    ['note', collections.note],
  ];

  const items: ClientPushSyncItem[] = [];
  for (const [entityType, records] of sources) {
    for (const record of records || []) {
      const entityId = typeof record?.id === 'string' ? record.id.trim() : '';
      if (!entityId) continue;
      const reminders = buildClientPushReminders(entityType, record, context);
      if (reminders.length === 0) continue;
      items.push({ entityType, entityId, reminders });
    }
  }
  const earliestEventAt = (item: ClientPushSyncItem) =>
    Math.min(...item.reminders.map(reminder => reminder.eventAt));

  return items.sort((a, b) => {
    const timeDiff = earliestEventAt(a) - earliestEventAt(b);
    if (timeDiff !== 0) return timeDiff;
    return `${a.entityType}:${a.entityId}`.localeCompare(`${b.entityType}:${b.entityId}`);
  });
}
