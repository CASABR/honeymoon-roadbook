import { useId } from 'react';

interface TimeZoneInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

const COMMON_TIME_ZONES = [
  'Europe/Rome',
  'Pacific/Auckland',
  'Australia/Sydney',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'America/Los_Angeles',
  'America/New_York'
];

export default function TimeZoneInput({ value, onChange, label = 'Fuso orario' }: TimeZoneInputProps) {
  const listId = useId();
  return (
    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
      <span className="mb-1 block uppercase tracking-wider">{label}</span>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="es. Europe/Rome"
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#FF6B5F] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />
      <datalist id={listId}>
        {COMMON_TIME_ZONES.map((timeZone) => <option key={timeZone} value={timeZone} />)}
      </datalist>
      <span className="mt-1 block text-[10px] font-medium normal-case text-slate-400">
        Necessario per i promemoria. Se manca, nessun orario viene dedotto.
      </span>
    </label>
  );
}
