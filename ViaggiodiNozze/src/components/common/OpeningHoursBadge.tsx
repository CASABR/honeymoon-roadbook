import type { OpeningHoursInfo } from '../../types';
import { openingHoursMessage } from '../../utils/openingHours';

export default function OpeningHoursBadge({ info, date, time }: { info?: OpeningHoursInfo; date?: string; time?: string }) {
  if (!info) return null;
  const message = openingHoursMessage(info, date, time);
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${message.tone === 'warning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200' : message.tone === 'success' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{message.text}</span>;
}
