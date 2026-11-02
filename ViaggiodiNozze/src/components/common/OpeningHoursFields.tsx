import type { OpeningHoursInfo } from '../../types';
import { getOpeningHoursDay, OPENING_HOURS_DAY_LABELS, openingHoursMessage } from '../../utils/openingHours';

interface OpeningHoursFieldsProps {
  value?: OpeningHoursInfo;
  onChange: (value: OpeningHoursInfo) => void;
  date?: string;
  time?: string;
}

const EMPTY_INFO: OpeningHoursInfo = { status: 'unverified', accessType: 'unknown' };

export default function OpeningHoursFields({ value, onChange, date, time }: OpeningHoursFieldsProps) {
  const info = value || EMPTY_INFO;
  const day = getOpeningHoursDay(date);
  const schedule = day ? info.weekly?.[day] || '' : '';
  const exception = date ? info.exceptions?.[date] || '' : '';
  const message = openingHoursMessage(info, date, time);
  const update = (patch: Partial<OpeningHoursInfo>) => onChange({ ...info, ...patch });

  return (
    <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <legend className="px-1 text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">Orari di apertura</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Stato
          <select value={info.status} onChange={(event) => update({ status: event.target.value as OpeningHoursInfo['status'] })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="unverified">Orari non verificati</option>
            <option value="manual">Confermati manualmente</option>
            <option value="verified">Verificati da fonte pubblica</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Tipo di accesso
          <select value={info.accessType} onChange={(event) => update({ accessType: event.target.value as OpeningHoursInfo['accessType'] })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="unknown">Da specificare</option>
            <option value="attraction">Attrazione con orari</option>
            <option value="outdoor">Luogo all’aperto</option>
          </select>
        </label>
      </div>
      {day && (
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">{OPENING_HOURS_DAY_LABELS[day]} — intervalli
          <input value={schedule} onChange={(event) => update({ weekly: { ...info.weekly, [day]: event.target.value } })} placeholder="09:00-12:00, 13:00-17:00 oppure chiuso" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
        </label>
      )}
      {date && (
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Eccezione per {date} (festività o stagionalità)
          <input value={exception} onChange={(event) => update({ exceptions: { ...info.exceptions, [date]: event.target.value } })} placeholder="Lascia vuoto oppure indica intervalli / chiuso" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
        </label>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Fonte pubblica o nota
          <input value={info.source || ''} onChange={(event) => update({ source: event.target.value })} placeholder="Sito ufficiale o conferma diretta" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
        </label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Data di verifica
          <input type="date" value={info.verifiedAt || ''} onChange={(event) => update({ verifiedAt: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
        </label>
      </div>
      <div className={`rounded-xl px-3 py-2 text-xs font-semibold ${message.tone === 'warning' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : message.tone === 'success' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>{message.text}</div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">Gli orari restano offline nel viaggio. HOUNIGO non modifica automaticamente l’orario programmato.</p>
    </fieldset>
  );
}
