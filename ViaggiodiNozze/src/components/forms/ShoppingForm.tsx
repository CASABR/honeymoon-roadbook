import CurrencyAmountInput from '../common/CurrencyAmountInput';
import React, { useState, useEffect, useRef, useMemo, useCallback, useImperativeHandle } from 'react';
import { usePresence } from '../../hooks/usePresence';
import type { Shopping, TimeStatus } from '../../types';
import { extractFromText } from '../../services/aiExtractor';
import TimePickerInput from '../common/TimePickerInput';
import { useCardAutoSave, type AutoSaveSyncStatus } from '../../hooks/useCardAutoSave';
import {
  buildShoppingFormInitialState,
  buildShoppingSavePayload,
  serializeShoppingDraftFingerprint,
  SHOPPING_SUBCATEGORIES,
  validateShoppingDraft,
  type CachedMoneyPatch,
  type ShoppingSavePayload
} from '../../utils/shoppingSave';

export interface ShoppingFormHandle {
  requestClose: () => Promise<boolean>;
}

interface ShoppingFormProps {
  initialData?: Shopping | null;
  defaultDate?: string;
  defaultTime?: string;
  onSave: (data: ShoppingSavePayload) => void;
  onAutoSave?: (data: ShoppingSavePayload) => Promise<Shopping | void>;
  onAutoSaveCompleteClose?: () => void;
  onDiscardInvalidClose?: () => void;
  formActionsRef?: React.Ref<ShoppingFormHandle>;
  onCancel: () => void;
}

const AUTO_SAVE_STATUS_LABELS: Record<AutoSaveSyncStatus, { text: string; tone: string } | null> = {
  idle: { text: 'Autosalvataggio attivo', tone: 'text-slate-400' },
  pending: { text: 'Modifiche in sospeso...', tone: 'text-amber-600' },
  invalid: { text: 'Completa il nome obbligatorio per salvare', tone: 'text-rose-600' },
  saving_local: { text: 'Salvataggio sul dispositivo...', tone: 'text-slate-500' },
  saved_local_offline: { text: 'Salvato in locale · in attesa di sync', tone: 'text-amber-700' },
  syncing_cloud: { text: 'Salvato in locale · sincronizzazione cloud...', tone: 'text-sky-700' },
  synced: { text: '✓ Sincronizzato', tone: 'text-emerald-700' },
  error: { text: 'Errore salvataggio locale · usa Aggiorna Shopping', tone: 'text-rose-600' },
  conflict: { text: 'Conflitto cloud rilevato · verifica nella diagnostica', tone: 'text-amber-700' },
};

export default function ShoppingForm({
  initialData,
  defaultDate,
  defaultTime,
  onSave,
  onAutoSave,
  onAutoSaveCompleteClose,
  onDiscardInvalidClose,
  formActionsRef,
  onCancel
}: ShoppingFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);
  const initialDraft = useMemo(
    () => buildShoppingFormInitialState(initialData, defaultDate, defaultTime),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialData?.id, defaultDate, defaultTime]
  );

  const [sottocategoria, setSottocategoria] = useState(initialDraft.sottocategoria);
  const [nome, setNome] = useState(initialDraft.nome);
  const [scopo, setScopo] = useState(initialDraft.scopo);
  const [data, setData] = useState(initialDraft.data);
  const [orario, setOrario] = useState(initialDraft.orario);
  const [timeStatus, setTimeStatus] = useState<TimeStatus>(initialDraft.timeStatus);
  const [indirizzo, setIndirizzo] = useState(initialDraft.indirizzo);
  const [budget, setBudget] = useState(initialDraft.budget);
  const [link, setLink] = useState(initialDraft.link);
  const [noteCopilota, setNoteCopilota] = useState(initialDraft.noteCopilota);
  const [copilota, setCopilota] = useState(initialDraft.copilota);

  const [error, setError] = useState('');
  const [showInvalidCloseActions, setShowInvalidCloseActions] = useState(false);

  // AI State
  const [showAiBox, setShowAiBox] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const SOTTOCATEGORIE = SHOPPING_SUBCATEGORIES;

  const initializedIdRef = useRef<string | null | undefined>(initialData?.id || '__new__');
  const latestInitialDataRef = useRef<Shopping | null | undefined>(initialData);
  latestInitialDataRef.current = initialData;
  const cachedMoneyRef = useRef<CachedMoneyPatch | null>(null);

  useEffect(() => {
    const currentId = initialData?.id || '__new__';
    if (initializedIdRef.current === currentId) {
      return;
    }
    initializedIdRef.current = currentId;
    cachedMoneyRef.current = null;
    const nextDraft = buildShoppingFormInitialState(initialData, defaultDate, defaultTime);
    setSottocategoria(nextDraft.sottocategoria);
    setNome(nextDraft.nome);
    setScopo(nextDraft.scopo);
    setData(nextDraft.data);
    setOrario(nextDraft.orario);
    setTimeStatus(nextDraft.timeStatus);
    setIndirizzo(nextDraft.indirizzo);
    setBudget(nextDraft.budget);
    setLink(nextDraft.link);
    setNoteCopilota(nextDraft.noteCopilota);
    setCopilota(nextDraft.copilota);
    setError('');
    setShowInvalidCloseActions(false);
  }, [defaultDate, defaultTime, initialData]);

  const isAutoSaveEnabled = Boolean(initialData?.id && onAutoSave);
  const currentDraft = useMemo(
    () => ({
      sottocategoria,
      nome,
      scopo,
      data,
      orario,
      timeStatus,
      indirizzo,
      budget,
      link,
      noteCopilota,
      copilota,
    }),
    [sottocategoria, nome, scopo, data, orario, timeStatus, indirizzo, budget, link, noteCopilota, copilota]
  );
  const draftFingerprint = useMemo(
    () => serializeShoppingDraftFingerprint(currentDraft),
    [currentDraft]
  );
  const baselineFingerprint = useMemo(
    () => serializeShoppingDraftFingerprint(initialDraft),
    [initialDraft]
  );
  const validationError = useMemo(
    () => validateShoppingDraft(currentDraft),
    [currentDraft]
  );

  const performAutoSave = useCallback(async (): Promise<boolean> => {
    if (!onAutoSave || !latestInitialDataRef.current?.id) return false;
    const { payload, moneyCache } = await buildShoppingSavePayload({
      draft: currentDraft,
      initialData: latestInitialDataRef.current,
      cachedMoney: cachedMoneyRef.current,
    });
    cachedMoneyRef.current = moneyCache;
    const saved = await onAutoSave(payload);
    if (saved) {
      latestInitialDataRef.current = saved;
    }
    return true;
  }, [currentDraft, onAutoSave]);

  const autoSave = useCardAutoSave({
    enabled: isAutoSaveEnabled,
    entityType: 'shopping',
    entityId: initialData?.id,
    draftFingerprint,
    baselineFingerprint,
    validationError,
    debounceMs: 1000,
    performSave: performAutoSave,
  });

  useEffect(() => {
    if (!validationError && showInvalidCloseActions) {
      setShowInvalidCloseActions(false);
    }
    if (!validationError && error) {
      setError('');
    }
  }, [validationError, showInvalidCloseActions, error]);

  useImperativeHandle(
    formActionsRef,
    () => ({
      requestClose: async () => {
        if (!isAutoSaveEnabled) return true;
        const ok = await autoSave.flushBeforeClose();
        if (!ok && validationError) {
          setError(validationError);
          setShowInvalidCloseActions(true);
        }
        return ok;
      },
    }),
    [autoSave, isAutoSaveEnabled, validationError]
  );

  const handleAiExtraction = async () => {
    if (!aiText.trim()) return;
    setIsExtracting(true);
    setError('');
    
    try {
      const res = await extractFromText(aiText, 'Nuovo inserimento Shopping', 'import');
      if (res.success && res.entityType === 'shopping' && res.data?.type === 'shopping') {
        const d = res.data;
        if (d.nome) setNome(d.nome);
        if (d.indirizzo) setIndirizzo(d.indirizzo);
        if (d.data) setData(d.data);
        if (d.orario) setOrario(d.orario);
        if (d.budget) setBudget(d.budget);
        const extNote = (d as any).noteCopilota || d.nota || (d as any).notes;
        if (extNote) setNoteCopilota(extNote);
        if (d.sottocategoria && (SOTTOCATEGORIE as readonly string[]).includes(d.sottocategoria)) {
          setSottocategoria(d.sottocategoria);
        }
        setShowAiBox(false);
        setAiText('');
      } else {
        setError(res.error || 'Nessun dato shopping riconosciuto. Controlla il testo e riprova.');
      }
    } catch (e) {
      setError('Errore di connessione a Houni AI.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setShowInvalidCloseActions(false);

    if (isAutoSaveEnabled) {
      const ok = await autoSave.flushManualSave();
      if (ok) {
        (onAutoSaveCompleteClose || onCancel)();
      }
      return;
    }

    const { payload, moneyCache } = await buildShoppingSavePayload({
      draft: currentDraft,
      initialData,
      cachedMoney: cachedMoneyRef.current,
    });
    cachedMoneyRef.current = moneyCache;
    onSave(payload);
  };

  return (
    <div className="space-y-4">
      {/* Box AI Concierge */}
      <div className="bg-[#F0FAF9] border border-[#DDF4F5] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-pink-800 font-bold text-sm">
            <span className="text-sm">✨</span>
            Compila con Houni AI
          </div>
          <button
            type="button"
            onClick={() => setShowAiBox(!showAiBox)}
            className="text-xs font-semibold px-3 py-1.5 bg-white border border-pink-200 text-pink-700 rounded-lg hover:bg-pink-100 transition-colors"
          >
            {showAiBox ? 'Chiudi' : 'Incolla Testo'}
          </button>
        </div>
        {showAiBox && (
          <div className="mt-3 animate-fade-in space-y-2">
            <p className="text-xs text-pink-700/80 mb-2">
              Incolla qui note o messaggi. L'AI estrarrà per te nome, indirizzo, budget, ecc.
            </p>
            <textarea
              className="w-full p-3 rounded-xl border border-pink-200 text-sm focus:ring-2 focus:ring-pink-400 focus:border-pink-400 resize-none"
              rows={4}
              placeholder="Es: Domani andiamo da Harrods a Londra verso le 15:00. Dobbiamo comprare tè e biscotti, budget 50€."
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              disabled={isExtracting}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAiExtraction}
                disabled={isExtracting || !aiText.trim()}
                className="flex items-center gap-2 bg-pink-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-pink-500 disabled:opacity-50 transition-colors"
              >
                {isExtracting ? <span className="animate-spin text-sm">⏳</span> : <span className="text-sm">✨</span>}
                Estrai Dati
              </button>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isLockedByOther && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl font-bold flex gap-2 items-center animate-fade-in">
            <span className="text-base animate-pulse">⚠️</span>
            <span>Attenzione: il dispositivo "{lockedBy}" sta già modificando questo elemento in tempo reale. Le tue modifiche potrebbero sovrascriversi.</span>
          </div>
        )}

        {error && (
          <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700 space-y-2">
            <div>{error}</div>
            {showInvalidCloseActions && isAutoSaveEnabled && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    autoSave.resetDirtyToSaved();
                    setShowInvalidCloseActions(false);
                    setError('');
                    (onDiscardInvalidClose || onCancel)();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-rose-700 font-bold hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  Scarta modifiche e chiudi
                </button>
              </div>
            )}
          </div>
        )}

        {/* Categoria */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Sottocategoria
          </label>
          <div className="flex flex-wrap gap-2">
            {SOTTOCATEGORIE.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSottocategoria(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                  sottocategoria === cat 
                    ? 'bg-slate-800 text-white border-slate-800 shadow-md' 
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Nome Negozio / Luogo Shopping */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Negozio / Centro Commerciale / Mercato *
          </label>
          <input
            type="text"
            placeholder="es. Queenstown Mall, Harrods, Conad..."
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors placeholder:text-slate-400"
            required
          />
        </div>
        
        {/* Scopo (Cosa comprare brevemente) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Scopo / Titolo breve
          </label>
          <input
            type="text"
            placeholder="es. Souvenir, Rifornimento, Spesa..."
            value={scopo}
            onChange={(e) => setScopo(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors placeholder:text-slate-400"
          />
        </div>

        {/* Data e Orario */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Data (opzionale)
            </label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Orario (opzionale)
              </label>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setTimeStatus('confermato')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    timeStatus === 'confermato'
                      ? 'bg-white dark:bg-slate-900 text-[#E11D48] dark:text-[#FF6B5F] shadow-xs font-extrabold'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  ✓ Confermato
                </button>
                <button
                  type="button"
                  onClick={() => setTimeStatus('indicativo')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    timeStatus === 'indicativo'
                      ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  ~ Indicativo
                </button>
              </div>
            </div>
            <TimePickerInput value={orario} onChange={setOrario} ariaLabel="Orario shopping" />
          </div>
        </div>

        {/* Indirizzo / Città / Link Maps */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Indirizzo / Città o Link Maps
          </label>
          <input
            type="text"
            placeholder="es. The Rocks, Sydney o link Google Maps"
            value={indirizzo}
            onChange={(e) => setIndirizzo(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors placeholder:text-slate-400"
          />
        </div>

        {/* Budget stimato e Sito / Link */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Budget indicativo e valuta
            </label>
            <CurrencyAmountInput
              type="text"
              placeholder="es. 100"
              value={budget}
              onValueChange={(value) => setBudget(value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors placeholder:text-slate-400"
            uncertain={Boolean((initialData as { currencyUncertain?: boolean } | null | undefined)?.currencyUncertain)} currencyLabel="Valuta budget" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Link / Sito Web
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Note Copilota / Dettagli shopping */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <span>🧭</span> Note per il Copilota (Lista acquisti & Consigli)
          </label>
          <textarea
            rows={3}
            placeholder="es. Miele di Manuka, maglione in lana merino, artigianato locale Maori, souvenir per famiglia..."
            value={noteCopilota}
            onChange={(e) => {
              const val = e.target.value;
              setNoteCopilota(val);
              if (val.trim()) setCopilota(true);
            }}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-slate-100 focus:border-rose-500 placeholder:text-slate-400 resize-none"
          />
        </div>

        {isAutoSaveEnabled && AUTO_SAVE_STATUS_LABELS[autoSave.status] && (
          <div
            data-testid="shopping-autosave-status"
            data-autosave-status={autoSave.status}
            className={`text-[11px] font-semibold text-right pt-1 ${AUTO_SAVE_STATUS_LABELS[autoSave.status]?.tone || 'text-slate-400'}`}
          >
            {autoSave.status === 'error' && autoSave.errorMessage
              ? autoSave.errorMessage
              : AUTO_SAVE_STATUS_LABELS[autoSave.status]?.text}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
          >
            {isAutoSaveEnabled ? 'Chiudi' : 'Annulla'}
          </button>
          <button
            type="submit"
            disabled={autoSave.isSaving}
            className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-rose-500 hover:bg-rose-400 active:scale-95 disabled:opacity-60 text-white shadow-md shadow-rose-500/20 transition-all cursor-pointer"
          >
            {initialData ? 'Aggiorna Shopping' : 'Salva Shopping'}
          </button>
        </div>
      </form>
    </div>
  );
}
