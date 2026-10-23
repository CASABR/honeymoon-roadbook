import React, { useState, useEffect, useRef, useCallback } from 'react';
import { searchPlacesCombined, preloadLocalPlaces, type PlaceSuggestion } from '../../services/photonService';

interface PlaceAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectPlace: (place: PlaceSuggestion) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
}

export default function PlaceAutocompleteInput({
  value,
  onChange,
  onSelectPlace,
  placeholder = 'Cerca un luogo o digita...',
  label,
  required = false,
  className = '',
  inputClassName = '',
  disabled = false,
  autoFocus = false,
  id
}: PlaceAutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  // Precarica in memoria gli elementi del viaggio IndexedDB all'apertura del form (zero lag alla digitazione)
  useEffect(() => {
    preloadLocalPlaces().catch(() => {});
  }, []);

  // Chiusura al click esterno e pulizia su smontaggio
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (activeAbortControllerRef.current) activeAbortControllerRef.current.abort();
    };
  }, []);

  // Esecuzione ricerca con debounce rigoroso di 300ms e cancellazione richieste pendenti
  const triggerSearch = useCallback((text: string) => {
    // 1. Cancella timer di debounce precedente
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // 2. Annulla immediatamente qualsiasi fetch HTTP in corso
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    const q = text.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setIsLoading(false);
      setIsOpen(false);
      return;
    }

    // NON chiamiamo setIsLoading(true) prima del timeout per mantenere la digitazione a 60 fps
    debounceTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      activeAbortControllerRef.current = controller;
      setIsLoading(true);

      try {
        const results = await searchPlacesCombined(q, 5, controller.signal);
        console.log('[Photon Debug Input]', q, results);
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setIsOpen(results.length > 0);
          setHighlightedIndex(-1);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && !controller.signal.aborted) {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 300);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    triggerSearch(val);
  };

  const handleSelect = (place: PlaceSuggestion) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    onChange(place.title);
    onSelectPlace(place);
    setIsOpen(false);
    setSuggestions([]);
    setIsLoading(false);
  };

  const handleClear = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
    setIsLoading(false);
    if (inputRef.current) inputRef.current.focus();
  };

  // Navigazione tastiera (frecce Su/Giù, Invio, Escape)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const localSuggestions = suggestions.filter(s => s.source === 'local');
  const photonSuggestions = suggestions.filter(s => s.source === 'photon');

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.trim().length >= 3 && suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          className={`w-full h-11 pl-3.5 pr-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-[#FF6B5F] dark:focus:border-[#FF6B5F] transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 ${inputClassName}`}
        />

        {/* Indicatore di caricamento o pulsante cancella */}
        <div className="absolute right-3 flex items-center gap-1.5 text-slate-400">
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          ) : value ? (
            <button
              type="button"
              onClick={handleClear}
              tabIndex={-1}
              className="w-4 h-4 rounded-full flex items-center justify-center text-xs hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
              title="Cancella"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {/* Dropdown dei Suggerimenti Autocomplete */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-72 overflow-y-auto p-1.5 space-y-1 animate-fade-in divide-y divide-slate-100 dark:divide-slate-800">
          {/* 1. SEZIONE ELEMENTI NEL VIAGGIO (Prioritari) */}
          {localSuggestions.length > 0 && (
            <div className="pt-1 first:pt-0">
              <div className="px-2.5 py-1 flex items-center gap-1 text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                <span>📌</span>
                <span>Nel tuo viaggio ({localSuggestions.length})</span>
              </div>
              <div className="space-y-0.5 mt-0.5">
                {localSuggestions.map((item, idx) => {
                  const globalIdx = idx;
                  const isHighlighted = highlightedIndex === globalIdx;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setHighlightedIndex(globalIdx)}
                      className={`w-full text-left px-3 py-2 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 ${
                        isHighlighted
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      <span className="text-base mt-0.5 shrink-0">
                        {item.category === 'alloggio'
                          ? '🏨'
                          : item.category === 'ristorante'
                          ? '🍽️'
                          : item.category === 'tappa'
                          ? '📍'
                          : item.category === 'shopping'
                          ? '🛍️'
                          : '🎟️'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold">
                            Già nel viaggio
                          </span>
                        </div>
                        {item.address && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {item.address}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. SEZIONE LUOGHI GLOBALI (Photon / OpenStreetMap) */}
          {photonSuggestions.length > 0 && (
            <div className="pt-1.5">
              <div className="px-2.5 py-1 flex items-center justify-between text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <span>📍</span>
                  <span>Luoghi nel mondo (OpenStreetMap)</span>
                </span>
                <span className="text-[9px] font-normal lowercase opacity-75">photon.komoot.io</span>
              </div>
              <div className="space-y-0.5 mt-0.5">
                {photonSuggestions.map((item, idx) => {
                  const globalIdx = localSuggestions.length + idx;
                  const isHighlighted = highlightedIndex === globalIdx;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setHighlightedIndex(globalIdx)}
                      className={`w-full text-left px-3 py-2 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 ${
                        isHighlighted
                          ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      <span className="text-base mt-0.5 shrink-0 text-amber-500">
                        🗺️
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {item.subtitle || item.address}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
