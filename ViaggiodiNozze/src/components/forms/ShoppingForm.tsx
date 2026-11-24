import CurrencyAmountInput from '../common/CurrencyAmountInput';
import React, { useState, useEffect, useRef, useMemo, useCallback, useImperativeHandle } from 'react';
import { usePresence } from '../../hooks/usePresence';
import type { Shopping } from '../../types';
import { extractFromText } from '../../services/aiExtractor';
import TimePickerInput from '../common/TimePickerInput';
import FormActionButtons from './FormActionButtons';
import { auth } from '../../firebase';
import { getActiveTripId } from '../../storage/indexedDB';
import { isCloudAuthorized } from '../../utils/useAuthIdentity';
import { hasPendingMutation } from '../../storage/localMutationQueue';
import {
  clearShoppingDraft,
  readShoppingDraft,
  writeShoppingDraft,
  type ShoppingDraftFields,
  type ShoppingDraftScope
} from '../../utils/shoppingLocalDraft';
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
  onSave: (data: ShoppingSavePayload) => Promise<void> | void;
  onAutoSave?: (data: ShoppingSavePayload) => Promise<Shopping | void>;
  onAutoSaveCompleteClose?: () => void;
  onDiscardInvalidClose?: () => void;
  formActionsRef?: React.Ref<ShoppingFormHandle>;
  onCancel: () => void;
  onDelete?: () => void;
}

type ShoppingSaveUiStatus =
  | 'idle'
  | 'bozza_sul_dispositivo'
  | 'bozza_non_salvata'
  | 'saving'
  | 'saved_pending_sync'
  | 'synced';

const SHOPPING_SAVE_LABELS: Record<ShoppingSaveUiStatus, { text: string; tone: string } | null> = {
  idle: null,
  bozza_sul_dispositivo: { text: 'Bozza sul dispositivo', tone: 'text-amber-700' },
  bozza_non_salvata: { text: 'Bozza non salvata: usa Salva', tone: 'text-rose-600' },
  saving: { text: 'Salvataggio in corso', tone: 'text-sky-700' },
  saved_pending_sync: { text: 'Salvato nel viaggio; sincronizzazione da verificare', tone: 'text-amber-700' },
  synced: { text: '✓ Sincronizzato', tone: 'text-emerald-700' },
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
  onCancel,
  onDelete
}: ShoppingFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);
  const tripId = getActiveTripId() || '';
  const editorId = auth.currentUser?.uid || '';
  const canUseLocalDraft = Boolean(tripId && editorId && isCloudAuthorized(tripId));
  const draftEntityId = initialData?.id || `new:${defaultDate || 'draft'}`;
  const sourceUpdatedAt = typeof initialData?.updatedAt === 'number' ? initialData.updatedAt : null;

  const draftScope: ShoppingDraftScope | null = useMemo(
    () => (canUseLocalDraft ? { tripId, editorId, entityId: draftEntityId } : null),
    [canUseLocalDraft, tripId, editorId, draftEntityId]
  );

  const baseDraft: ShoppingDraftFields = useMemo(() => {
    const raw = buildShoppingFormInitialState(initialData, defaultDate, defaultTime);
    return {
      ...raw,
      timeStatus: raw.timeStatus === 'confermato' ? 'confermato' : 'indicativo',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.id, defaultDate, defaultTime]);
  const baselineFingerprint = useMemo(
    () => serializeShoppingDraftFingerprint(baseDraft),
    [baseDraft]
  );

  const initialRecovery = useMemo(() => {
    if (!draftScope) {
      return { fields: baseDraft, hasRestoredDraft: false, conflictFields: null as ShoppingDraftFields | null };
    }
    const stored = readShoppingDraft(draftScope, { sourceUpdatedAt });
    if (!stored) {
      return { fields: baseDraft, hasRestoredDraft: false, conflictFields: null as ShoppingDraftFields | null };
    }
    if (stored.conflict) {
      return { fields: baseDraft, hasRestoredDraft: false, conflictFields: stored.fields };
    }
    if (serializeShoppingDraftFingerprint(stored.fields) !== baselineFingerprint) {
      return { fields: stored.fields, hasRestoredDraft: true, conflictFields: null as ShoppingDraftFields | null };
    }
    return { fields: baseDraft, hasRestoredDraft: false, conflictFields: null as ShoppingDraftFields | null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftScope, initialData?.id, baselineFingerprint]);

  const [sottocategoria, setSottocategoria] = useState(initialRecovery.fields.sottocategoria);
  const [nome, setNome] = useState(initialRecovery.fields.nome);
  const [scopo, setScopo] = useState(initialRecovery.fields.scopo);
  const [data, setData] = useState(initialRecovery.fields.data);
  const [orario, setOrario] = useState(initialRecovery.fields.orario);
  const [timeStatus, setTimeStatus] = useState<'indicativo' | 'confermato'>(initialRecovery.fields.timeStatus);
  const [indirizzo, setIndirizzo] = useState(initialRecovery.fields.indirizzo);
  const [budget, setBudget] = useState(initialRecovery.fields.budget);
  const [link, setLink] = useState(initialRecovery.fields.link);
  const [noteCopilota, setNoteCopilota] = useState(initialRecovery.fields.noteCopilota);
  const [copilota, setCopilota] = useState(initialRecovery.fields.copilota);

  const [pendingConflictDraft, setPendingConflictDraft] = useState<ShoppingDraftFields | null>(
    initialRecovery.conflictFields
  );
  const [error, setError] = useState('');
  const [showInvalidCloseActions, setShowInvalidCloseActions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<ShoppingSaveUiStatus>(() =>
    initialRecovery.hasRestoredDraft ? 'bozza_sul_dispositivo' : 'idle'
  );

  // AI State
  const [showAiBox, setShowAiBox] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const SOTTOCATEGORIE = SHOPPING_SUBCATEGORIES;

  const initializedIdRef = useRef<string | null | undefined>(initialData?.id || '__new__');
  const latestInitialDataRef = useRef<Shopping | null | undefined>(initialData);
  latestInitialDataRef.current = initialData;
  const cachedMoneyRef = useRef<CachedMoneyPatch | null>(null);

  const applyDraftFieldsToState = useCallback((fields: ShoppingDraftFields) => {
    setSottocategoria(fields.sottocategoria);
    setNome(fields.nome);
    setScopo(fields.scopo);
    setData(fields.data);
    setOrario(fields.orario);
    setTimeStatus(fields.timeStatus);
    setIndirizzo(fields.indirizzo);
    setBudget(fields.budget);
    setLink(fields.link);
    setNoteCopilota(fields.noteCopilota);
    setCopilota(fields.copilota);
  }, []);

  useEffect(() => {
    const currentId = initialData?.id || '__new__';
    if (initializedIdRef.current === currentId) {
      return;
    }
    initializedIdRef.current = currentId;
    cachedMoneyRef.current = null;
    const rawNextBase = buildShoppingFormInitialState(initialData, defaultDate, defaultTime);
    const nextBase: ShoppingDraftFields = {
      ...rawNextBase,
      timeStatus: rawNextBase.timeStatus === 'confermato' ? 'confermato' : 'indicativo',
    };
    const nextBaseFp = serializeShoppingDraftFingerprint(nextBase);
    const stored = draftScope ? readShoppingDraft(draftScope, { sourceUpdatedAt }) : null;
    if (stored && stored.conflict) {
      applyDraftFieldsToState(nextBase);
      setPendingConflictDraft(stored.fields);
      setSaveStatus('idle');
    } else if (stored && serializeShoppingDraftFingerprint(stored.fields) !== nextBaseFp) {
      applyDraftFieldsToState(stored.fields);
      setPendingConflictDraft(null);
      setSaveStatus('bozza_sul_dispositivo');
    } else {
      applyDraftFieldsToState(nextBase);
      setPendingConflictDraft(null);
      setSaveStatus('idle');
    }
    setError('');
    setShowInvalidCloseActions(false);
  }, [defaultDate, defaultTime, initialData, draftScope, sourceUpdatedAt, applyDraftFieldsToState]);

  const isAutoSaveEnabled = Boolean(initialData?.id && onAutoSave);
  const currentDraft: ShoppingDraftFields = useMemo(
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
  const validationError = useMemo(
    () => validateShoppingDraft(currentDraft),
    [currentDraft]
  );

  const savedBaselineRef = useRef<string>(baselineFingerprint);
  const inFlightSubmitRef = useRef<boolean>(false);
  const lastSavedEntityIdRef = useRef<string | undefined>(initialData?.id);
  const lastSaveStartedAtRef = useRef<number>(0);
  const latestDraftRef = useRef<ShoppingDraftFields>(currentDraft);
  const latestDraftFingerprintRef = useRef(draftFingerprint);
  latestDraftRef.current = currentDraft;
  latestDraftFingerprintRef.current = draftFingerprint;

  useEffect(() => {
    savedBaselineRef.current = baselineFingerprint;
  }, [baselineFingerprint]);

  const persistDraftSynchronously = useCallback(
    (nextFields: ShoppingDraftFields) => {
      const nextFp = serializeShoppingDraftFingerprint(nextFields);
      const dirty = nextFp !== savedBaselineRef.current;
      if (!dirty) {
        if (draftScope) clearShoppingDraft(draftScope);
        setSaveStatus(prev =>
          prev === 'bozza_sul_dispositivo' || prev === 'bozza_non_salvata' ? 'idle' : prev
        );
        return;
      }
      if (!draftScope) {
        setSaveStatus(prev => (prev === 'saving' ? prev : 'bozza_non_salvata'));
        return;
      }
      const res = writeShoppingDraft(draftScope, nextFields, { sourceUpdatedAt });
      setSaveStatus(prev => (prev === 'saving' ? prev : res.status));
    },
    [draftScope, sourceUpdatedAt]
  );

  const updateDraftFields = useCallback(
    (patch: Partial<ShoppingDraftFields>) => {
      const nextFields: ShoppingDraftFields = { ...latestDraftRef.current, ...patch };
      latestDraftRef.current = nextFields;
      latestDraftFingerprintRef.current = serializeShoppingDraftFingerprint(nextFields);
      if (patch.sottocategoria !== undefined) setSottocategoria(patch.sottocategoria);
      if (patch.nome !== undefined) setNome(patch.nome);
      if (patch.scopo !== undefined) setScopo(patch.scopo);
      if (patch.data !== undefined) setData(patch.data);
      if (patch.orario !== undefined) setOrario(patch.orario);
      if (patch.timeStatus !== undefined) setTimeStatus(patch.timeStatus);
      if (patch.indirizzo !== undefined) setIndirizzo(patch.indirizzo);
      if (patch.budget !== undefined) setBudget(patch.budget);
      if (patch.link !== undefined) setLink(patch.link);
      if (patch.noteCopilota !== undefined) setNoteCopilota(patch.noteCopilota);
      if (patch.copilota !== undefined) setCopilota(patch.copilota);
      persistDraftSynchronously(nextFields);
    },
    [persistDraftSynchronously]
  );

  const flushLocalDraftNow = useCallback(() => {
    persistDraftSynchronously(latestDraftRef.current);
  }, [persistDraftSynchronously]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushLocalDraftNow();
    };
    window.addEventListener('pagehide', flushLocalDraftNow);
    window.addEventListener('beforeunload', flushLocalDraftNow);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', flushLocalDraftNow);
      window.removeEventListener('beforeunload', flushLocalDraftNow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushLocalDraftNow]);

  const evaluateCloudProof = useCallback(async (entityId?: string, startedAt?: number) => {
    const targetId = entityId || lastSavedEntityIdRef.current;
    const saveTs = startedAt || lastSaveStartedAtRef.current;
    if (!saveTs) return;
    const online = typeof navigator === 'undefined' ? true : Boolean(navigator.onLine);
    const activeTripId = getActiveTripId() || tripId;
    if (!online || !activeTripId || !isCloudAuthorized(activeTripId) || !targetId) {
      setSaveStatus('saved_pending_sync');
      return;
    }
    try {
      const stillPending = await hasPendingMutation(activeTripId, 'shopping', targetId);
      setSaveStatus(stillPending ? 'saved_pending_sync' : 'synced');
    } catch {
      setSaveStatus('saved_pending_sync');
    }
  }, [tripId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleCloudSynced = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const activeTripId = getActiveTripId() || tripId;
      if (activeTripId && detail?.tripId && detail.tripId !== activeTripId) return;
      if (lastSaveStartedAtRef.current > 0 && latestDraftFingerprintRef.current === savedBaselineRef.current) {
        void evaluateCloudProof();
      }
    };
    const handleOffline = () => {
      if (saveStatus === 'synced' && lastSaveStartedAtRef.current > 0) return;
      setSaveStatus(prev => (prev === 'saving' ? 'saved_pending_sync' : prev));
    };
    window.addEventListener('roadbook_cloud_synced', handleCloudSynced);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('roadbook_cloud_synced', handleCloudSynced);
      window.removeEventListener('offline', handleOffline);
    };
  }, [tripId, evaluateCloudProof, saveStatus]);

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
        flushLocalDraftNow();
        return true;
      },
    }),
    [flushLocalDraftNow]
  );

  const handleAiExtraction = async () => {
    if (!aiText.trim()) return;
    setIsExtracting(true);
    setError('');
    
    try {
      const res = await extractFromText(aiText, 'Nuovo inserimento Shopping', 'import');
      if (res.success && res.entityType === 'shopping' && res.data?.type === 'shopping') {
        const d = res.data;
        const aiPatch: Partial<ShoppingDraftFields> = {};
        if (d.nome) aiPatch.nome = d.nome;
        if (d.indirizzo) aiPatch.indirizzo = d.indirizzo;
        if (d.data) aiPatch.data = d.data;
        if (d.orario) aiPatch.orario = d.orario;
        if (d.budget) aiPatch.budget = d.budget;
        const extNote = (d as any).noteCopilota || d.nota || (d as any).notes;
        if (extNote) aiPatch.noteCopilota = extNote;
        if (d.sottocategoria && (SOTTOCATEGORIE as readonly string[]).includes(d.sottocategoria)) {
          aiPatch.sottocategoria = d.sottocategoria;
        }
        updateDraftFields(aiPatch);
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
    if (inFlightSubmitRef.current) return;
    if (validationError) {
      setError(validationError);
      return;
    }

    inFlightSubmitRef.current = true;
    setIsSubmitting(true);
    setSaveStatus('saving');
    setError('');
    setShowInvalidCloseActions(false);
    const startedAt = Date.now();
    lastSaveStartedAtRef.current = startedAt;

    try {
      const { payload, moneyCache } = await buildShoppingSavePayload({
        draft: currentDraft,
        initialData: latestInitialDataRef.current,
        cachedMoney: cachedMoneyRef.current,
      });
      cachedMoneyRef.current = moneyCache;

      if (isAutoSaveEnabled && onAutoSave) {
        const saved = await onAutoSave(payload);
        if (saved) {
          latestInitialDataRef.current = saved;
          lastSavedEntityIdRef.current = saved.id;
        }
        savedBaselineRef.current = draftFingerprint;
        if (draftScope) clearShoppingDraft(draftScope);
        await evaluateCloudProof(saved?.id || initialData?.id, startedAt);
        (onAutoSaveCompleteClose || onCancel)();
      } else {
        await onSave(payload);
        savedBaselineRef.current = draftFingerprint;
        if (draftScope) clearShoppingDraft(draftScope);
        await evaluateCloudProof(initialData?.id, startedAt);
      }
    } catch (err: any) {
      setError(err?.message || 'Errore durante il salvataggio Shopping.');
      if (draftScope) {
        const res = writeShoppingDraft(draftScope, currentDraft, { sourceUpdatedAt });
        setSaveStatus(res.status);
      } else {
        setSaveStatus('bozza_non_salvata');
      }
    } finally {
      inFlightSubmitRef.current = false;
      setIsSubmitting(false);
    }
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

        {pendingConflictDraft && (
          <div
            data-testid="shopping-draft-conflict"
            className="p-3 text-xs rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2"
          >
            <div className="font-bold">
              Bozza precedente trovata su questo dispositivo (il record condiviso è stato aggiornato).
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const conflictFields = pendingConflictDraft;
                  applyDraftFieldsToState(conflictFields);
                  latestDraftRef.current = conflictFields;
                  latestDraftFingerprintRef.current = serializeShoppingDraftFingerprint(conflictFields);
                  setPendingConflictDraft(null);
                  persistDraftSynchronously(conflictFields);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-500 transition-colors cursor-pointer"
              >
                Ripristina bozza
              </button>
              <button
                type="button"
                onClick={() => {
                  if (draftScope) clearShoppingDraft(draftScope);
                  setPendingConflictDraft(null);
                  setSaveStatus('idle');
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 font-bold hover:bg-amber-100 transition-colors cursor-pointer"
              >
                Scarta bozza
              </button>
            </div>
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
                    if (draftScope) clearShoppingDraft(draftScope);
                    setSaveStatus('idle');
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
                onClick={() => updateDraftFields({ sottocategoria: cat })}
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
            onChange={(e) => updateDraftFields({ nome: e.target.value })}
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
            onChange={(e) => updateDraftFields({ scopo: e.target.value })}
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
              onChange={(e) => updateDraftFields({ data: e.target.value })}
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
                  onClick={() => updateDraftFields({ timeStatus: 'confermato' })}
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
                  onClick={() => updateDraftFields({ timeStatus: 'indicativo' })}
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
            <TimePickerInput value={orario} onChange={(val) => updateDraftFields({ orario: val })} ariaLabel="Orario shopping" />
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
            onChange={(e) => updateDraftFields({ indirizzo: e.target.value })}
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
              onValueChange={(value) => updateDraftFields({ budget: value })}
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
              onChange={(e) => updateDraftFields({ link: e.target.value })}
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
              updateDraftFields(val.trim() ? { noteCopilota: val, copilota: true } : { noteCopilota: val });
            }}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-slate-100 focus:border-rose-500 placeholder:text-slate-400 resize-none"
          />
        </div>

        {SHOPPING_SAVE_LABELS[saveStatus] && (
          <div
            data-testid="shopping-autosave-status"
            data-autosave-status={saveStatus}
            className={`text-[11px] font-semibold text-right pt-1 ${SHOPPING_SAVE_LABELS[saveStatus]?.tone || 'text-slate-400'}`}
          >
            {SHOPPING_SAVE_LABELS[saveStatus]?.text}
          </div>
        )}

        <FormActionButtons
          isEditing={Boolean(initialData)}
          isSubmitting={isSubmitting}
          submitLabel={initialData ? 'Aggiorna' : 'Salva Shopping'}
          submittingLabel="Salvataggio…"
          cancelLabel={isAutoSaveEnabled ? 'Chiudi' : 'Annulla'}
          itemName={nome.trim() || initialData?.nome || 'questo elemento'}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </form>
    </div>
  );
}
