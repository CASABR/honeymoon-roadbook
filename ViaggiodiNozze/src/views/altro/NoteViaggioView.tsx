import { useState, useEffect } from 'react';
import type { NotaViaggio, ColorNota } from '../../types';
import { storageService } from '../../storage/storageService';
import { useDeviceRole } from '../../utils/useDeviceRole';

interface NoteViaggioViewProps {
  onBack?: () => void;
}

const COLOR_OPTIONS = [
  { id: 'amber' as ColorNota, label: 'Giallo', bg: 'bg-amber-50', border: 'border-amber-200', pin: 'bg-amber-400', text: 'text-amber-950', textMuted: 'text-amber-700' },
  { id: 'sky' as ColorNota, label: 'Azzurro', bg: 'bg-sky-50', border: 'border-sky-200', pin: 'bg-sky-400', text: 'text-sky-950', textMuted: 'text-sky-700' },
  { id: 'emerald' as ColorNota, label: 'Verde', bg: 'bg-emerald-50', border: 'border-emerald-200', pin: 'bg-emerald-400', text: 'text-emerald-950', textMuted: 'text-emerald-700' },
  { id: 'rose' as ColorNota, label: 'Rosa', bg: 'bg-rose-50', border: 'border-rose-200', pin: 'bg-rose-400', text: 'text-rose-950', textMuted: 'text-rose-700' },
];

const SEED_NOTE: NotaViaggio[] = [
  { id: 'nota_seed_1', title: 'Prima del volo', content: 'Adattatori presa AU/NZ (tipo I), passaporti fisici, patente internazionale!', color: 'amber', createdAt: Date.now() - 3000, updatedAt: Date.now() - 3000 },
  { id: 'nota_seed_2', title: 'SIM e Dati', content: "Acquistare eSIM Airalo o Spark all'arrivo ad Auckland T1. Piano dati: almeno 10 GB.", color: 'sky', createdAt: Date.now() - 2000, updatedAt: Date.now() - 2000 },
  { id: 'nota_seed_3', title: 'Souvenir da prendere', content: 'Miele di Manuka in NZ, Opali a Sydney, Perle a Palawan.', color: 'rose', createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000 },
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
  if (mins < 60) return mins + ' min fa';
  if (hours < 24) return hours + 'h fa';
  return days + 'g fa';
}

export default function NoteViaggioView({ onBack }: NoteViaggioViewProps) {
  const { canEdit } = useDeviceRole();
  const [note, setNote] = useState<NotaViaggio[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNota, setEditingNota] = useState<NotaViaggio | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formColor, setFormColor] = useState<ColorNota>('amber');
  const [deletingNota, setDeletingNota] = useState<NotaViaggio | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadNote = async () => {
    try {
      setLoading(true);
      let items = await storageService.getNote();
      if (items.length === 0) {
        for (const seed of SEED_NOTE) {
          await storageService.saveNota(seed);
        }
        items = await storageService.getNote();
      }
      setNote(items);
    } catch (err) {
      console.error('[NoteViaggioView] Errore:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadNote(); }, []);
  useEffect(() => {
    const handler = () => loadNote();
    window.addEventListener('roadbook_data_mutated', handler);
    return () => window.removeEventListener('roadbook_data_mutated', handler);
  }, []);

  const openAdd = () => { setEditingNota(null); setFormTitle(''); setFormContent(''); setFormColor('amber'); setIsModalOpen(true); };
  const openEdit = (nota: NotaViaggio) => { setEditingNota(nota); setFormTitle(nota.title || ''); setFormContent(nota.content); setFormColor(nota.color); setIsModalOpen(true); };

  const handleSave = async () => {
    if (!formContent.trim()) return;
    setIsSaving(true);
    try {
      const item: NotaViaggio = {
        id: editingNota?.id || ('nota_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
        title: formTitle.trim() || undefined,
        content: formContent.trim(),
        color: formColor,
        createdAt: editingNota?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      await storageService.saveNota(item);
      setIsModalOpen(false);
      await loadNote();
    } catch (err) {
      console.error('[NoteViaggioView] Errore salvataggio:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await storageService.deleteNota(id);
      setDeletingNota(null);
      await loadNote();
    } catch (err) {
      console.error('[NoteViaggioView] Errore eliminazione:', err);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-20">
      <header className="flex items-center justify-between mb-5 px-1">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>&#x1F4DD;</span> Note di Viaggio
            </h1>
            <p className="text-xs text-slate-500 font-medium">Bacheca post-it</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openAdd} className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-md shadow-amber-500/25 transition-all cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
            <span>Nuovo Post-it</span>
          </button>
        )}
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[200px]">
          <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : note.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16 px-4">
          <div className="text-6xl">&#x1F4DD;</div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-700">Nessuna nota ancora</p>
            <p className="text-xs text-slate-400 mt-1">Aggiungi promemoria, idee e appunti di viaggio</p>
          </div>
          {canEdit && (
            <button onClick={openAdd} className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold rounded-xl transition-colors cursor-pointer">
              + Aggiungi il primo post-it
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {note.map((nota) => {
            const c = getColorConfig(nota.color);
            const rotation = ((nota.id.charCodeAt(nota.id.length - 1) % 5) - 2);
            return (
              <div
                key={nota.id}
                className={'relative ' + c.bg + ' ' + c.border + ' border rounded-2xl p-4 pt-5 shadow-sm hover:shadow-md transition-all group'}
                style={{ transform: 'rotate(' + rotation + 'deg)', transformOrigin: 'center' }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2">
                  <div className={'w-3.5 h-3.5 rounded-full ' + c.pin + ' shadow border border-white/70'} />
                </div>
                <div className={'absolute top-0 left-6 right-6 h-0.5 ' + c.pin + ' opacity-40 rounded-full'} />
                {nota.title && <h3 className={'text-xs font-extrabold ' + c.text + ' mb-2 leading-snug'}>{nota.title}</h3>}
                <p className={'text-xs ' + c.text + ' leading-relaxed font-medium whitespace-pre-wrap break-words'}>{nota.content}</p>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/5">
                  <span className={'text-[10px] ' + c.textMuted + ' font-semibold'}>{formatRelativeDate(nota.updatedAt)}</span>
                  {canEdit && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => openEdit(nota)} className="w-6 h-6 rounded-lg bg-white/70 hover:bg-white text-slate-600 flex items-center justify-center text-[10px] transition-colors cursor-pointer shadow-sm" title="Modifica">&#x270F;&#xFE0F;</button>
                      <button type="button" onClick={() => setDeletingNota(nota)} className="w-6 h-6 rounded-lg bg-white/70 hover:bg-rose-100 text-rose-500 flex items-center justify-center text-[10px] transition-colors cursor-pointer shadow-sm" title="Elimina">&#x1F5D1;&#xFE0F;</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {canEdit && (
            <button onClick={openAdd} className="border-2 border-dashed border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-amber-600 transition-all cursor-pointer min-h-[120px] group">
              <span className="text-2xl group-hover:scale-110 transition-transform">+</span>
              <span className="text-xs font-bold">Nuovo post-it</span>
            </button>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200/80 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">&#x1F4DD;</span>
                <h2 className="text-sm font-extrabold text-slate-900">{editingNota ? 'Modifica Post-it' : 'Nuovo Post-it'}</h2>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold cursor-pointer">x</button>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">Colore</label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map(c => (
                  <button key={c.id} type="button" onClick={() => setFormColor(c.id)} className={'flex-1 py-2 rounded-xl text-[10px] font-bold border-2 transition-all cursor-pointer ' + c.bg + ' ' + c.text + ' ' + (formColor === c.id ? c.border + ' scale-105 shadow-sm' : 'border-transparent opacity-60')}>{c.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Titolo (opzionale)</label>
              <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="es. Prima del volo..." className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-slate-50 placeholder:text-slate-400" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Testo *</label>
              <textarea rows={5} value={formContent} onChange={e => setFormContent(e.target.value)} placeholder="Scrivi qui il tuo promemoria..." className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-slate-50 placeholder:text-slate-400 resize-none leading-relaxed" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer">Annulla</button>
              <button type="button" disabled={!formContent.trim() || isSaving} onClick={handleSave} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-all cursor-pointer shadow-sm">{isSaving ? 'Salvataggio...' : editingNota ? 'Salva Modifiche' : 'Aggiungi Post-it'}</button>
            </div>
          </div>
        </div>
      )}

      {deletingNota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDeletingNota(null)}>
          <div className="w-full max-w-xs bg-white rounded-3xl p-5 shadow-2xl border border-rose-200 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-4xl mb-3">&#x1F5D1;&#xFE0F;</div>
              <h3 className="text-sm font-extrabold text-slate-900">Elimina post-it?</h3>
              <p className="text-xs text-slate-500 mt-1">{deletingNota.title ? ('"' + deletingNota.title + '"') : 'Questo post-it'} verra eliminato definitivamente.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeletingNota(null)} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer">Annulla</button>
              <button type="button" onClick={() => handleDelete(deletingNota.id)} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer">Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}