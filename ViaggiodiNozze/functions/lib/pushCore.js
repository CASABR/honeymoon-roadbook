"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PUSH_PREFERENCES = void 0;
exports.normalizePushPreferences = normalizePushPreferences;
exports.isValidTimeZone = isValidTimeZone;
exports.zonedDateTimeToUtc = zonedDateTimeToUtc;
exports.buildReminderCandidates = buildReminderCandidates;
exports.buildDeadlineReminderCandidate = buildDeadlineReminderCandidate;
exports.preferenceAllows = preferenceAllows;
exports.containsSensitivePushContent = containsSensitivePushContent;
exports.DEFAULT_PUSH_PREFERENCES = {
    transports: true,
    activities: true,
    lodging: true,
    deadlines: true,
    collaboration: true,
    reminderMinutes: 60,
};
const REMINDER_LIMITS = new Set([15, 30, 60, 120, 360, 720, 1440]);
function normalizePushPreferences(value) {
    const input = value && typeof value === 'object' ? value : {};
    const rawMinutes = Number(input.reminderMinutes);
    return {
        transports: input.transports !== false,
        activities: input.activities !== false,
        lodging: input.lodging !== false,
        deadlines: input.deadlines !== false,
        collaboration: input.collaboration !== false,
        reminderMinutes: REMINDER_LIMITS.has(rawMinutes) ? rawMinutes : exports.DEFAULT_PUSH_PREFERENCES.reminderMinutes,
    };
}
function isValidTimeZone(timeZone) {
    if (typeof timeZone !== 'string' || timeZone.length < 3 || timeZone.length > 64)
        return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
        return true;
    }
    catch (_a) {
        return false;
    }
}
function parseDateTime(date, time) {
    if (typeof date !== 'string' || typeof time !== 'string')
        return null;
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
    if (!dateMatch || !timeMatch)
        return null;
    const values = [
        Number(dateMatch[1]),
        Number(dateMatch[2]),
        Number(dateMatch[3]),
        Number(timeMatch[1]),
        Number(timeMatch[2]),
    ];
    if (values[1] < 1 || values[1] > 12 || values[2] < 1 || values[2] > 31 || values[3] > 23 || values[4] > 59)
        return null;
    return values;
}
function wallClockParts(timestamp, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(timestamp));
    const read = (type) => { var _a; return Number(((_a = parts.find(part => part.type === type)) === null || _a === void 0 ? void 0 : _a.value) || 0); };
    return [read('year'), read('month'), read('day'), read('hour'), read('minute')];
}
function zonedDateTimeToUtc(date, time, timeZone) {
    const desired = parseDateTime(date, time);
    if (!desired || !isValidTimeZone(timeZone))
        return null;
    const desiredAsUtc = Date.UTC(desired[0], desired[1] - 1, desired[2], desired[3], desired[4]);
    let candidate = desiredAsUtc;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const actual = wallClockParts(candidate, timeZone);
        const actualAsUtc = Date.UTC(actual[0], actual[1] - 1, actual[2], actual[3], actual[4]);
        candidate += desiredAsUtc - actualAsUtc;
    }
    const verified = wallClockParts(candidate, timeZone);
    return verified.every((value, index) => value === desired[index]) ? candidate : null;
}
function candidate(kind, eventAt, title, body) {
    if (!eventAt || eventAt <= Date.now())
        return [];
    return [{ kind, eventAt, title, body, url: '/honeymoon-roadbook/?pushView=oggi' }];
}
function buildReminderCandidates(collection, data) {
    if (collection === 'trasporti') {
        if (!['prenotato', 'completato'].includes(String(data.status || '')))
            return [];
        const timeZone = data.departureTimeZone || data.timeZone;
        const departure = candidate('transport_departure', zonedDateTimeToUtc(data.date, data.departureTime, timeZone), 'Trasporto in programma', 'È quasi ora: controlla i dettagli in HOUNIGO.');
        const rentalReturn = ['auto', 'camper'].includes(String(data.type || ''))
            ? candidate('rental_return', zonedDateTimeToUtc(data.dropoffDate, data.dropoffTime, data.dropoffTimeZone || timeZone), 'Riconsegna noleggio', 'Controlla orario e luogo di riconsegna in HOUNIGO.')
            : [];
        return [...departure, ...rentalReturn];
    }
    if (collection === 'attivita') {
        if (data.status !== 'prenotato')
            return [];
        return candidate('activity_start', zonedDateTimeToUtc(data.date, data.orarioInizio || data.time, data.timeZone), 'Attività in programma', 'L’attività inizierà a breve: apri HOUNIGO per i dettagli.');
    }
    if (!['prenotato', 'completato'].includes(String(data.status || '')))
        return [];
    return [
        ...candidate('lodging_checkin', zonedDateTimeToUtc(data.checkIn, data.checkInTime, data.timeZone), 'Check-in in programma', 'Controlla orario e indirizzo in HOUNIGO.'),
        ...candidate('lodging_checkout', zonedDateTimeToUtc(data.checkOut, data.checkOutTime, data.timeZone), 'Check-out in programma', 'Il check-out si avvicina: verifica i dettagli in HOUNIGO.'),
    ];
}
function buildDeadlineReminderCandidate(data) {
    if (data.recordKind !== 'scadenza' || data.dateVerified !== true || data.status === 'completata')
        return [];
    const eventAt = zonedDateTimeToUtc(data.dueDate, data.dueTime, data.timeZone);
    const leadMinutes = Number(data.reminderMinutesBefore);
    if (!eventAt || !Number.isFinite(leadMinutes) || leadMinutes < 0 || leadMinutes > 43200)
        return [];
    return [{
            kind: 'deadline_due',
            eventAt,
            leadMinutes,
            title: 'Scadenza del viaggio',
            body: 'Hai un promemoria da controllare in HOUNIGO.',
            url: '/honeymoon-roadbook/?pushView=scadenze',
        }];
}
function preferenceAllows(preferences, kind) {
    if (kind === 'deadline_due')
        return preferences.deadlines;
    if (kind === 'activity_start')
        return preferences.activities;
    if (kind === 'lodging_checkin' || kind === 'lodging_checkout')
        return preferences.lodging;
    return preferences.transports;
}
function containsSensitivePushContent(value) {
    return /\b(?:pnr|booking\s*code|codice\s*(?:prenotazione|biglietto)|passaport|e-?ticket)\b/i.test(value);
}
//# sourceMappingURL=pushCore.js.map