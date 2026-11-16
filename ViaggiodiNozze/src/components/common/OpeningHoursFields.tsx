import type { OpeningHoursInfo } from '../../types';
import {
  buildOpeningHoursFromTimes,
  extractOpeningClosingTimes,
  openingHoursMessage
} from '../../utils/openingHours';
import TimePickerInput from './TimePickerInput';

interface OpeningHoursFieldsProps {
  value?: OpeningHoursInfo;
  onChange: (value: OpeningHoursInfo) => void;
  date?: string;
  time?: string;
}

export default function OpeningHoursFields({ value, onChange, date, time }: OpeningHoursFieldsProps) {
  const { openTime, closeTime } = extractOpeningClosingTimes(value, date);
  const hasTimes = Boolean(openTime || closeTime);
  const message = openingHoursMessage(value, date, time);

  const handleOpenChange = (nextOpen: string) => {
    onChange(buildOpeningHoursFromTimes(nextOpen, closeTime, value, date));
  };

  const handleCloseChange = (nextClose: string) => {
    onChange(buildOpeningHoursFromTimes(openTime, nextClose, value, date));
  };

  return (
    <fieldset className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <legend className="px-1 text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
        Orari apertura
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1">
            Orario di apertura
          </label>
          <TimePickerInput
            value={openTime}
            onChange={handleOpenChange}
            ariaLabel="Orario di apertura"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1">
            Orario di chiusura
          </label>
          <TimePickerInput
            value={closeTime}
            onChange={handleCloseChange}
            ariaLabel="Orario di chiusura"
          />
        </div>
      </div>
      {hasTimes && (
        <div className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${message.tone === 'warning' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : message.tone === 'success' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>
          {message.text}
        </div>
      )}
      <p className="text-[10px] text-slate-500 dark:text-slate-400">
        Gli orari restano offline nel viaggio. HOUNIGO non modifica automaticamente l’orario programmato.
      </p>
    </fieldset>
  );
}
