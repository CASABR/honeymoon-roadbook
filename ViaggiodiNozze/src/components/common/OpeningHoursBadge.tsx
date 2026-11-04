import type { OpeningHoursInfo } from '../../types';
import { getOpeningHoursText, openingHoursMessage } from '../../utils/openingHours';

export default function OpeningHoursBadge({ info, date, time }: { info?: OpeningHoursInfo; date?: string; time?: string }) {
  if (!info) return null;
  const message = openingHoursMessage(info, date, time);
  const hoursText = getOpeningHoursText(info, date);
  const fullLabel = hoursText && info.verifiedAt && info.status !== 'unverified'
    ? `🕒 Orari verificati (${hoursText}) · ${message.text}`
    : message.text;
  return (
    <span className={`inline-flex items-center rounded-xl px-2.5 py-1 text-xs font-bold border ${
      message.tone === 'warning'
        ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800'
        : message.tone === 'success'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
        : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
    }`}>
      {fullLabel}
    </span>
  );
}
