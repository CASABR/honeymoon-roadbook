import { useEffect, useState } from 'react';
import { storageService } from '../../storage/storageService';
import { useDeviceRole } from '../../utils/useDeviceRole';
import Modal from '../../components/common/Modal';

type EmergencyKind = 'Emergenza locale' | 'Ambasciata o consolato' | 'Contatto personale' | 'Struttura sanitaria' | 'Altro';

interface EmergencyEntry {
  id: string;
  kind: EmergencyKind;
  title: string;
  phone?: string;
  address?: string;
  notes?: string;
  link?: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: 'documents', text: 'Controllare passaporti/documenti e relative scadenze', done: false },
  { id: 'contacts', text: 'Salvare contatti di emergenza e polizza assicurativa', done: false },
  { id: 'payments', text: 'Verificare carte di credito abilitate e limiti all\'estero', done: false },
  { id: 'attachments', text: 'Scaricare o stampare voucher offline e prenotazioni', done: false }
];

// Numeri utili internazionali sempre presenti
const GLOBAL_SAFETY_NUMBERS = [
  {
    title: 'Numero Unico Emergenze (UE)',
    number: '112',
    desc: 'Polizia, ambulanza, vigili del fuoco in tutta l\'Unione Europea',
    icon: '🚨'
  },
  {
    title: 'Unità di Crisi Farnesina',
    number: '+39 06 491115',
    desc: 'Emergenze per cittadini italiani all\'estero (attivo h24)',
    icon: '🇮🇹'
  }
];

function BackHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <header className="flex items-center gap-3 mb-6 px-1">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-2xs border border-slate-200/60 dark:border-slate-700"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
        </svg>
        <span>Torna ad Altro</span>
      </button>
      <div className="min-w-0">
        <h1 className="text-lg font-black text-[#172033] dark:text-white tracking-tight truncate">
          {title}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">{subtitle}</p>
      </div>
    </header>
  );
}

// ============================================================================
// EMERGENZE VIEW
// ============================================================================
export function EmergenzeView({ onBack }: { onBack: () => void }) {
  const { canEdit } = useDeviceRole();
  const [entries, setEntries] = useState<EmergencyEntry[]>([]);
  const [editing, setEditing] = useState<EmergencyEntry | null>(null);
  const [draft, setDraft] = useState<Partial<EmergencyEntry>>({ kind: 'Emergenza locale' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<EmergencyEntry | null>(null);

  const getStorageKey = () => `emergency_directory_${storageService.getCurrentTripId()}`;

  const loadEntries = async () => {
    try {
      const data = await storageService.getSetting<EmergencyEntry[]>(getStorageKey());
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      setEntries([]);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const saveEntries = async (next: EmergencyEntry[]) => {
    await storageService.saveSetting(getStorageKey(), next);
    setEntries(next);
  };

  const handleOpenAdd = () => {
    setEditing(null);
    setDraft({ kind: 'Emergenza locale' });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (entry: EmergencyEntry) => {
    setEditing(entry);
    setDraft(entry);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title?.trim()) return;

    const entry: EmergencyEntry = {
      id: editing?.id || `emg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      kind: (draft.kind as EmergencyKind) || 'Altro',
      title: draft.title.trim(),
      phone: draft.phone?.trim() || undefined,
      address: draft.address?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      link: draft.link?.trim() || undefined,
    };

    const next = editing
      ? entries.map(item => item.id === entry.id ? entry : item)
      : [...entries, entry];

    await saveEntries(next);
    setIsFormOpen(false);
    setEditing(null);
    setDraft({ kind: 'Emergenza locale' });
  };

  const handleDeleteConfirm = async () => {
    if (!deletingEntry) return;
    const next = entries.filter(item => item.id !== deletingEntry.id);
    await saveEntries(next);
    setDeletingEntry(null);
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-20">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        <div className="flex items-center justify-between">
          <BackHeader
            title="Emergenze & Assistenza"
            subtitle="Numeri di sicurezza e contatti salvati per questo viaggio."
            onBack={onBack}
          />
          {canEdit && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF6B5F] hover:bg-[#e0564a] text-white text-xs font-bold shadow-md shadow-[#FF6B5F]/20 transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <span>+</span>
              <span>Nuovo contatto</span>
            </button>
          )}
        </div>

        {/* Box Numeri di Sicurezza Generali */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🛡️</span>
            <h2 className="text-sm font-extrabold text-[#172033] dark:text-white">
              Numeri di Emergenza Generali
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {GLOBAL_SAFETY_NUMBERS.map((num) => (
              <div
                key={num.number}
                className="bg-[#F8F7F3] dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/50 dark:border-slate-700/60 flex items-start gap-3"
              >
                <span className="text-2xl shrink-0">{num.icon}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">{num.title}</h3>
                  <a
                    href={`tel:${num.number.replace(/\s+/g, '')}`}
                    className="inline-block text-sm font-black text-[#FF6B5F] hover:underline font-mono mt-0.5"
                  >
                    {num.number} 📞
                  </a>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    {num.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contatti Personali per il Viaggio */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold text-[#172033] dark:text-white flex items-center gap-2">
              <span>📍</span>
              <span>Contatti Personalizzati del Viaggio</span>
            </h2>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {entries.length} contatti
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                ☎️
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-1">
                Nessun contatto di emergenza salvato
              </h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mb-4 leading-relaxed">
                Salva i recapiti dell'ambasciata di destinazione, assicurazione, medico o persone di fiducia.
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#172033] hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <span>+</span>
                  <span>Aggiungi contatto</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {entries.map((entry) => (
                <article
                  key={entry.id}
                  className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B5F] bg-[#FFF0ED] px-2 py-0.5 rounded-md">
                        {entry.kind}
                      </span>
                    </div>
                    <h3 className="text-sm font-extrabold text-[#172033] dark:text-white leading-snug">
                      {entry.title}
                    </h3>
                    {entry.phone && (
                      <a
                        href={`tel:${entry.phone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF6B5F] hover:underline font-mono mt-2"
                      >
                        <span>📞</span>
                        <span>{entry.phone}</span>
                      </a>
                    )}
                    {entry.address && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 flex items-start gap-1">
                        <span className="shrink-0 text-slate-400">📍</span>
                        <span>{entry.address}</span>
                      </p>
                    )}
                    {entry.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 bg-[#F8F7F3] dark:bg-slate-800/50 p-2 rounded-xl whitespace-pre-wrap leading-relaxed">
                        {entry.notes}
                      </p>
                    )}
                    {entry.link && (
                      <a
                        href={entry.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-xs font-semibold text-[#172033] dark:text-indigo-400 underline mt-2 break-all"
                      >
                        Apri link utile ↗
                      </a>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(entry)}
                        className="px-3 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingEntry(entry)}
                        className="px-3 py-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        Elimina
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modale Aggiungi / Modifica Contatto */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? 'Modifica Contatto' : 'Nuovo Contatto di Emergenza'}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Tipologia
            </label>
            <select
              value={draft.kind || 'Emergenza locale'}
              onChange={e => setDraft({ ...draft, kind: e.target.value as EmergencyKind })}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white"
            >
              {(['Emergenza locale', 'Ambasciata o consolato', 'Contatto personale', 'Struttura sanitaria', 'Altro'] as EmergencyKind[]).map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Nome o Servizio *
            </label>
            <input
              required
              value={draft.title || ''}
              onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder="es. Ambasciata Italiana, Polizia Turistica..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Telefono
            </label>
            <input
              type="tel"
              value={draft.phone || ''}
              onChange={e => setDraft({ ...draft, phone: e.target.value })}
              placeholder="es. +39 06 ... oppure 911"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Indirizzo (opzionale)
            </label>
            <input
              value={draft.address || ''}
              onChange={e => setDraft({ ...draft, address: e.target.value })}
              placeholder="Via, città o riferimento geografico"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Link Utile (opzionale)
            </label>
            <input
              type="url"
              value={draft.link || ''}
              onChange={e => setDraft({ ...draft, link: e.target.value })}
              placeholder="https://..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Note (orari, codice polizza, referente)
            </label>
            <textarea
              rows={2}
              value={draft.notes || ''}
              onChange={e => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Informazioni utili per urgenze..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F] resize-none"
            />
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#FF6B5F] hover:bg-[#e0564a] shadow-sm transition-all cursor-pointer"
            >
              {editing ? 'Salva Modifiche' : 'Salva Contatto'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modale Conferma Eliminazione */}
      {deletingEntry && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingEntry(null)}
          title="Elimina Contatto"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Sei sicuro di voler eliminare <strong>{deletingEntry.title}</strong> dai contatti di questo viaggio?
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer"
              >
                Elimina Definitivamente
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// TRAVEL TOOLKIT VIEW (Priorità 3)
// ============================================================================
export function TravelToolkitView({ onBack }: { onBack: () => void }) {
  const { canEdit } = useDeviceRole();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newText, setNewText] = useState('');

  const getStorageKey = () => `travel_toolkit_${storageService.getCurrentTripId()}`;

  const loadItems = async () => {
    try {
      const data = await storageService.getSetting<ChecklistItem[]>(getStorageKey());
      if (Array.isArray(data) && data.length > 0) {
        setItems(data);
      } else {
        setItems(DEFAULT_CHECKLIST);
      }
    } catch {
      setItems(DEFAULT_CHECKLIST);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const saveItems = async (next: ChecklistItem[]) => {
    await storageService.saveSetting(getStorageKey(), next);
    setItems(next);
  };

  const toggleCheck = (id: string) => {
    if (!canEdit) return;
    const next = items.map(item => item.id === id ? { ...item, done: !item.done } : item);
    saveItems(next);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !canEdit) return;
    const next = [...items, { id: `chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, text: newText.trim(), done: false }];
    saveItems(next);
    setNewText('');
  };

  const handleDeleteItem = (id: string) => {
    if (!canEdit) return;
    const next = items.filter(item => item.id !== id);
    saveItems(next);
  };

  const completedCount = items.filter(i => i.done).length;
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  return (
    <div className="flex flex-col h-full animate-fade-in pb-20">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <BackHeader
          title="Travel Toolkit"
          subtitle="Preparazione essenziale, checklist e risorse pratiche di viaggio."
          onBack={onBack}
        />

        {/* Card 1: Checklist Pre-Partenza */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B5F]">
                Prima di partire
              </span>
              <h2 className="text-base font-extrabold text-[#172033] dark:text-white leading-tight mt-0.5">
                Checklist Pre-partenza
              </h2>
            </div>
            <div className="text-right">
              <span className="text-xs font-black text-[#172033] dark:text-slate-200 font-mono">
                {completedCount}/{items.length}
              </span>
              <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => toggleCheck(item.id)}
                className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                  item.done
                    ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-[#172033] dark:text-slate-100 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.done}
                  readOnly
                  aria-label={item.text}
                  className="w-4 h-4 rounded text-[#FF6B5F] focus:ring-[#FF6B5F] cursor-pointer"
                />
                <span className={`flex-1 text-xs font-semibold leading-relaxed ${item.done ? 'line-through' : ''}`}>
                  {item.text}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteItem(item.id);
                    }}
                    className="w-6 h-6 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-colors text-xs"
                    title="Elimina voce"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {canEdit && (
            <form onSubmit={handleAddItem} className="flex gap-2 pt-1">
              <input
                type="text"
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder="Aggiungi promemoria..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F]"
              />
              <button
                type="submit"
                disabled={!newText.trim()}
                className="px-4 py-2 rounded-xl bg-[#172033] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Aggiungi
              </button>
            </form>
          )}
        </section>

        {/* Card 2: Dentro Hounigo */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">💡</span>
            <h2 className="text-sm font-extrabold text-[#172033] dark:text-white">
              Funzionalità Chiave di Hounigo
            </h2>
          </div>
          <ul className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-[#FF6B5F] font-bold">•</span>
              <span><strong>Itinerario &amp; Mappa:</strong> Consulta le tappe, orari e coordinate GPS anche senza connessione attiva.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#FF6B5F] font-bold">•</span>
              <span><strong>Documenti &amp; Voucher:</strong> Allega file PDF o immagini ai tuoi alloggi e trasporti per averli a portata di mano.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#FF6B5F] font-bold">•</span>
              <span><strong>Spese &amp; Budget:</strong> Tieni traccia dei costi e verifica in tempo reale la quota saldata rispetto all'obiettivo prefissato.</span>
            </li>
          </ul>
        </section>

        {/* Card 3: Risorse e Strumenti Utili */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🌐</span>
            <h2 className="text-sm font-extrabold text-[#172033] dark:text-white">
              Link e Riferimenti Pratici
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <div className="p-3 rounded-2xl bg-[#F8F7F3] dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/60">
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1">📶 Connettività &amp; eSIM</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Confronta offerte dati internazionali (es. Airalo, Holafly o SIM locali all'arrivo in aeroporto).
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-[#F8F7F3] dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/60">
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1">💳 Carte &amp; Cambi</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Verifica se la tua carta applica commissioni sul tasso di cambio e porta sempre una carta di riserva.
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-[#F8F7F3] dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/60 sm:col-span-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1">⚖️ Diritti dei Passeggeri UE</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mb-1.5">
                In caso di ritardo o cancellazione di voli in partenza da aeroporti UE o con compagnie europee.
              </p>
              <a
                href="https://europa.eu/youreurope/citizens/travel/passenger-rights/index_en.htm"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-[#FF6B5F] hover:underline inline-flex items-center gap-1"
              >
                <span>Consulta la guida Your Europe ↗</span>
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
