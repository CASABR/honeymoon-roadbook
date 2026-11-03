import React, { useState, useRef, type Ref } from 'react';
import TwoWheelTimePicker from './TwoWheelTimePicker';

export function formatTimeInputValue(raw: string, isBackspaceKey = false): string {
  const normalized = raw.replace(/\./g, ':');
  const clean = normalized.replace(/[^\d:]/g, '');

  if (!clean) return '';

  if (clean.includes(':')) {
    const parts = clean.split(':');
    let h = parts[0].slice(0, 2);
    let m = parts.slice(1).join('').slice(0, 2);

    if (h.length === 2) {
      const hNum = parseInt(h, 10);
      if (hNum > 23) h = '23';
    }

    if (m.length > 0) {
      const m0 = parseInt(m[0], 10);
      if (m0 > 5) {
        m = '5' + (m[1] || '');
      }
      if (m.length === 2) {
        const mNum = parseInt(m, 10);
        if (mNum > 59) m = '59';
      }
    }

    return `${h}:${m}`;
  }

  const digits = clean.replace(/\D/g, '').slice(0, 4);

  if (digits.length === 0) return '';
  if (digits.length === 1) return digits;

  if (digits.length === 2) {
    let h = digits;
    const hNum = parseInt(h, 10);
    if (hNum > 23) h = '23';
    return isBackspaceKey ? h : `${h}:`;
  }

  if (digits.length === 3) {
    let h = digits.slice(0, 2);
    if (parseInt(h, 10) > 23) h = '23';
    let m0 = digits[2];
    if (parseInt(m0, 10) > 5) m0 = '5';
    return `${h}:${m0}`;
  }

  let h = digits.slice(0, 2);
  let m = digits.slice(2, 4);
  if (parseInt(h, 10) > 23) h = '23';
  if (parseInt(m, 10) > 59) m = '59';
  return `${h}:${m}`;
}

export function parseAndFormatPastedTime(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (trimmed.includes(':') || trimmed.includes('.')) {
    const sep = trimmed.includes(':') ? ':' : '.';
    const parts = trimmed.split(sep);
    if (parts.length >= 2) {
      const hStr = parts[0].trim();
      const mStr = parts[1].trim().slice(0, 2);
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
  }

  if (digitsOnly.length === 4) {
    const h = parseInt(digitsOnly.slice(0, 2), 10);
    const m = parseInt(digitsOnly.slice(2, 4), 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  if (digitsOnly.length === 3) {
    const h = parseInt(digitsOnly.slice(0, 1), 10);
    const m = parseInt(digitsOnly.slice(1, 3), 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  return null;
}

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

export default function TimePickerInput({
  value,
  onChange,
  id,
  required,
  disabled,
  ariaLabel = 'Orario',
  className = '',
  inputRef
}: TimePickerInputProps) {
  const [isWheelPickerOpen, setIsWheelPickerOpen] = useState(false);
  const internalRef = useRef<HTMLInputElement | null>(null);

  const setMergedRef = (el: HTMLInputElement | null) => {
    internalRef.current = el;
    if (typeof inputRef === 'function') {
      inputRef(el);
    } else if (inputRef && typeof inputRef === 'object') {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const input = e.currentTarget;
      const { selectionStart, selectionEnd } = input;
      // Se il cursore è subito dopo i due punti ("15:|"), rimuove ':' e la cifra precedente
      if (selectionStart === selectionEnd && selectionStart === 3 && value.charAt(2) === ':') {
        e.preventDefault();
        const nextVal = value.slice(0, 1);
        onChange(nextVal);
        requestAnimationFrame(() => {
          if (internalRef.current) {
            internalRef.current.setSelectionRange(1, 1);
          }
        });
      }
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const formatted = formatTimeInputValue(raw);
    onChange(formatted);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    const formatted = parseAndFormatPastedTime(pastedText);
    if (formatted) {
      e.preventDefault();
      onChange(formatted);
    }
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const raw = event.target.value.trim();
    if (!raw) return;
    const formatted = formatTimeInputValue(raw);
    if (formatted && formatted !== raw) {
      onChange(formatted);
    }
  };

  return (
    <>
      <div className={`flex min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 focus-within:border-[#FF6B5F] focus-within:ring-2 focus-within:ring-[#FF6B5F]/15 ${disabled ? 'opacity-50' : ''} ${className}`}>
        <input
          ref={setMergedRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onKeyDown={handleKeyDown}
          onChange={handleChange}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder="HH:mm"
          pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
          maxLength={5}
          required={required}
          disabled={disabled}
          aria-label={ariaLabel}
          className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none dark:text-slate-100 font-medium"
        />
        <button
          type="button"
          onClick={() => setIsWheelPickerOpen(true)}
          disabled={disabled}
          aria-label="Scegli orario"
          title="Scegli orario"
          className="h-11 px-3 shrink-0 border-0 border-l border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span aria-hidden="true">⏰</span>
          <span className="hidden sm:inline font-semibold">Scegli orario</span>
        </button>
      </div>

      <TwoWheelTimePicker
        value={value}
        onChange={onChange}
        isOpen={isWheelPickerOpen}
        onClose={() => setIsWheelPickerOpen(false)}
        title={ariaLabel}
      />
    </>
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
