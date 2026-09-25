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
  const [cost, setCost] = useState('');
  const [category, setCategory] = useState<CategoriaAttivita>('cultura');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<StatoAttivita>('pianificata');
  
  // Campi secondari
  const [copilota, setCopilota] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const [customDate, setCustomDate] = useState('');

  useEffect(() => {
    if (initialData) {
      setDayId(initialData.dayId);
      const matchedDay = days.find(d => d.id === initialData.dayId);
      if (matchedDay) setCustomDate(matchedDay.date);
      setTitle(initialData.title);
      setTime(initialData.time || '');
      setCost(initialData.cost || '');
      setLocation(initialData.location);
      setCategory(initialData.category || 'cultura');
      setStatus(initialData.status);
      setCopilota(initialData.copilota || false);
      setQrCode(initialData.qrCode || '');
      setLink(initialData.link || '');
      setNotes(initialData.notes || '');
      if (initialData.qrCode || initialData.link || initialData.copilota) {
        setShowAdvanced(true);
      }
    } else {
      if (selectedDayId) {
        setDayId(selectedDayId);
        const matched = days.find(d => d.id === selectedDayId);
        if (matched) setCustomDate(matched.date);
      } else if (days[0]) {
        setDayId(days[0].id);
        setCustomDate(days[0].date);
      }
      setTitle('');
      setTime('');
      setCost('');
      setLocation('');
      setCategory('cultura');
      setStatus('pianificata');
      setCopilota(false);
      setQrCode('');
      setLink('');
      setNotes('');
      setShowAdvanced(false);
    }
  }, [initialData, selectedDayId, days]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalDayId = dayId;

    // Se l'utente ha inserito una data libera che non corrisponde a un giorno esistente
    if (customDate) {
      const existing = days.find(d => d.date === customDate);
      if (existing) {
        finalDayId = existing.id;
      } else {
        finalDayId = `day_${customDate}`;
      }
    }

    if (!finalDayId) {
      setError('Seleziona una data o un giorno per l\'attività.');
      return;
    }
    if (!title.trim()) {
      setError('Il titolo dell\'attività è obbligatorio.');
      return;
    }
    setError('');
    onSave({
      id: initialData?.id,
      dayId: finalDayId,
      title: title.trim(),
      time: time || undefined,
      cost: cost.trim() || undefined,
      location: location.trim() || title.trim(),
      category,
      status,
      copilota: copilota || undefined,
      qrCode: qrCode.trim() || undefined,
      attachments: initialData?.attachments,
      notes: notes.trim() || undefined,
      link: link.trim() || undefined
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          {error}
        </div>
      )}

      {/* Titolo Attività */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Titolo Attività *
        </label>
        <input
          type="text"
          placeholder="es. Visita al Museo del Novecento, Gita in barca"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
          required
        />
      </div>

      {/* Data e Orario */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Data Attività *
          </label>
          <input
            type="date"
            value={customDate}
            onChange={(e) => {
              const val = e.target.value;
              setCustomDate(val);
              const found = days.find(d => d.date === val);
              if (found) setDayId(found.id);
            }}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Orario (opzionale)
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors"
          />
        </div>
      </div>

      {/* Categoria e Costo */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Categoria *
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoriaAttivita)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors"
          >
            <option value="cultura">🏛️ Cultura & Musei</option>
            <option value="natura">🌿 Natura & Parchi</option>
            <option value="visita">🧭 Avventura & Tour</option>
            <option value="cibo">🍽️ Cibo & Degustazioni</option>
            <option value="relax">💆 Relax & Spiaggia</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Costo in € (opzionale)
          </label>
          <input
            type="text"
            placeholder="es. 40 € / Gratuito"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Località / Indirizzo */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Località / Luogo
        </label>
        <input
          type="text"
          placeholder="es. Piazza del Duomo 8, Milano"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
        />
      </div>

      {/* Note */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Note o dettagli (opzionale)
        </label>
        <textarea
          rows={2}
          placeholder="Dettagli biglietti, ingressi, prenotazioni..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-amber-500 placeholder:text-slate-400 resize-none"
        />
      </div>

      {/* Sezione Voucher / Link / Co-pilota (Richiudibile) */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer py-1"
        >
          <svg className={"w-4 h-4 transition-transform " + (showAdvanced ? 'rotate-90' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
          <span>{showAdvanced ? 'Meno opzioni (link, voucher QR)' : 'Aggiungi link/voucher o QR code'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-2.5 space-y-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 animate-fade-in">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Link o voucher web
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center justify-between">
                <span>Codice Biglietto / Testo per QR Code</span>
                <span className="text-[10px] text-amber-700 font-semibold lowercase">genera QR code scansionabile</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="es. TICKET-12345 o codice a barre"
                  value={qrCode}
                  onChange={(e) => setQrCode(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-amber-500 placeholder:text-slate-400 font-mono"
                />
                <span className="absolute left-3 top-2.5 text-xs text-amber-600">📱</span>
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between gap-3">
              <label htmlFor="copilota-att-toggle" className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
                <span>🧭</span>
                <span>Mostra al co-pilota</span>
              </label>
              <input
                id="copilota-att-toggle"
                type="checkbox"
                checked={copilota}
                onChange={(e) => setCopilota(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 bg-white border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-4 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
        >
          Annulla
        </button>
        <button
          type="submit"
          className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
        >
          {initialData ? 'Aggiorna Attività' : 'Salva Attività'}
        </button>
      </div>
    </form>
  );
}
