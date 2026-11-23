import {
  getLocalIsoDate,
  getStrictTimeZoneFromCoordinates,
  isValidIanaTimeZone,
  resolveReliableIataTimeZone,
  resolveTimeZoneFromTextList,
  resolveUnambiguousPlaceTimeZone,
  zonedDateTimeToEpochMs,
} from './reliableTimeZone';

export type TimeZoneSource =
  | 'card_explicit'
  | 'card_coordinates'
  | 'card_iata'
  | 'card_place'
  | 'day_or_stage'
  | 'device_fallback'
  | 'none';

export interface ClientPushReminder {
  kind: 'transport_departure' | 'rental_return' | 'activity_start' | 'lodging_checkin' | 'lodging_checkout' | 'deadline_due';
  eventAt: number;
  leadMinutes?: number;
  recoverIfMissed?: boolean;
}

export interface ClientPushSyncItem {
  entityType: string;
  entityId: string;
  reminders: ClientPushReminder[];
}

export interface PushReminderResolutionContext {
  dayLocationsByDate?: Record<string, string>;
  multiTzDates?: Set<string>;
  hasForeignTripContext?: boolean;
  nowMs?: number;
  deviceTimeZone?: string | null;
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

function readEntityDate(data: Record<string, unknown>, entityType?: string): string | undefined {
  const preferDataField = entityType === 'tappa' || entityType === 'tappe'
    || entityType === 'ristorante' || entityType === 'ristoranti'
    || entityType === 'shopping';
  if (preferDataField) {
    if (typeof data.data === 'string' && data.data.trim()) return data.data.trim();
    if (typeof data.date === 'string' && data.date.trim()) return data.date.trim();
  } else {
    if (typeof data.date === 'string' && data.date.trim()) return data.date.trim();
    if (typeof data.data === 'string' && data.data.trim()) return data.data.trim();
  }
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

const TZ_HINT_LABELS: Record<string, string> = {
  'Europe/Rome': 'Roma, Italia',
  'Asia/Shanghai': 'Pechino',
  'Pacific/Auckland': 'Auckland',
  'Australia/Sydney': 'Sydney',
  'Australia/Melbourne': 'Melbourne',
  'Australia/Adelaide': 'Adelaide',
  'Australia/Brisbane': 'Brisbane',
  'Australia/Perth': 'Perth',
  'Asia/Manila': 'Manila',
  'Pacific/Rarotonga': 'Rarotonga',
  'Asia/Taipei': 'Taipei',
};

export function buildPushDayContext(
  collections: TripReminderCollections,
  deviceTimeZone?: string | null,
): {
  dayLocationsByDate: Record<string, string>;
  multiTzDates: Set<string>;
  hasForeignTripContext: boolean;
} {
  const tzByDate = new Map<string, Set<string>>();
  const addTz = (date: string | undefined, tz: string | null | undefined) => {
    if (!date || !tz || !isValidIanaTimeZone(tz)) return;
    let set = tzByDate.get(date);
    if (!set) {
      set = new Set<string>();
      tzByDate.set(date, set);
    }
    set.add(tz.trim());
  };

  for (const day of collections.giorni || []) {
    const date = typeof day?.date === 'string'
      ? day.date.trim()
      : (typeof day?.data === 'string' ? day.data.trim() : '');
    if (!date) continue;
    if (isValidIanaTimeZone(day?.timeZone)) {
      addTz(date, day.timeZone.trim());
    } else {
      const place = [day?.location, day?.luogo, day?.title].filter(v => typeof v === 'string' && v.trim()).join(' · ');
      const singleTz = resolveUnambiguousPlaceTimeZone(place);
      if (singleTz) {
        addTz(date, singleTz);
      } else if (place) {
        for (const seg of place.split(/->|→|\/|·|\|/)) {
          addTz(date, resolveUnambiguousPlaceTimeZone(seg));
        }
      }
    }
  }

  for (const tappa of collections.tappe || []) {
    const date = readEntityDate(tappa, 'tappe');
    if (!date) continue;
    if (isValidIanaTimeZone(tappa?.timeZone)) {
      addTz(date, tappa.timeZone.trim());
      continue;
    }
    const coordTz = coordTimeZone(tappa?.coordinate);
    if (coordTz) {
      addTz(date, coordTz);
      continue;
    }
    const addrPlace = [tappa?.indirizzo, tappa?.address, tappa?.location]
      .filter(v => typeof v === 'string' && v.trim())
      .join(' · ');
    const addrTz = addrPlace ? resolveUnambiguousPlaceTimeZone(addrPlace) : null;
    if (addrTz) {
      addTz(date, addrTz);
      continue;
    }
    const titleText = [tappa?.titolo, tappa?.title].filter(v => typeof v === 'string' && v.trim()).join(' · ');
    if (titleText && !/\b(imbarco|boarding)\b/i.test(titleText)) {
      addTz(date, resolveUnambiguousPlaceTimeZone(titleText));
    }
  }

  for (const trasporto of collections.trasporti || []) {
    const date = readEntityDate(trasporto, 'trasporti');
    if (!date) continue;
    const explicitTz = trasporto?.departureTimeZone || trasporto?.timeZone;
    if (isValidIanaTimeZone(explicitTz)) {
      addTz(date, explicitTz.trim());
      continue;
    }
    const coordTz = coordTimeZone(trasporto?.coordinate);
    if (coordTz) {
      addTz(date, coordTz);
      continue;
    }
    const iataTz = resolveReliableIataTimeZone(trasporto?.departureIata);
    if (iataTz) {
      addTz(date, iataTz);
      continue;
    }
    addTz(date, resolveTimeZoneFromTextList([trasporto?.departureLocation, trasporto?.location, trasporto?.address]));
  }

  for (const alloggio of collections.alloggi || []) {
    const tz = isValidIanaTimeZone(alloggio?.timeZone)
      ? alloggio.timeZone.trim()
      : (coordTimeZone(alloggio?.coordinate)
        || resolveTimeZoneFromTextList([alloggio?.indirizzo, alloggio?.address, alloggio?.location, alloggio?.name, alloggio?.nome, alloggio?.title]));
    if (!tz) continue;
    if (typeof alloggio?.checkIn === 'string' && alloggio.checkIn.trim()) addTz(alloggio.checkIn.trim(), tz);
    if (typeof alloggio?.checkOut === 'string' && alloggio.checkOut.trim()) addTz(alloggio.checkOut.trim(), tz);
  }

  const dayLocationsByDate: Record<string, string> = {};
  const multiTzDates = new Set<string>();
  const allObservedTzs = new Set<string>();

  for (const [date, set] of tzByDate.entries()) {
    set.forEach(tz => allObservedTzs.add(tz));
    if (set.size === 1) {
      const onlyTz = set.values().next().value as string;
      dayLocationsByDate[date] = TZ_HINT_LABELS[onlyTz] || onlyTz;
    } else if (set.size > 1) {
      multiTzDates.add(date);
    }
  }

  const cleanDevTz = isValidIanaTimeZone(deviceTimeZone) ? deviceTimeZone.trim() : null;
  const hasForeignTripContext = allObservedTzs.size > 0
    && (!cleanDevTz || [...allObservedTzs].some(tz => tz !== cleanDevTz));

  return { dayLocationsByDate, multiTzDates, hasForeignTripContext };
}

export function buildDayLocationsMap(
  days: Array<Record<string, unknown>> = [],
  tappe: Array<Record<string, unknown>> = [],
  trasporti: Array<Record<string, unknown>> = [],
  alloggi: Array<Record<string, unknown>> = [],
): Record<string, string> {
  return buildPushDayContext({ giorni: days, tappe, trasporti, alloggi }).dayLocationsByDate;
}

function coordTimeZone(coord: unknown): string | null {
  if (!coord || typeof coord !== 'object') return null;
  const lat = Number((coord as { lat?: unknown }).lat);
  const lng = Number((coord as { lng?: unknown }).lng);
  return getStrictTimeZoneFromCoordinates(lat, lng);
}

export function resolveEntityTimeZoneWithSource(
  entityType: string,
  data: Record<string, unknown>,
  options: { isDropoff?: boolean; dateHint?: string; context?: PushReminderResolutionContext } = {},
): { timeZone: string | null; source: TimeZoneSource } {
  const explicitZone = options.isDropoff
    ? (data.dropoffTimeZone || data.timeZone || data.departureTimeZone)
    : (entityType === 'trasporto' || entityType === 'trasporti'
      ? (data.departureTimeZone || data.timeZone)
      : data.timeZone);
  if (isValidIanaTimeZone(explicitZone)) {
    return { timeZone: explicitZone.trim(), source: 'card_explicit' };
  }

  if (options.isDropoff) {
    const dropoffCoordTz = coordTimeZone(data.dropoffCoordinate);
    if (dropoffCoordTz) return { timeZone: dropoffCoordTz, source: 'card_coordinates' };
    const dropoffPlaceTz = resolveTimeZoneFromTextList([data.dropoffLocation, data.arrivalLocation]);
    if (dropoffPlaceTz) return { timeZone: dropoffPlaceTz, source: 'card_place' };
  }

  const primaryCoordTz = coordTimeZone(data.coordinate);
  if (primaryCoordTz) return { timeZone: primaryCoordTz, source: 'card_coordinates' };

  const dateKey = options.dateHint || readEntityDate(data, entityType) || (typeof data.checkIn === 'string' ? data.checkIn : undefined) || (typeof data.dueDate === 'string' ? data.dueDate : undefined);
  const isMultiTzDay = Boolean(dateKey && options.context?.multiTzDates?.has(dateKey));

  if (entityType === 'trasporto' || entityType === 'trasporti') {
    const iataTz = resolveReliableIataTimeZone(options.isDropoff ? data.arrivalIata : data.departureIata);
    if (iataTz) return { timeZone: iataTz, source: 'card_iata' };
    const locTz = resolveTimeZoneFromTextList([
      options.isDropoff ? data.dropoffLocation : data.departureLocation,
      data.location,
      data.address,
    ]);
    if (locTz) return { timeZone: locTz, source: 'card_place' };
  } else {
    const addrTz = resolveTimeZoneFromTextList([
      data.indirizzo,
      data.address,
      data.location,
    ]);
    if (addrTz) return { timeZone: addrTz, source: 'card_place' };
  }

  if (dateKey && !isMultiTzDay && options.context?.dayLocationsByDate?.[dateKey]) {
    const dayVal = options.context.dayLocationsByDate[dateKey];
    const dayTz = isValidIanaTimeZone(dayVal) ? dayVal.trim() : resolveUnambiguousPlaceTimeZone(dayVal);
    if (dayTz) return { timeZone: dayTz, source: 'day_or_stage' };
  }

  if (entityType !== 'trasporto' && entityType !== 'trasporti') {
    const titleCandidates = [data.title, data.titolo, data.nome, data.name];
    const titleTz = resolveTimeZoneFromTextList(
      titleCandidates.filter((t) => !(typeof t === 'string' && /\b(imbarco|boarding)\b/i.test(t) && /\b(FCO|MXP|LIN|BGY|VCE|NAP)\b/.test(t))),
    );
    if (titleTz) return { timeZone: titleTz, source: 'card_place' };
  }

  const devTz = options.context?.deviceTimeZone;
  if (isValidIanaTimeZone(devTz) && !isMultiTzDay) {
    const cleanDevTz = devTz.trim();
    const todayIso = getLocalIsoDate(new Date(options.context?.nowMs ?? Date.now()), cleanDevTz);
    const isForeignFuture = Boolean(options.context?.hasForeignTripContext && dateKey && dateKey > todayIso);
    if (!isForeignFuture) {
      return { timeZone: cleanDevTz, source: 'device_fallback' };
    }
  }

  return { timeZone: null, source: 'none' };
}

export function resolveReliableEntityTimeZone(
  entityType: string,
  data: Record<string, unknown>,
  options: { isDropoff?: boolean; dateHint?: string; context?: PushReminderResolutionContext } = {},
): string | null {
  return resolveEntityTimeZoneWithSource(entityType, data, options).timeZone;
}

export type PushReminderSkipReason =
  | 'ok'
  | 'invalid_data'
  | 'unsupported_entity'
  | 'unconfirmed_time'
  | 'missing_date_or_time'
  | 'missing_timezone'
  | 'past_event';

export interface PushReminderDiagnosis {
  reminders: ClientPushReminder[];
  skipReason: PushReminderSkipReason;
  appliedTimeZone?: string | null;
  timeZoneSource?: TimeZoneSource;
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

export function diagnoseClientPushReminders(
  entityType: string,
  data: Record<string, unknown>,
  context: PushReminderResolutionContext = {},
): PushReminderDiagnosis {
  const reminders = buildClientPushReminders(entityType, data, context);
  if (!data || typeof data !== 'object') return { reminders: [], skipReason: 'invalid_data', appliedTimeZone: null, timeZoneSource: 'none' };
  const nowMs = context.nowMs ?? Date.now();
  const dateHint =
    readEntityDate(data, entityType) ||
    (typeof data.checkIn === 'string' ? data.checkIn : undefined) ||
    (typeof data.dueDate === 'string' ? data.dueDate : undefined);
  const tzInfo = resolveEntityTimeZoneWithSource(entityType, data, { dateHint, context });
  if (reminders.length > 0) {
    return {
      reminders,
      skipReason: 'ok',
      appliedTimeZone: tzInfo.timeZone,
      timeZoneSource: tzInfo.source,
    };
  }

  if (entityType === 'note' || entityType === 'nota' || entityType === 'scadenza' || entityType === 'scadenze') {
    if (data.recordKind !== 'scadenza' || data.dateVerified !== true || data.status === 'completata') {
      return { reminders: [], skipReason: 'unconfirmed_time', appliedTimeZone: tzInfo.timeZone, timeZoneSource: tzInfo.source };
    }
    const dueDate = typeof data.dueDate === 'string' ? data.dueDate : '';
    const dueTime = typeof data.dueTime === 'string' ? data.dueTime : '';
    if (!dueDate || !dueTime) return { reminders: [], skipReason: 'missing_date_or_time', appliedTimeZone: tzInfo.timeZone, timeZoneSource: tzInfo.source };
    if (!tzInfo.timeZone) return { reminders: [], skipReason: 'missing_timezone', appliedTimeZone: null, timeZoneSource: 'none' };
    const eventAt = zonedDateTimeToEpochMs(dueDate, dueTime, tzInfo.timeZone);
    return {
      reminders: [],
      skipReason: !eventAt ? 'missing_date_or_time' : (eventAt <= nowMs ? 'past_event' : 'invalid_data'),
      appliedTimeZone: tzInfo.timeZone,
      timeZoneSource: tzInfo.source,
    };
  }

  const isLegacyAllowed = ['trasporto', 'trasporti', 'attivita', 'activity', 'alloggio', 'alloggi'].includes(entityType);
  const isSimpleCard = ['ristorante', 'ristoranti', 'tappa', 'tappe', 'shopping'].includes(entityType);
  if (!isLegacyAllowed && !isSimpleCard) return { reminders: [], skipReason: 'unsupported_entity', appliedTimeZone: null, timeZoneSource: 'none' };
  if (!isConfirmedCardTime(data, isLegacyAllowed)) return { reminders: [], skipReason: 'unconfirmed_time', appliedTimeZone: tzInfo.timeZone, timeZoneSource: tzInfo.source };

  const timeHint = data.orarioInizio || data.time || data.orario || data.orarioRitrovo || data.departureTime || data.arrivalTime || data.checkInTime || data.checkOutTime;
  if (!dateHint || !timeHint) return { reminders: [], skipReason: 'missing_date_or_time', appliedTimeZone: tzInfo.timeZone, timeZoneSource: tzInfo.source };
  if (!tzInfo.timeZone) return { reminders: [], skipReason: 'missing_timezone', appliedTimeZone: null, timeZoneSource: 'none' };
  const eventAt = zonedDateTimeToEpochMs(dateHint, timeHint, tzInfo.timeZone);
  return {
    reminders: [],
    skipReason: !eventAt ? 'missing_date_or_time' : (eventAt <= nowMs ? 'past_event' : 'invalid_data'),
    appliedTimeZone: tzInfo.timeZone,
    timeZoneSource: tzInfo.source,
  };
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
    const depDate = readEntityDate(data, entityType);
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
    const date = readEntityDate(data, entityType);
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
    const date = readEntityDate(data, entityType);
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
  options: { deviceTimeZone?: string | null; recoverIfMissed?: boolean } = {},
): ClientPushSyncItem[] {
  const dayCtx = buildPushDayContext(collections, options.deviceTimeZone);
  const context: PushReminderResolutionContext = {
    dayLocationsByDate: dayCtx.dayLocationsByDate,
    multiTzDates: dayCtx.multiTzDates,
    hasForeignTripContext: dayCtx.hasForeignTripContext,
    nowMs,
    deviceTimeZone: options.deviceTimeZone,
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
      items.push({
        entityType,
        entityId,
        reminders: options.recoverIfMissed ? reminders.map(r => ({ ...r, recoverIfMissed: true })) : reminders,
      });
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
