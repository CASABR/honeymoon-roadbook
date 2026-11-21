import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { storageService } from '../../storage/storageService';

const INITIAL_PLATFORMS = [
  'Booking.com', 'Trip.com', 'GetYourGuide', 'Tiqets', 'Klook', 'FareHarbor',
  'TAO Philippines', 'Sito ufficiale / Prenotazione diretta',
];

function platformKey(value: string): string {
  const key = value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const aliases: Record<string, string> = {
    booking: 'bookingcom', trip: 'tripcom',
    sitoufficiale: 'direct', prenotazionediretta: 'direct',
    sitoufficialeprenotazionediretta: 'direct',
  };
  return aliases[key] || key;
}

export function platformSuggestions(values: string[]): string[] {
  const seen = new Set<string>();
  return [...INITIAL_PLATFORMS, ...values].filter(value => {
    const key = platformKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(value => value.trim());
}

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

export default function BookingPlatformInput({ value, onValueChange, ...props }: Props) {
  const [savedPlatforms, setSavedPlatforms] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    let current = true;
    let request = 0;
    const load = async () => {
      const latest = ++request;
      try {
        const activities = await storageService.getActivities();
        if (current && latest === request) {
          setSavedPlatforms(activities.map(item => item.platform || '').filter(Boolean));
        }
      } catch { /* Initial suggestions and free text remain available offline. */ }
    };
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    void load();
    window.addEventListener('roadbook_data_mutated', load);
    window.addEventListener('roadbook_cloud_synced', load);
    window.addEventListener('trip_config_changed', load);
    document.addEventListener('pointerdown', outside);
    return () => {
      current = false;
      window.removeEventListener('roadbook_data_mutated', load);
      window.removeEventListener('roadbook_cloud_synced', load);
      window.removeEventListener('trip_config_changed', load);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);

  const query = value.trim().toLocaleLowerCase();
  const options = platformSuggestions([...savedPlatforms, value]).filter(option =>
    option.toLocaleLowerCase().includes(query) || platformKey(option).includes(platformKey(value)),
  );
  const visible = open && !props.disabled && !props.readOnly;
  const select = (option: string) => {
    onValueChange(option);
    input.current?.focus();
    setOpen(false);
    setActive(-1);
  };

  return (
    <div ref={container} className="relative min-w-0" onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <input {...props} ref={input} value={value} role="combobox" autoComplete="off"
        aria-label={props['aria-label'] || 'Piattaforma di prenotazione'}
        aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? listId : undefined}
        aria-activedescendant={visible && active >= 0 && active < options.length ? `${listId}-${active}` : undefined}
        placeholder="Cerca o scrivi una piattaforma"
        onFocus={event => { setOpen(true); setActive(-1); props.onFocus?.(event); }}
        onChange={event => { onValueChange(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); setActive(-1); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            const next = event.key === 'ArrowDown' ? Math.min(active + 1, options.length - 1) : Math.max(active - 1, 0);
            setActive(next);
            document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
          }
          if (event.key === 'Enter' && visible && active >= 0 && options[active]) {
            event.preventDefault(); select(options[active]);
          }
          props.onKeyDown?.(event);
        }} />
      {visible && options.length > 0 && (
        <div id={listId} role="listbox" aria-label="Piattaforme suggerite"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-52 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {options.map((option, index) => (
            <button key={platformKey(option)} id={`${listId}-${index}`} type="button" role="option"
              aria-selected={index === active} onMouseDown={event => event.preventDefault()}
              onClick={() => select(option)}
              className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-100 ${index === active ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
