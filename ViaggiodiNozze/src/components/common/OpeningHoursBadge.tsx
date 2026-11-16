import type { OpeningHoursInfo } from '../../types';
import { extractOpeningClosingTimes, getOpeningHoursText, openingHoursMessage } from '../../utils/openingHours';

export default function OpeningHoursBadge({ info, date, time }: { info?: OpeningHoursInfo; date?: string; time?: string }) {
  if (!info) return null;
  const message = openingHoursMessage(info, date, time);
  const rawHoursText = getOpeningHoursText(info, date);
  const { openTime, closeTime } = extractOpeningClosingTimes(info, date);
  const formattedHours = openTime && closeTime
    ? `${openTime} – ${closeTime}`
    : openTime
    ? `Apertura ${openTime}`
    : closeTime
    ? `Chiusura ${closeTime}`
    : rawHoursText;
  const conciseLabel = formattedHours && info.verifiedAt && info.status !== 'unverified'
    ? message.tone === 'warning'
      ? `${formattedHours} · ${message.text}`
      : info.accessType === 'outdoor'
      ? `${formattedHours} · Accesso all'aperto`
      : `${formattedHours}`
    : message.text;

  return (
    <div className="hounigo-ds-spec-grid">
      <div className={`hounigo-ds-spec-cell ${
        message.tone === 'warning'
          ? 'border-amber-300 dark:border-amber-700/80 bg-amber-50/70 dark:bg-amber-950/30'
          : ''
      }`}>
        <span className="hounigo-ds-spec-label">
          {message.tone === 'warning' ? 'Attenzione orari apertura' : 'Orari apertura'}
        </span>
        <span className={`hounigo-ds-spec-value font-mono ${
          message.tone === 'warning'
            ? 'text-amber-900 dark:text-amber-300'
            : ''
        }`}>
          {conciseLabel}
        </span>
      </div>
    </div>
  );
}
