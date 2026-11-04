import type { OpeningHoursInfo } from '../../types';
import { getOpeningHoursText, openingHoursMessage } from '../../utils/openingHours';

export default function OpeningHoursBadge({ info, date, time }: { info?: OpeningHoursInfo; date?: string; time?: string }) {
  if (!info) return null;
  const message = openingHoursMessage(info, date, time);
  const hoursText = getOpeningHoursText(info, date);
  const conciseLabel = hoursText && info.verifiedAt && info.status !== 'unverified'
    ? message.tone === 'warning'
      ? `${hoursText} · ${message.text}`
      : info.accessType === 'outdoor'
      ? `${hoursText} · Accesso all'aperto`
      : `${hoursText}`
    : message.text;

  return (
    <div className="hounigo-ds-spec-grid">
      <div className={`hounigo-ds-spec-cell ${
        message.tone === 'warning'
          ? 'border-amber-300 dark:border-amber-700/80 bg-amber-50/70 dark:bg-amber-950/30'
          : ''
      }`}>
        <span className="hounigo-ds-spec-label">
          {message.tone === 'warning' ? 'Attenzione orari apertura' : 'Orari apertura verificati'}
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
