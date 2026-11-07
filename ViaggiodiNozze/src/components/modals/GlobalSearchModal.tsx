import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SectionTab, CategoriaTab, Tappa, Attivita, Alloggio, Trasporto, Ristorante, Shopping, TravelDocument, NotaViaggio, Scadenza, Spesa } from '../../types';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { formatDateIT } from '../../utils/tripDates';

export interface GlobalSearchResult {
  id: string;
  entityType: 'tappa' | 'attivita' | 'alloggio' | 'trasporto' | 'ristorante' | 'shopping' | 'documento' | 'nota' | 'spesa';
  badgeLabel: string;
  icon: string;
  title: string;
  subtitle: string;
  date?: string;
  matchedSnippet?: string;
  targetTab: SectionTab;
  targetCategoria?: CategoriaTab;
  targetSubView?: string;
  rawEntity?: any;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: SectionTab, categoria?: CategoriaTab, subView?: string, targetDate?: string) => void;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function GlobalSearchModal({ isOpen, onClose, onNavigate }: GlobalSearchModalProps) {
  const { canEdit, canSeePrivateInfo: deviceCanSeePrivate } = useDeviceRole();
  const isExternalLiveView = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('live') === '1' ||
    new URLSearchParams(window.location.search).get('live') === 'true' ||
    new URLSearchParams(window.location.search).get('view') === 'live' ||
    (window.location.hash || '').toLowerCase().includes('live')
  );
  const canSeePrivateInfo = !isExternalLiveView && deviceCanSeePrivate;

  const [queryText, setQueryText] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | GlobalSearchResult['entityType']>('all');
  const [allItems, setAllItems] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Modalità Trova e Sostituisci (solo per Owner/Copilota e solo su campi testuali pubblici/operativi)
  const [isReplaceMode, setIsReplaceMode] = useState(false);
  const [replaceText, setReplaceText] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceSuccessMsg, setReplaceSuccessMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const loadTripDataForSearch = async () => {
    setLoading(true);
    try {
      const [
        tappe,
        activities,
        accommodations,
        transports,
        ristoranti,
        shopping,
        documents,
        notes,
        scadenze,
        expenses
      ] = await Promise.all([
        storageService.getTappe().catch(() => [] as Tappa[]),
        storageService.getActivities().catch(() => [] as Attivita[]),
        storageService.getAccommodations().catch(() => [] as Alloggio[]),
        storageService.getTransports().catch(() => [] as Trasporto[]),
        storageService.getRistoranti().catch(() => [] as Ristorante[]),
        storageService.getShopping().catch(() => [] as Shopping[]),
        canSeePrivateInfo ? storageService.getDocuments().catch(() => [] as TravelDocument[]) : Promise.resolve([] as TravelDocument[]),
        storageService.getNote().catch(() => [] as NotaViaggio[]),
        storageService.getScadenze().catch(() => [] as Scadenza[]),
        canSeePrivateInfo ? storageService.getSpese().catch(() => [] as Spesa[]) : Promise.resolve([] as Spesa[])
      ]);

      const indexed: GlobalSearchResult[] = [];

      // 1. Tappe
      tappe.forEach((t) => {
        const privPart = canSeePrivateInfo ? `${t.bookingCode || ''} ${t.noteCopilota || ''}` : '';
        indexed.push({
          id: `tappa_${t.id}`,
          entityType: 'tappa',
          badgeLabel: t.sottocategoria || 'Tappa',
          icon: '📍',
          title: t.titolo || 'Tappa',
          subtitle: [t.indirizzo, t.nota, privPart].filter(Boolean).join(' · '),
          date: t.data || t.date,
          targetTab: 'categorie',
          targetCategoria: 'tappe',
          rawEntity: t
        });
      });

      // 2. Attività
      activities.forEach((a) => {
        const privPart = canSeePrivateInfo ? `${a.noteCopilota || ''} ${a.cost ? `€${a.cost}` : ''}` : '';
        indexed.push({
          id: `attivita_${a.id}`,
          entityType: 'attivita',
          badgeLabel: a.sottocategoria || a.category || 'Attività',
          icon: '🥾',
          title: a.title || 'Attività',
          subtitle: [a.location, a.address, a.notes, privPart].filter(Boolean).join(' · '),
          date: a.date,
          targetTab: 'categorie',
          targetCategoria: 'attivita',
          rawEntity: a
        });
      });

      // 3. Alloggi
      accommodations.forEach((h) => {
        const privPart = canSeePrivateInfo
          ? `${h.bookingCode ? `PNR ${h.bookingCode}` : ''} ${h.pinCode ? `PIN ${h.pinCode}` : ''} ${h.noteCopilota || ''}`
          : '';
        indexed.push({
          id: `alloggio_${h.id}`,
          entityType: 'alloggio',
          badgeLabel: h.sottocategoria || 'Alloggio',
          icon: '🛏️',
          title: h.name || 'Alloggio',
          subtitle: [h.location, h.address, h.notes, privPart].filter(Boolean).join(' · '),
          date: h.checkIn,
          targetTab: 'categorie',
          targetCategoria: 'alloggi',
          rawEntity: h
        });
      });

      // 4. Trasporti
      transports.forEach((tr) => {
        const privPart = canSeePrivateInfo
          ? `${tr.bookingCode ? `PNR ${tr.bookingCode}` : ''} ${tr.terminalGate || ''} ${tr.posti || ''} ${tr.noteCopilota || ''}`
          : '';
        indexed.push({
          id: `trasporto_${tr.id}`,
          entityType: 'trasporto',
          badgeLabel: (tr.type || 'Trasporto').toUpperCase(),
          icon: tr.type === 'volo' ? '✈️' : tr.type === 'traghetto' ? '⛴️' : tr.type === 'treno' ? '🚆' : '🚗',
          title: tr.carrier || `${tr.departureLocation || ''} → ${tr.arrivalLocation || ''}`.trim() || 'Trasporto',
          subtitle: [tr.departureLocation, tr.arrivalLocation, tr.dropoffLocation, tr.notes, privPart].filter(Boolean).join(' · '),
          date: tr.date,
          targetTab: 'categorie',
          targetCategoria: 'trasporti',
          rawEntity: tr
        });
      });

      // 5. Ristoranti
      ristoranti.forEach((r) => {
        const privPart = canSeePrivateInfo ? `${r.noteCopilota || ''}` : '';
        indexed.push({
          id: `ristorante_${r.id}`,
          entityType: 'ristorante',
          badgeLabel: r.sottocategoria || 'Ristorante',
          icon: '🍽️',
          title: r.nome || 'Ristorante',
          subtitle: [r.indirizzo, r.nota, r.notes, privPart].filter(Boolean).join(' · '),
          date: r.data || r.date,
          targetTab: 'categorie',
          targetCategoria: 'ristoranti',
          rawEntity: r
        });
      });

      // 6. Shopping
      shopping.forEach((s) => {
        const privPart = canSeePrivateInfo ? `${s.noteCopilota || ''}` : '';
        indexed.push({
          id: `shopping_${s.id}`,
          entityType: 'shopping',
          badgeLabel: s.sottocategoria || 'Shopping',
          icon: '🛍️',
          title: s.nome || 'Shopping',
          subtitle: [s.scopo, s.indirizzo, s.nota, s.notes, privPart].filter(Boolean).join(' · '),
          date: s.data || s.date,
          targetTab: 'categorie',
          targetCategoria: 'shopping',
          rawEntity: s
        });
      });

      // 7. Documenti & Polizze (solo se autorizzato a vedere dati privati)
      if (canSeePrivateInfo) {
        documents.forEach((d) => {
          indexed.push({
            id: `documento_${d.id}`,
            entityType: 'documento',
            badgeLabel: d.category === 'assicurazione' ? 'Polizza' : 'Documento',
            icon: d.category === 'assicurazione' ? '🛡️' : '📁',
            title: d.title || 'Documento',
            subtitle: [d.description, d.policyNumber, d.company, d.validity, d.notes].filter(Boolean).join(' · '),
            date: d.expiresAt,
            targetTab: 'altro',
            targetSubView: d.category === 'assicurazione' ? 'assicurazione' : 'documenti',
            rawEntity: d
          });
        });
      }

      // 8. Note e Scadenze
      notes.forEach((n) => {
        indexed.push({
          id: `nota_${n.id}`,
          entityType: 'nota',
          badgeLabel: 'Nota',
          icon: '📝',
          title: n.title || 'Nota di viaggio',
          subtitle: n.content || '',
          targetTab: 'altro',
          targetSubView: 'note',
          rawEntity: n
        });
      });
      scadenze.forEach((sc) => {
        indexed.push({
          id: `scadenza_${sc.id}`,
          entityType: 'nota',
          badgeLabel: 'Scadenza',
          icon: '⏰',
          title: sc.title || 'Promemoria',
          subtitle: [sc.content, canSeePrivateInfo ? sc.copilotNotes : ''].filter(Boolean).join(' · '),
          date: sc.dueDate,
          targetTab: 'altro',
          targetSubView: 'note',
          rawEntity: sc
        });
      });

      // 9. Spese (solo se autorizzato a vedere dati privati)
      if (canSeePrivateInfo) {
        expenses.forEach((sp) => {
          indexed.push({
            id: `spesa_${sp.id}`,
            entityType: 'spesa',
            badgeLabel: `Spesa · €${Number(sp.amount || 0).toFixed(2)}`,
            icon: '💶',
            title: sp.title || 'Spesa',
            subtitle: [sp.category, sp.notes].filter(Boolean).join(' · '),
            date: sp.date,
            targetTab: 'categorie',
            targetCategoria: 'spese',
            rawEntity: sp
          });
        });
      }

      setAllItems(indexed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setReplaceSuccessMsg(null);
    loadTripDataForSearch();
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [isOpen, canSeePrivateInfo]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const filteredResults = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return [];
    return allItems.filter((item) => {
      if (selectedFilter !== 'all' && item.entityType !== selectedFilter) return false;
      const haystack = `${item.title} ${item.subtitle} ${item.badgeLabel} ${item.date || ''}`.toLowerCase();
      return haystack.includes(q);
    }).slice(0, 60);
  }, [allItems, queryText, selectedFilter]);

  // Elementi candidati per "Trova e sostituisci" (esclude rigorosamente spese, PNR, PIN e campi finanziari)
  const replaceableItems = useMemo(() => {
    const q = queryText.trim();
    if (!isReplaceMode || !canEdit || q.length < 2) return [];
    const regex = new RegExp(escapeRegExp(q), 'i');
    return filteredResults.filter((r) => {
      if (r.entityType === 'spesa' || r.entityType === 'documento') return false;
      const e = r.rawEntity || {};
      const publicFields = [
        e.title, e.titolo, e.name, e.nome, e.carrier,
        e.location, e.address, e.indirizzo, e.departureLocation, e.arrivalLocation,
        e.notes, e.nota, e.content
      ].filter((v) => typeof v === 'string');
      return publicFields.some((val) => regex.test(val));
    });
  }, [filteredResults, isReplaceMode, canEdit, queryText]);

  const handleExecuteReplace = async () => {
    const findStr = queryText.trim();
    if (!canEdit || findStr.length < 2 || replaceableItems.length === 0) return;
    if (!window.confirm(`Confermi la sostituzione di "${findStr}" con "${replaceText}" in ${replaceableItems.length} elementi del viaggio? (Importi, PNR, PIN e credenziali private non verranno mai toccati)`)) {
      return;
    }

    setIsReplacing(true);
    setReplaceSuccessMsg(null);
    const regex = new RegExp(escapeRegExp(findStr), 'gi');
    let updatedCount = 0;

    try {
      for (const item of replaceableItems) {
        const raw = { ...item.rawEntity };
        const rep = (val?: string) => (typeof val === 'string' ? val.replace(regex, replaceText) : val);

        if (item.entityType === 'tappa') {
          raw.titolo = rep(raw.titolo) || raw.titolo;
          raw.indirizzo = rep(raw.indirizzo);
          raw.nota = rep(raw.nota);
          raw.notes = rep(raw.notes);
          await storageService.saveTappa(raw);
          updatedCount++;
        } else if (item.entityType === 'attivita') {
          raw.title = rep(raw.title) || raw.title;
          raw.location = rep(raw.location) || '';
          raw.address = rep(raw.address);
          raw.notes = rep(raw.notes);
          await storageService.saveActivity(raw);
          updatedCount++;
        } else if (item.entityType === 'alloggio') {
          raw.name = rep(raw.name) || raw.name;
          raw.location = rep(raw.location) || '';
          raw.address = rep(raw.address) || '';
          raw.notes = rep(raw.notes);
          await storageService.saveAlloggio(raw);
          updatedCount++;
        } else if (item.entityType === 'trasporto') {
          raw.carrier = rep(raw.carrier);
          raw.departureLocation = rep(raw.departureLocation) || '';
          raw.arrivalLocation = rep(raw.arrivalLocation) || '';
          raw.dropoffLocation = rep(raw.dropoffLocation);
          raw.notes = rep(raw.notes);
          await storageService.saveTransport(raw);
          updatedCount++;
        } else if (item.entityType === 'ristorante') {
          raw.nome = rep(raw.nome) || raw.nome;
          raw.indirizzo = rep(raw.indirizzo);
          raw.nota = rep(raw.nota);
          raw.notes = rep(raw.notes);
          await storageService.saveRistorante(raw);
          updatedCount++;
        } else if (item.entityType === 'shopping') {
          raw.nome = rep(raw.nome) || raw.nome;
          raw.indirizzo = rep(raw.indirizzo);
          raw.nota = rep(raw.nota);
          raw.notes = rep(raw.notes);
          await storageService.saveShopping(raw);
          updatedCount++;
        } else if (item.entityType === 'nota' && raw.recordKind !== 'scadenza') {
          raw.title = rep(raw.title);
          raw.content = rep(raw.content) || '';
          await storageService.saveNota(raw);
          updatedCount++;
        }
      }

      notifyDataChanged('all', 'save');
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'bulk_replace' } }));
      setReplaceSuccessMsg(`✓ Sostituzione completata su ${updatedCount} elementi.`);
      await loadTripDataForSearch();
    } finally {
      setIsReplacing(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ricerca globale nel viaggio"
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-start justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Barra di ricerca */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg shrink-0">🔍</span>
            <input
              ref={inputRef}
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Cerca tappe, voli, hotel, attività, note, luoghi..."
              className="flex-1 min-w-0 bg-transparent text-sm sm:text-base font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
            {queryText && (
              <button
                type="button"
                onClick={() => setQueryText('')}
                className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                Pulisci
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white text-xs font-bold cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>

          {/* Filtri rapidi + toggle Trova e Sostituisci */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {([
                { id: 'all', label: 'Tutti' },
                { id: 'tappa', label: '📍 Tappe' },
                { id: 'attivita', label: '🥾 Attività' },
                { id: 'alloggio', label: '🛏️ Alloggi' },
                { id: 'trasporto', label: '✈️ Trasporti' },
                { id: 'ristorante', label: '🍽️ Ristoranti' },
                { id: 'nota', label: '📝 Note' },
                ...(canSeePrivateInfo ? [
                  { id: 'documento', label: '📁 Documenti' },
                  { id: 'spesa', label: '💶 Spese' }
                ] : [])
              ] as const).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFilter(f.id as any)}
                  className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                    selectedFilter === f.id
                      ? 'bg-[#172033] text-white border-[#172033] dark:bg-white dark:text-[#172033]'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={() => setIsReplaceMode((v) => !v)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border cursor-pointer transition-colors ${
                  isReplaceMode
                    ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700'
                    : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                }`}
              >
                ✏️ Trova e sostituisci
              </button>
            )}
          </div>

          {/* Pannello opzionale Trova e Sostituisci */}
          {isReplaceMode && canEdit && (
            <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Sostituisci il testo cercato con..."
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isReplacing || replaceableItems.length === 0 || queryText.trim().length < 2}
                  onClick={handleExecuteReplace}
                  className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isReplacing ? 'Sostituzione...' : `Sostituisci (${replaceableItems.length})`}
                </button>
              </div>
              <p className="text-[10px] text-amber-800 dark:text-amber-300">
                Opera solo su titoli, luoghi e note generali. Importi, PNR, PIN e credenziali in cassaforte sono sempre esclusi.
              </p>
              {replaceSuccessMsg && (
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{replaceSuccessMsg}</p>
              )}
            </div>
          )}
        </div>

        {/* Risultati */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {loading ? (
            <div className="py-10 text-center text-xs text-slate-400 font-semibold">
              Indicizzazione elementi del viaggio...
            </div>
          ) : !queryText.trim() ? (
            <div className="py-10 text-center space-y-1">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Digita una parola chiave per cercare in tutto il viaggio
              </p>
              <p className="text-[11px] text-slate-400">
                Cerca città, hotel, compagnie aeree, escursioni, ristoranti{canSeePrivateInfo ? ', PNR, documenti o spese' : ''}.
              </p>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Nessun risultato per “{queryText}”
              </p>
              <p className="text-[11px] text-slate-400">
                Prova con un termine più breve o seleziona il filtro “Tutti”.
              </p>
            </div>
          ) : (
            filteredResults.map((res) => (
              <div
                key={res.id}
                className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/90 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(res.targetTab, res.targetCategoria, res.targetSubView, res.date);
                    onClose();
                  }}
                  className="min-w-0 flex-1 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span>{res.icon}</span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700">
                      {res.badgeLabel}
                    </span>
                    {res.date && (
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        📅 {formatDateIT(res.date)}
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                    {res.title}
                  </h4>
                  {res.subtitle && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                      {res.subtitle}
                    </p>
                  )}
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {res.date && (
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('roadbook_select_date', { detail: { date: res.date } }));
                        }
                        onNavigate('oggi', undefined, undefined, res.date);
                        onClose();
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-200/60 text-[11px] font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
                      title="Vai al giorno nella Timeline Oggi"
                    >
                      Giorno →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate(res.targetTab, res.targetCategoria, res.targetSubView, res.date);
                      onClose();
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-[#FF6B5F] hover:bg-[#e05b50] text-white text-[11px] font-bold cursor-pointer"
                  >
                    Apri
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
