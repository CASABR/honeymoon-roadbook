import { useState, useEffect, useRef } from 'react';
import type { NotaViaggio, ColorNota } from '../../types';
import { storageService } from '../../storage/storageService';

interface NoteViaggioViewProps {
  onBack?: () => void;
}

const COLOR_OPTIONS = [
  {
    id: 'amber' as ColorNota,
    label: 'Giallo',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-700/60',
    pin: 'bg-amber-400 dark:bg-amber-500',
    text: 'text-amber-950 dark:text-amber-100',
    textMuted: 'text-amber-700 dark:text-amber-300',
  },
  {
    id: 'sky' as ColorNota,
    label: 'Azzurro',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    border: 'border-sky-200 dark:border-sky-700/60',
    pin: 'bg-sky-400 dark:bg-sky-500',
    text: 'text-sky-950 dark:text-sky-100',
    textMuted: 'text-sky-700 dark:text-sky-300',
  },
  {
    id: 'emerald' as ColorNota,
    label: 'Verde',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-700/60',
    pin: 'bg-emerald-400 dark:bg-emerald-500',
    text: 'text-emerald-950 dark:text-emerald-100',
    textMuted: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'rose' as ColorNota,
    label: 'Rosa',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    border: 'border-rose-200 dark:border-rose-700/60',
    pin: 'bg-rose-400 dark:bg-rose-500',
    text: 'text-rose-950 dark:text-rose-100',
    textMuted: 'text-rose-700 dark:text-rose-300',
  },
];

function getColorConfig(color: ColorNota) {
  return COLOR_OPTIONS.find(c => c.id === color) || COLOR_OPTIONS[0];
}

function formatRelativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Adesso';
  if (mins < 60) return `${mins} min fa`;
  if (hours < 24) return `${hours}h fa`;
  return `${days}g fa`;
}

export default function NoteViaggioView({ onBack }: NoteViaggioViewProps) {
  // Le note di viaggio sono uno scratchpad/bacheca post-it locale del roadbook
  const canManageNotes = true;

  const [note, setNote] = useState<NotaViaggio[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNota, setEditingNota] = useState<NotaViaggio | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formColor, setFormColor] = useState<ColorNota>('amber');
  const [deletingNota, setDeletingNota] = useState<NotaViaggio | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const isReorderingRef = useRef(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const loadNote = async () => {
    try {
      setLoading(true);
      const items = await storageService.getNote();
      setNote(items);
    } catch (err) {
      console.error('[NoteViaggioView] Errore lettura note:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNote();
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!isReorderingRef.current) loadNote();
    };
    window.addEventListener('roadbook_data_mutated', handler);
    return () => window.removeEventListener('roadbook_data_mutated', handler);
  }, []);

  const openAdd = () => {
    setEditingNota(null);
    setFormTitle('');
    setFormContent('');
    setFormColor('amber');
    setIsModalOpen(true);
  };

  const openEdit = (nota: NotaViaggio) => {
    setEditingNota(nota);
    setFormTitle(nota.title || '');
    setFormContent(nota.content);
    setFormColor(nota.color);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formContent.trim()) return;
    setIsSaving(true);
    try {
      const item: NotaViaggio = {
        id: editingNota?.id || ('nota_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
        title: formTitle.trim() || undefined,
        content: formContent.trim(),
        color: formColor,
        order: editingNota?.order ?? (note.length ? Math.min(...note.map(item => Number.isFinite(item.order) ? Number(item.order) : 0)) - 1 : 0),
        createdAt: editingNota?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      await storageService.saveNota(item);
      setIsModalOpen(false);
      await loadNote();
      showToast(editingNota ? 'Nota aggiornata' : 'Nota creata');
    } catch (err) {
      console.error('[NoteViaggioView] Errore salvataggio:', err);
      alert('Impossibile salvare la nota. Riprova.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await storageService.deleteNota(id);
      setDeletingNota(null);
      await loadNote();
      showToast('Nota eliminata');
    } catch (err) {
      console.error('[NoteViaggioView] Errore eliminazione:', err);
      alert('Impossibile eliminare la nota. Riprova.');
    }
  };

  const persistOrder = async (next: NotaViaggio[]) => {
    const ordered = next.map((item, index) => ({ ...item, order: index }));
    setNote(ordered);
    isReorderingRef.current = true;
    try {
      await storageService.reorderNote(ordered.map(item => item.id));
      showToast('Ordine note aggiornato');
    } catch (err) {
      console.error('[NoteViaggioView] Errore riordino note:', err);
      await loadNote();
    } finally {
      isReorderingRef.current = false;
    }
  };

  const moveNote = async (noteId: string, direction: -1 | 1) => {
    const fromIndex = note.findIndex(item => item.id === noteId);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= note.length) return;
    const next = [...note];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    await persistOrder(next);
  };

  const dropNote = async (targetId: string) => {
    if (!draggedNoteId || draggedNoteId === targetId) return;
    const fromIndex = note.findIndex(item => item.id === draggedNoteId);
    const toIndex = note.findIndex(item => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...note];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setDraggedNoteId(null);
    setDropTargetId(null);
    await persistOrder(next);
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-20">
      {/* Toast Notifica */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#172033] text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg border border-slate-700 animate-slide-up">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between mb-5 px-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack || (() => window.history.back())}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            aria-label="Torna indietro"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>📝</span> Note di Viaggio
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bacheca post-it e promemoria</p>
          </div>
        </div>
        {canManageNotes && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 bg-[#FF6B5F] hover:bg-[#fa5547] active:scale-95 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-md shadow-[#FF6B5F]/20 transition-all cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Nuovo Post-it</span>
          </button>
        )}
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[200px]">
          <div className="w-7 h-7 border-2 border-[#FF6B5F] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : note.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16 px-4">
          <div className="text-6xl">📝</div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Nessuna nota ancora</p>
            <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">Aggiungi promemoria, idee e appunti di viaggio</p>
          </div>
          {canManageNotes && (
            <button
              type="button"
              onClick={openAdd}
              className="px-5 py-2.5 bg-[#FF6B5F] hover:bg-[#fa5547] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#FF6B5F]/20 active:scale-95 cursor-pointer"
            >
              + Aggiungi nota
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {note.map((nota, noteIndex) => {
            const c = getColorConfig(nota.color);
            const rotation = ((nota.id.charCodeAt(nota.id.length - 1) % 5) - 2);
            return (
              <div
                key={nota.id}
                onDragOver={(event) => { event.preventDefault(); setDropTargetId(nota.id); }}
                onDragLeave={() => setDropTargetId(current => current === nota.id ? null : current)}
                onDrop={(event) => { event.preventDefault(); dropNote(nota.id); }}
                className={`relative ${c.bg} ${c.border} border rounded-2xl p-4 pt-7 shadow-sm hover:shadow-md transition-all group ${draggedNoteId === nota.id ? 'opacity-50 scale-[0.98]' : ''} ${dropTargetId === nota.id && draggedNoteId !== nota.id ? 'ring-2 ring-[#FF6B5F] ring-offset-2' : ''}`}
                style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'center' }}
              >
                {canManageNotes && (
                  <div className="absolute left-2 top-2 flex items-center gap-1">
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => { setDraggedNoteId(nota.id); event.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDraggedNoteId(null); setDropTargetId(null); }}
                      className="flex h-7 w-7 cursor-grab items-center justify-center rounded-lg border border-black/5 bg-white/80 text-slate-500 shadow-xs active:cursor-grabbing dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-300"
                      title="Trascina per riordinare"
                      aria-label={`Trascina ${nota.title || 'nota'} per riordinare`}
                    >
                      ⠿
                    </button>
                    <button type="button" disabled={noteIndex === 0} onClick={() => moveNote(nota.id, -1)} className="h-7 w-7 rounded-lg border border-black/5 bg-white/80 text-xs text-slate-600 disabled:opacity-30 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-300" aria-label="Sposta nota prima">↑</button>
                    <button type="button" disabled={noteIndex === note.length - 1} onClick={() => moveNote(nota.id, 1)} className="h-7 w-7 rounded-lg border border-black/5 bg-white/80 text-xs text-slate-600 disabled:opacity-30 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-300" aria-label="Sposta nota dopo">↓</button>
                  </div>
                )}
                {/* Pin in alto */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2">
                  <div className={`w-3.5 h-3.5 rounded-full ${c.pin} shadow border border-white/70 dark:border-slate-800`} />
                </div>
                <div className={`absolute top-0 left-6 right-6 h-0.5 ${c.pin} opacity-40 rounded-full`} />

                {/* Titolo e contenuto */}
                {nota.title && <h3 className={`text-xs font-extrabold ${c.text} mb-2 leading-snug`}>{nota.title}</h3>}
                <p className={`text-xs ${c.text} leading-relaxed font-medium whitespace-pre-wrap break-words`}>{nota.content}</p>

                {/* Footer nota: Data + Azioni (sempre visibili su mobile e desktop) */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/5 dark:border-white/10">
                  <span className={`text-[10px] ${c.textMuted} font-semibold`}>{formatRelativeDate(nota.updatedAt)}</span>
                  {canManageNotes && (
                    <div className="flex items-center gap-1.5 opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => openEdit(nota)}
                        className="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs transition-colors cursor-pointer shadow-xs border border-black/5 dark:border-white/10"
                        title="Modifica"
                        aria-label="Modifica post-it"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingNota(nota)}
                        className="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-800/90 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-500 flex items-center justify-center text-xs transition-colors cursor-pointer shadow-xs border border-black/5 dark:border-white/10"
                        title="Elimina"
                        aria-label="Elimina post-it"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {canManageNotes && (
            <button
              type="button"
              onClick={openAdd}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#FF6B5F] hover:bg-[#FFF0ED]/40 dark:hover:bg-slate-800/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-400 hover:text-[#FF6B5F] transition-all cursor-pointer min-h-[120px] group"
            >
              <span className="text-2xl group-hover:scale-110 transition-transform">+</span>
              <span className="text-xs font-bold">Nuovo post-it</span>
            </button>
          )}
        </div>
      )}

      {/* Modale Creazione / Modifica Post-it */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 text-slate-900 dark:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">📝</span>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {editingNota ? 'Modifica Post-it' : 'Nuovo Post-it'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                Colore
              </label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFormColor(c.id)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold border-2 transition-all cursor-pointer ${c.bg} ${c.text} ${
                      formColor === c.id ? `${c.border} scale-105 shadow-sm` : 'border-transparent opacity-60'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Titolo (opzionale)
              </label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="es. Prima del volo..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F] bg-slate-50 dark:bg-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Testo *
              </label>
              <textarea
                rows={5}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Scrivi qui il tuo promemoria..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B5F] bg-slate-50 dark:bg-slate-900 placeholder:text-slate-400 resize-none leading-relaxed"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={!formContent.trim() || isSaving}
                onClick={handleSave}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#FF6B5F] hover:bg-[#fa5547] disabled:opacity-50 transition-all cursor-pointer shadow-sm"
              >
                {isSaving ? 'Salvataggio...' : editingNota ? 'Salva Modifiche' : 'Aggiungi Post-it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Eliminazione Post-it */}
      {deletingNota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setDeletingNota(null)}>
          <div
            className="w-full max-w-xs bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-2xl border border-rose-200 dark:border-rose-900 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Elimina post-it?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {deletingNota.title ? `"${deletingNota.title}"` : 'Questo post-it'} verrà eliminato definitivamente.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeletingNota(null)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deletingNota.id)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
