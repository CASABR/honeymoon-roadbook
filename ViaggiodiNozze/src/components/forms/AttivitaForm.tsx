import { useState, useEffect } from 'react';
import type { Attivita, Giorno, CategoriaAttivita, StatoAttivita } from '../../types';

interface AttivitaFormProps {
  days: Giorno[];
  selectedDayId?: string;
  initialData?: Attivita | null;
  onSave: (data: Omit<Attivita, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function AttivitaForm({ days, selectedDayId, initialData, onSave, onCancel }: AttivitaFormProps) {
  const [dayId, setDayId] = useState(selectedDayId || (days[0]?.id || ''));
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<CategoriaAttivita>('visita');
  const [status, setStatus] = useState<StatoAttivita>('pianificata');
  
  // Campi avanzati / opzionali
  const [copilota, setCopilota] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setDayId(initialData.dayId);
      setTitle(initialData.title);
      setTime(initialData.time || '');
      setLocation(initialData.location);
      setCategory(initialData.category);
      setStatus(initialData.status);
      setCopilota(initialData.copilota || false);
      setDuration(initialData.duration || '');
      setNotes(initialData.notes || '');
      setLink(initialData.link || '');
      if (initialData.duration || initialData.notes || initialData.link || initialData.copilota) {
        setShowAdvanced(true);
      }
    } else {
      if (selectedDayId) setDayId(selectedDayId);
      setTitle('');
      setTime('');
      setLocation('');
      setCategory('visita');
      setStatus('pianificata');
      setCopilota(false);
      setDuration('');
      setNotes('');
      setLink('');
      setShowAdvanced(false);
    }
  }, [initialData, selectedDayId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dayId) {
      setError('Seleziona il giorno associato.');
      return;
    }
    if (!title.trim() || !location.trim()) {
      setError('Titolo e località sono obbligatori.');
      return;
    }
    setError('');
    onSave({
      id: initialData?.id,
      dayId,
      title: title.trim(),
      time: time || undefined,
      location: location.trim(),
      category,
      status,
      copilota: copilota || undefined,
      duration: duration.trim() || undefined,
      notes: notes.trim() || undefined,
      link: link.trim() || undefined
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
          Giorno Associato *
        </label>
        <select
          value={dayId}
          onChange={(e) => setDayId(e.target.value)}
          className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-amber-500 transition-colors"
          required
        >
          {days.length === 0 && <option value="">Nessun giorno presente</option>}
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              {d.date} – {d.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
          Titolo Attività *
        </label>
        <input
          type="text"
          placeholder="es. Visita al tempio Senso-ji"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Orario (opzionale)
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Categoria *
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoriaAttivita)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="visita">Visita / Tour</option>
            <option value="cibo">Cibo & Ristorante</option>
            <option value="relax">Relax & Benessere</option>
            <option value="natura">Natura & Trekking</option>
            <option value="cultura">Cultura & Musei</option>
            <option value="shopping">Shopping</option>
            <option value="altro">Altro</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Località *
          </label>
          <input
            type="text"
            placeholder="es. Asakusa"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Stato *
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatoAttivita)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="pianificata">Pianificata</option>
            <option value="completata">Completata</option>
            <option value="annullata">Annullata</option>
          </select>
        </div>
      </div>

      {/* Opzione Co-pilota */}
      <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-base">🧭</span>
          <div>
            <label htmlFor="copilota-att-toggle" className="text-xs font-semibold text-slate-200 cursor-pointer block">
              Mostra al co-pilota
            </label>
            <p className="text-[11px] text-slate-400">
              Segna questa attività come tappa rilevante per il co-pilota di bordo
            </p>
          </div>
        </div>
        <input
          id="copilota-att-toggle"
          type="checkbox"
          checked={copilota}
          onChange={(e) => setCopilota(e.target.checked)}
          className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer"
        />
      </div>

      {/* Dettagli Opzionali Richiudibili */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer py-1"
        >
          <svg className={"w-4 h-4 transition-transform " + (showAdvanced ? 'rotate-90' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
          <span>{showAdvanced ? 'Nascondi dettagli avanzati' : 'Mostra dettagli avanzati (durata, link, note)'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 animate-fade-in">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Durata stimata (es. 2 ore)
              </label>
              <input
                type="text"
                placeholder="es. 1h 30m"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-500 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Link o sito web utile
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-500 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Note o suggerimenti
              </label>
              <textarea
                rows={2}
                placeholder="Dettagli biglietti, orari di apertura..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-500 placeholder:text-slate-500 resize-none"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer"
        >
          Annulla
        </button>
        <button
          type="submit"
          className="min-h-[44px] px-6 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
        >
          {initialData ? 'Aggiorna Attività' : 'Salva Attività'}
        </button>
      </div>
    </form>
  );
}
