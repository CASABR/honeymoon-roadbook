import { useState, useEffect } from 'react';
import {
  searchDestinations,
  checkEntityDuplicate,
  buildFieldComparisons,
  type DestinationSearchResult,
  type DuplicateCheckResult,
  type EntityFieldComparison
} from '../../services/destinationSearchService';
import type { Coordinate } from '../../types';

interface DestinationSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'tappa' | 'alloggio' | 'attivita' | 'ristorante';
  initialQuery?: string;
  currentValues: {
    name?: string;
    address?: string;
    location?: string;
    coordinate?: Coordinate;
    notes?: string;
  };
  onApply: (appliedFields: {
    name?: string;
    address?: string;
    location?: string;
    coordinate?: Coordinate;
  }) => void;
}

export default function DestinationSearchModal({
  isOpen,
  onClose,
  entityType,
  initialQuery = '',
  currentValues,
  onApply
}: DestinationSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<DestinationSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selezione e confronto
  const [selectedResult, setSelectedResult] = useState<DestinationSearchResult | null>(null);
  const [duplicateStatus, setDuplicateStatus] = useState<DuplicateCheckResult | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  // Campi di merge
  const [comparisons, setComparisons] = useState<EntityFieldComparison[]>([]);

  // Ricerca automatica con debounce se presente query iniziale
  useEffect(() => {
    if (isOpen && initialQuery && initialQuery.length >= 2) {
      setQuery(initialQuery);
      performSearch(initialQuery);
    } else if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedResult(null);
      setDuplicateStatus(null);
      setComparisons([]);
    }
  }, [isOpen, initialQuery]);

  const performSearch = async (text: string) => {
    if (!text.trim() || text.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await searchDestinations(text);
      setResults(res);
      if (res.length === 0) {
        setSearchError('Nessun risultato trovato. Prova con una ricerca più specifica.');
      }
    } catch (err: any) {
      setSearchError('Errore durante la ricerca. Verifica la connessione di rete.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = async (item: DestinationSearchResult) => {
    setSelectedResult(item);
    setIsCheckingDuplicate(true);

    // 1. Verifica duplicati nel viaggio
    const dupCheck = await checkEntityDuplicate(entityType, {
      name: item.name,
      coordinate: item.coordinate,
      address: item.formattedAddress
    });
    setDuplicateStatus(dupCheck);
    setIsCheckingDuplicate(false);

    // 2. Prepara confronto campi con preservazione dei valori esistenti
    const proposed: Record<string, string | undefined> = {
      name: item.name,
      address: item.formattedAddress,
      location: item.city || item.country || item.name
    };

    const current: Record<string, string | undefined> = {
      name: currentValues.name,
      address: currentValues.address,
      location: currentValues.location
    };

    const labels: Record<string, string> = {
      name: entityType === 'alloggio' ? 'Nome Struttura' : 'Titolo / Meta',
      address: 'Indirizzo Completo',
      location: 'Città / Località'
    };

    const comps = buildFieldComparisons(current, proposed, labels);
    setComparisons(comps);
  };

  const toggleFieldUpdate = (fieldName: string) => {
    setComparisons(prev =>
      prev.map(c => (c.fieldName === fieldName ? { ...c, willUpdate: !c.willUpdate } : c))
    );
  };

  const handleConfirmApply = () => {
    if (!selectedResult) return;

    const applied: {
      name?: string;
      address?: string;
      location?: string;
      coordinate?: Coordinate;
    } = {
      coordinate: selectedResult.coordinate
    };

    for (const comp of comparisons) {
      if (comp.willUpdate && comp.proposedValue) {
        if (comp.fieldName === 'name') applied.name = comp.proposedValue;
        if (comp.fieldName === 'address') applied.address = comp.proposedValue;
        if (comp.fieldName === 'location') applied.location = comp.proposedValue;
      }
    }

    onApply(applied);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌍</span>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                Ricerca Meta & Auto-Compilazione
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Fonti gratuite aperte (OpenStreetMap) • Zero costi API
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
          >
            ✕
          </button>
        </div>

        {/* Input Ricerca */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <form
            onSubmit={e => {
              e.preventDefault();
              performSearch(query);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cerca città, attrazione, hotel o indirizzo..."
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={isSearching || query.trim().length < 2}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSearching ? '⏳ Cerca...' : '🔍 Cerca'}
            </button>
          </form>
        </div>

        {/* Contenuto Principale Scrollabile */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Errore o Stato Vuoto */}
          {searchError && (
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300">
              {searchError}
            </div>
          )}

          {/* Elenco Risultati */}
          {!selectedResult && results.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                Risultati Trovati ({results.length}):
              </span>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                {results.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectResult(item)}
                    className="w-full text-left p-3 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 transition-colors flex items-start gap-2.5 cursor-pointer"
                  >
                    <span className="text-base mt-0.5">
                      {item.source.startsWith('local') ? '📌' : '📍'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                          {item.name}
                        </span>
                        {item.category && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {item.category}
                          </span>
                        )}
                        {item.source.startsWith('local') && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">
                            Nel Viaggio
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {item.formattedAddress}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dettaglio Selezione e Confronto Campi */}
          {selectedResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-900/60">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📍</span>
                  <div>
                    <h4 className="font-extrabold text-xs text-indigo-950 dark:text-indigo-200">
                      {selectedResult.name}
                    </h4>
                    <span className="text-[10px] text-indigo-700 dark:text-indigo-300">
                      Coord: {selectedResult.coordinate.lat.toFixed(5)}, {selectedResult.coordinate.lng.toFixed(5)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedResult(null)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                >
                  Cambia
                </button>
              </div>

              {/* Avviso Anti-Duplicazione */}
              {isCheckingDuplicate ? (
                <div className="text-xs text-slate-400 py-1">Verifica duplicati nel viaggio in corso...</div>
              ) : duplicateStatus?.hasDuplicate ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-2xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <span className="text-base shrink-0">⚠️</span>
                  <div>
                    <p className="font-extrabold">Possibile Elemento Già Presente nel Viaggio</p>
                    <p className="text-[11px] mt-0.5 text-amber-800 dark:text-amber-300">
                      {duplicateStatus.similarityReason}. Puoi comunque aggiornare i campi vuoti preservando le tue note.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <span>✓</span>
                  <span>Nessun duplicato rilevato nel tuo itinerario. Nuovo luogo confermato.</span>
                </div>
              )}

              {/* Tabella Confronto Campi Prima / Dopo */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                  Anteprima Campi e Protezione Dati Esistenti:
                </span>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden text-xs">
                  {comparisons.map(comp => (
                    <div
                      key={comp.fieldName}
                      onClick={() => toggleFieldUpdate(comp.fieldName)}
                      className={`p-3 flex items-start justify-between gap-3 cursor-pointer transition-colors ${
                        comp.willUpdate
                          ? 'bg-emerald-50/30 dark:bg-emerald-950/20'
                          : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-[11px] text-slate-500 block mb-0.5">
                          {comp.label}
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="text-slate-600 dark:text-slate-400">
                            <span className="text-[10px] text-slate-400 block font-semibold">Attuale:</span>
                            <span className="italic">{comp.currentValue || '(vuoto)'}</span>
                          </div>
                          <div className={comp.willUpdate ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-400'}>
                            <span className="text-[10px] text-slate-400 block font-semibold">Proposto:</span>
                            <span>{comp.proposedValue || '(non disponibile)'}</span>
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={comp.willUpdate}
                        onChange={() => toggleFieldUpdate(comp.fieldName)}
                        className="mt-1 accent-indigo-600 w-4 h-4 cursor-pointer"
                        title={comp.willUpdate ? 'Aggiorna questo campo' : 'Mantieni valore attuale'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Azioni */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={!selectedResult}
            onClick={handleConfirmApply}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-40 cursor-pointer"
          >
            Applica al Modulo
          </button>
        </div>
      </div>
    </div>
  );
}
