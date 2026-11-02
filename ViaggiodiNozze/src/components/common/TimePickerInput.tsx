import type { ChangeEvent, Ref } from 'react';

const TIME_OPTIONS = Array.from({ length: 24 * 12 }, (_, index) => {
  const hours = Math.floor(index / 12).toString().padStart(2, '0');
  const minutes = ((index % 12) * 5).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
});

interface TimePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export default function TimePickerInput({ value, onChange, id, required, disabled, ariaLabel = 'Orario', className = '', inputRef }: TimePickerInputProps) {
  const selectedOption = TIME_OPTIONS.includes(value) ? value : '';
  return (
    <div className={`flex min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 focus-within:border-[#FF6B5F] focus-within:ring-2 focus-within:ring-[#FF6B5F]/15 ${disabled ? 'opacity-50' : ''} ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="HH:mm"
        pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
        maxLength={5}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none dark:text-slate-100"
      />
      <select
        value={selectedOption}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          if (event.target.value) onChange(event.target.value);
        }}
        disabled={disabled}
        aria-label={`${ariaLabel}: scegli a intervalli di 5 minuti`}
        className="h-11 w-[5.25rem] shrink-0 border-0 border-l border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <option value="">5 min</option>
        {TIME_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

interface DateTimePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  dateLabel?: string;
  timeLabel?: string;
}

export function DateTimePickerInput({ value, onChange, required, dateLabel = 'Data', timeLabel = 'Orario' }: DateTimePickerInputProps) {
  const [date = '', time = ''] = value.split('T');
  const update = (nextDate: string, nextTime: string) => onChange(nextDate || nextTime ? `${nextDate}T${nextTime}` : '');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
      <input
        type="date"
        value={date}
        onChange={(event) => update(event.target.value, time)}
        required={required}
        aria-label={dateLabel}
        className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#FF6B5F] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <TimePickerInput value={time} onChange={(nextTime) => update(date, nextTime)} required={required} ariaLabel={timeLabel} />
    </div>
  );
}
