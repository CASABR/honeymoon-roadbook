import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { formatTimeInputValue } from './TimePickerInput';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_5 = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

const ITEM_HEIGHT = 40; // px
const VISIBLE_ITEMS = 5;
const PADDING_ITEMS = Math.floor(VISIBLE_ITEMS / 2); // 2 sopra e 2 sotto per centrare

interface TwoWheelTimePickerProps {
  value: string; // formato "HH:mm" oppure stringa vuota
  onChange: (time: string) => void;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export default function TwoWheelTimePicker({
  value,
  onChange,
  isOpen,
  onClose,
  title = 'Seleziona Orario'
}: TwoWheelTimePickerProps) {
  // Parsing iniziale orario esistente
  const parseTime = useCallback((timeStr: string) => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());
    if (match) {
      return { h: match[1], m: match[2] };
    }
    // Default orario corrente o 12:00
    const now = new Date();
    const curH = String(now.getHours()).padStart(2, '0');
    const nearestMin = Math.round(now.getMinutes() / 5) * 5 % 60;
    const curM = String(nearestMin).padStart(2, '0');
    return { h: curH, m: curM };
  }, []);

  const [selectedHour, setSelectedHour] = useState('12');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState(false);

  const hoursWheelRef = useRef<HTMLDivElement>(null);
  const minutesWheelRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);

  // Inizializza quando si apre
  useEffect(() => {
    if (isOpen) {
      const { h, m } = parseTime(value || '12:00');
      setSelectedHour(h);
      setSelectedMinute(m);
      setManualInput(value || `${h}:${m}`);
      setManualError(false);

      // Scorri le rotelle al valore selezionato dopo il rendering
      setTimeout(() => {
        isScrollingProgrammatically.current = true;
        const hIdx = HOURS.indexOf(h);
        if (hoursWheelRef.current && hIdx !== -1) {
          hoursWheelRef.current.scrollTop = hIdx * ITEM_HEIGHT;
        }

        // Se il minuto è multiplo di 5, centra la rotella, altrimenti posiziona sul più vicino
        const mNum = parseInt(m, 10);
        const nearest5 = Math.round(mNum / 5) * 5 % 60;
        const mStr5 = String(nearest5).padStart(2, '0');
        const mIdx = MINUTES_5.indexOf(mStr5);
        if (minutesWheelRef.current && mIdx !== -1) {
          minutesWheelRef.current.scrollTop = mIdx * ITEM_HEIGHT;
        }
        setTimeout(() => {
          isScrollingProgrammatically.current = false;
        }, 150);
      }, 50);
    }
  }, [isOpen, value, parseTime]);

  // Gestione scorrimento rotella Ore
  const handleHoursScroll = () => {
    if (isScrollingProgrammatically.current || !hoursWheelRef.current) return;
    const scrollTop = hoursWheelRef.current.scrollTop;
    const index = Math.round(scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(HOURS.length - 1, index));
    const newH = HOURS[clamped];
    if (newH !== selectedHour) {
      setSelectedHour(newH);
      setManualInput(`${newH}:${selectedMinute}`);
      setManualError(false);
    }
  };

  // Gestione scorrimento rotella Minuti
  const handleMinutesScroll = () => {
    if (isScrollingProgrammatically.current || !minutesWheelRef.current) return;
    const scrollTop = minutesWheelRef.current.scrollTop;
    const index = Math.round(scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(MINUTES_5.length - 1, index));
    const newM = MINUTES_5[clamped];
    if (newM !== selectedMinute) {
      setSelectedMinute(newM);
      setManualInput(`${selectedHour}:${newM}`);
      setManualError(false);
    }
  };

  // Click diretto su un'ora
  const handleSelectHour = (h: string, idx: number) => {
    setSelectedHour(h);
    setManualInput(`${h}:${selectedMinute}`);
    setManualError(false);
    if (hoursWheelRef.current) {
      hoursWheelRef.current.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
    }
  };

  // Click diretto su un minuto
  const handleSelectMinute = (m: string, idx: number) => {
    setSelectedMinute(m);
    setManualInput(`${selectedHour}:${m}`);
    setManualError(false);
    if (minutesWheelRef.current) {
      minutesWheelRef.current.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
    }
  };

  // Gestione digitazione manuale diretta HH:mm con auto-formattazione (es. 1530 -> 15:30)
  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatTimeInputValue(raw);
    setManualInput(formatted);
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(formatted);
    if (match) {
      setManualError(false);
      const h = match[1];
      const m = match[2];
      setSelectedHour(h);
      setSelectedMinute(m);

      // Centra le rotelle se corrispondono
      isScrollingProgrammatically.current = true;
      const hIdx = HOURS.indexOf(h);
      if (hoursWheelRef.current && hIdx !== -1) {
        hoursWheelRef.current.scrollTop = hIdx * ITEM_HEIGHT;
      }
      const mIdx = MINUTES_5.indexOf(m);
      if (minutesWheelRef.current && mIdx !== -1) {
        minutesWheelRef.current.scrollTop = mIdx * ITEM_HEIGHT;
      }
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 120);
    } else {
      setManualError(formatted.length === 5);
    }
  };

  const handleConfirm = () => {
    // Se la digitazione manuale è valida, usa quella (per preservare anche orari non multipli di 5 come 14:12)
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(manualInput.trim());
    if (match) {
      onChange(manualInput.trim());
    } else {
      onChange(`${selectedHour}:${selectedMinute}`);
    }
    onClose();
  };

  // Supporto scorciatoia tastiera ESC e Enter
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') handleConfirm();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedHour, selectedMinute, manualInput]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="two-wheel-timepicker-portal fixed inset-0 z-[100001] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#172033] border border-slate-200 dark:border-slate-800 shadow-2xl p-5 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Intestazione */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-[#172033] dark:text-white flex items-center gap-2">
              <span>⏰</span>
              <span>{title}</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Seleziona ore e minuti o digita direttamente l'orario
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        {/* Input Manuale Veloce HH:mm */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
            Digitazione rapida:
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={manualInput}
              onChange={handleManualInputChange}
              maxLength={5}
              placeholder="HH:mm"
              className={`w-20 px-2.5 py-1 text-center font-mono font-bold text-sm rounded-xl border outline-none transition-colors ${
                manualError
                  ? 'border-rose-400 text-rose-600 bg-rose-50 dark:bg-rose-950/40'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#172033] dark:text-white focus:border-[#FF6B5F]'
              }`}
            />
          </div>
        </div>

        {/* Rotelle Touch Indipendenti (Ore 00-23, Minuti 00-55 con Snap) */}
        <div className="relative flex items-center justify-center gap-4 py-2 select-none">
          {/* Lente di ingrandimento / Barra evidenziata centrale */}
          <div
            className="absolute left-6 right-6 pointer-events-none rounded-2xl border-y-2 border-[#FF6B5F]/40 bg-[#FF6B5F]/10 dark:bg-[#FF6B5F]/15"
            style={{
              height: `${ITEM_HEIGHT}px`,
              top: `${PADDING_ITEMS * ITEM_HEIGHT + 8}px`
            }}
          />

          {/* Separatore : tra le due rotelle */}
          <div
            className="absolute z-10 pointer-events-none font-mono text-2xl font-black text-[#FF6B5F]"
            style={{ top: `${PADDING_ITEMS * ITEM_HEIGHT + 12}px` }}
          >
            :
          </div>

          {/* Rotella 1: ORE (00-23) */}
          <div className="flex flex-col items-center flex-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Ore
            </span>
            <div
              ref={hoursWheelRef}
              onScroll={handleHoursScroll}
              style={{
                height: `${VISIBLE_ITEMS * ITEM_HEIGHT}px`,
                scrollSnapType: 'y mandatory'
              }}
              className="w-full overflow-y-auto no-scrollbar scroll-smooth relative"
            >
              {/* Padding superiore per centrare il primo elemento */}
              <div style={{ height: `${PADDING_ITEMS * ITEM_HEIGHT}px` }} />

              {HOURS.map((hour, idx) => {
                const isSelected = hour === selectedHour;
                return (
                  <div
                    key={hour}
                    onClick={() => handleSelectHour(hour, idx)}
                    style={{
                      height: `${ITEM_HEIGHT}px`,
                      scrollSnapAlign: 'center'
                    }}
                    className={`flex items-center justify-center font-mono cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? 'text-2xl font-black text-[#172033] dark:text-white scale-110'
                        : 'text-base font-semibold text-slate-400 dark:text-slate-500 opacity-40 hover:opacity-75'
                    }`}
                  >
                    {hour}
                  </div>
                );
              })}

              {/* Padding inferiore per centrare l'ultimo elemento */}
              <div style={{ height: `${PADDING_ITEMS * ITEM_HEIGHT}px` }} />
            </div>
          </div>

          {/* Rotella 2: MINUTI (intervalli 5 min: 00-55) */}
          <div className="flex flex-col items-center flex-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Minuti
            </span>
            <div
              ref={minutesWheelRef}
              onScroll={handleMinutesScroll}
              style={{
                height: `${VISIBLE_ITEMS * ITEM_HEIGHT}px`,
                scrollSnapType: 'y mandatory'
              }}
              className="w-full overflow-y-auto no-scrollbar scroll-smooth relative"
            >
              {/* Padding superiore */}
              <div style={{ height: `${PADDING_ITEMS * ITEM_HEIGHT}px` }} />

              {MINUTES_5.map((min, idx) => {
                const isSelected = min === selectedMinute;
                return (
                  <div
                    key={min}
                    onClick={() => handleSelectMinute(min, idx)}
                    style={{
                      height: `${ITEM_HEIGHT}px`,
                      scrollSnapAlign: 'center'
                    }}
                    className={`flex items-center justify-center font-mono cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? 'text-2xl font-black text-[#172033] dark:text-white scale-110'
                        : 'text-base font-semibold text-slate-400 dark:text-slate-500 opacity-40 hover:opacity-75'
                    }`}
                  >
                    {min}
                  </div>
                );
              })}

              {/* Padding inferiore */}
              <div style={{ height: `${PADDING_ITEMS * ITEM_HEIGHT}px` }} />
            </div>
          </div>
        </div>

        {/* Pulsanti Conferma / Annulla */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-2xl bg-[#FF6B5F] hover:bg-[#e05b50] text-white font-extrabold text-xs shadow-md shadow-[#FF6B5F]/20 transition-all active:scale-95 cursor-pointer"
          >
            Conferma Orario
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
