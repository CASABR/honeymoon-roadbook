import type { OpeningHoursInfo } from '../../types';
import { getOpeningHoursText, openingHoursMessage } from '../../utils/openingHours';

export default function OpeningHoursBadge({ info, date, time }: { info?: OpeningHoursInfo; date?: string; time?: string }) {
  if (!info) return null;
  const message = openingHoursMessage(info, date, time);
  const hoursText = getOpeningHoursText(info, date);
  const conciseLabel = hoursText && info.verifiedAt && info.status !== 'unverified'
    ? message.tone === 'warning'
      ? `⚠️ Orari (${hoursText}) · ${message.text}`
      : info.accessType === 'outdoor'
      ? `🕒 Orari verificati: ${hoursText} (luogo all'aperto)`
      : `🕒 Orari verificati: ${hoursText}`
    : message.text;

  return (
    <p className={`text-xs font-semibold leading-snug ${
      message.tone === 'warning'
        ? 'text-amber-800 dark:text-amber-300'
        : message.tone === 'success'
        ? 'text-emerald-800 dark:text-emerald-300'
        : 'text-slate-600 dark:text-slate-300'
    }`}>
      {conciseLabel}
    </p>
  );
}
