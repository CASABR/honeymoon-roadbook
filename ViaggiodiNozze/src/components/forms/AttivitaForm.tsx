import { useState, useEffect } from 'react';
import { usePresence } from '../../hooks/usePresence';
import type { Attivita, CategoriaAttivita, StatoAttivita } from '../../types';
import { storageService } from '../../storage/storageService';

interface AttivitaFormProps {
  days: any[]; // mantenuto per retrocompatibilità prop, ma non usato logicamente
  selectedDayId?: string;
  initialData?: Attivita | null;
  onSave: (data: Omit<Attivita, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function AttivitaForm({ selectedDayId, initialData, onSave, onCancel }: AttivitaFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);

  const [title, setTitle] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  
  // Livello 2
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [category, setCategory] = useState<CategoriaAttivita>('cultura');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [link, setLink] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [copilota, setCopilota] = useState(false);
  const [copilotNotes, setCopilotNotes] = useState('');
  const [status, setStatus] = useState<StatoAttivita>('pianificata');
  
  const [error, setError] = useState('');
  const [conflictWarning, setConflictWarning] = useState('');
  const [isConflictConfirmed, setIsConflictConfirmed] = useState(false);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      const dateVal = initialData.date || (initialData.dayId.startsWith('day_') ? initialData.dayId.replace('day_', '') : '');
      setCustomDate(dateVal);
      setTime(initialData.time || '');
      setLocation(initialData.location);
      
      setCategory(initialData.category || 'cultura');
      setCost(initialData.cost || '');
      setNotes(initialData.notes || '');
      setLink(initialData.link || '');
      setQrCode(initialData.qrCode || '');
      setCopilota(initialData.copilota || false);
      setCopilotNotes(initialData.copilotNotes || '');
      setStatus(initialData.status);

      if (initialData.cost || initialData.notes || initialData.link || initialData.qrCode || initialData.copilotNotes) {
        setShowAdvanced(true);
      }
    } else {
      if (selectedDayId && selectedDayId.startsWith('day_')) {
        setCustomDate(selectedDayId.replace('day_', ''));
      } else if (selectedDayId && selectedDayId !== 'tutte') {
        setCustomDate(selectedDayId);
      } else {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setCustomDate(`${yyyy}-${mm}-${dd}`);
      }
      setTitle('');
      setTime('');
      setLocation('');
      setCategory('cultura');
      setCost('');
      setNotes('');
      setLink('');
      setQrCode('');
      setCopilota(false);
      setCopilotNotes('');
      setStatus('pianificata');
      setShowAdvanced(false);
    }
  }, [initialData, selectedDayId]);

  useEffect(() => {
    setIsConflictConfirmed(false);
    setConflictWarning('');
  }, [time, customDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customDate) {
      setError('Seleziona una data per l\'attività.');
      return;
    }
    if (!title.trim()) {
      setError('Il titolo dell\'attività è obbligatorio.');
      return;
    }

    // Validazione Sovrapposizione
    if (!isConflictConfirmed && time && customDate) {
      try {
        const timeline = await storageService.getTimelineForDate(customDate);
        const conflict = timeline.find(item => item.time === time && item.id !== initialData?.id);
        if (conflict) {
          setConflictWarning(`⚠️ Attenzione: hai già programmato "${conflict.title}" alle ${time}.`);
          setIsConflictConfirmed(true);
          return;
        }
      } catch (err) {
        console.error('Errore validazione sovrapposizione:', err);
      }
    }

    setError('');
    setConflictWarning('');

    const finalDayId = `day_${customDate}`;

    onSave({
      id: initialData?.id,
      dayId: finalDayId,
      date: customDate,
      title: title.trim(),
      time: time || undefined,
      location: location.trim(),
      category,
      cost: cost.trim() || undefined,
      notes: notes.trim() || undefined,
      link: link.trim() || undefined,
      qrCode: qrCode.trim() || undefined,
      copilota: (copilota || Boolean(copilotNotes.trim())) || undefined,
      copilotNotes: copilotNotes.trim() || undefined,
      status,
      attachments: initialData?.attachments
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {isLockedByOther && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl font-bold flex gap-2 items-center animate-fade-in">
          <span className="text-base animate-pulse">⚠️</span>
          <span>Attenzione: il dispositivo "{lockedBy}" sta già modificando questo elemento in tempo reale. Le tue modifiche potrebbero sovrascriversi.</span>
        </div>
      )}

      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          {error}
        </div>
      )}
      
      {conflictWarning && (
        <div className="p-3 text-xs rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          {conflictWarning}
          <div className="mt-1 font-semibold">Clicca di nuovo Salva per confermare comunque.</div>
        </div>
      )}

      {/* Livello 1: Essenziale */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Titolo Attività *
          </label>
          <input
            type="text"
            placeholder="es. Visita al Museo del Novecento"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-amber-500 transition-colors placeholder:text-slate-400"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Data *
            </label>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-amber-500 transition-colors"
              required
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Orario (opzionale)
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            📍 Indirizzo / Luogo
          </label>
          <input
            type="text"
            placeholder="es. Piazza del Duomo 8, Milano"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-amber-500 transition-colors placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Livello 2: Dettagli Aggiuntivi (Richiudibile) */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-bold text-amber-600 hover:text-amber-800 transition-colors cursor-pointer py-1 w-full justify-center bg-amber-50 rounded-xl h-10 border border-amber-200/60"
        >
          <span>{showAdvanced ? 'Nascondi Dettagli' : '+ Altri Dettagli (Costo, Note, Biglietti)'}</span>
          <svg className={"w-4 h-4 transition-transform " + (showAdvanced ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CategoriaAttivita)}
                  className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                >
                  <option value="cultura">🏛️ Cultura & Musei</option>
                  <option value="natura">🌿 Natura & Parchi</option>
                  <option value="visita">🧭 Avventura & Tour</option>
                  <option value="cibo">🍽️ Cibo & Degustazioni</option>
                  <option value="relax">💆 Relax & Spiaggia</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Costo in €
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={cost}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) setCost(val);
                  }}
                  className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Note Operative
              </label>
              <textarea
                rows={2}
                placeholder="Dettagli biglietti, raccomandazioni..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-amber-500 placeholder:text-slate-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
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
              <label className="block text-xs font-bold text-emerald-800 mb-1 flex items-center gap-1">
                <span>🧭</span>
                <span>Note del Co-pilota</span>
              </label>
              <textarea
                placeholder="Promemoria in tempo reale per il co-pilota..."
                value={copilotNotes}
                onChange={(e) => {
                  setCopilotNotes(e.target.value);
                  if (e.target.value.trim()) setCopilota(true);
                }}
                rows={2}
                className="w-full p-2.5 bg-emerald-50/40 border border-emerald-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-emerald-500 placeholder:text-emerald-600/60 leading-relaxed"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
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
          {initialData ? 'Aggiorna' : 'Salva Attività'}
        </button>
      </div>
    </form>
  );
}
