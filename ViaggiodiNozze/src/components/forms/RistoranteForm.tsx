import { useState, useEffect } from 'react';
import { usePresence } from '../../hooks/usePresence';
import type { Ristorante } from '../../types';
import { storageService } from '../../storage/storageService';

interface RistoranteFormProps {
  initialData?: Ristorante | null;
  onSave: (data: Omit<Ristorante, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function RistoranteForm({ initialData, onSave, onCancel }: RistoranteFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);

  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [orario, setOrario] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  
  // Livello 2
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [budget, setBudget] = useState('');
  const [linkPrenotazione, setLinkPrenotazione] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nota, setNota] = useState('');
  const [copilota, setCopilota] = useState(false);
  
  const [error, setError] = useState('');
  const [conflictWarning, setConflictWarning] = useState('');
  const [isConflictConfirmed, setIsConflictConfirmed] = useState(false);

  useEffect(() => {
    if (initialData) {
      setNome(initialData.nome);
      setData(initialData.data || '');
      setOrario(initialData.orario || '');
      setIndirizzo(initialData.indirizzo || '');
      
      setBudget(initialData.budget || '');
      setLinkPrenotazione(initialData.linkPrenotazione || '');
      setTelefono(initialData.telefono || '');
      setNota(initialData.nota || '');
      setCopilota(initialData.copilota || false);

      if (initialData.budget || initialData.linkPrenotazione || initialData.telefono || initialData.nota || initialData.copilota) {
        setShowAdvanced(true);
      }
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      
      setNome('');
      setData(`${yyyy}-${mm}-${dd}`);
      setOrario('');
      setIndirizzo('');
      setBudget('');
      setLinkPrenotazione('');
      setTelefono('');
      setNota('');
      setCopilota(false);
      setShowAdvanced(false);
    }
  }, [initialData]);

  useEffect(() => {
    setIsConflictConfirmed(false);
    setConflictWarning('');
  }, [orario, data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setError('Il nome del ristorante è obbligatorio.');
      return;
    }
    if (!data) {
      setError('La data è obbligatoria.');
      return;
    }

    // Validazione Sovrapposizione
    if (!isConflictConfirmed && orario && data) {
      try {
        const timeline = await storageService.getTimelineForDate(data);
        const conflict = timeline.find(item => item.time === orario && item.id !== initialData?.id);
        if (conflict) {
          setConflictWarning(`⚠️ Attenzione: hai già programmato "${conflict.title}" alle ${orario}.`);
          setIsConflictConfirmed(true);
          return;
        }
      } catch (err) {
        console.error('Errore validazione sovrapposizione:', err);
      }
    }

    setError('');
    setConflictWarning('');
    
    // Assicuriamo l'esistenza del dayId implicito basato sulla data
    const dayId = `day_${data}`;

    onSave({
      id: initialData?.id,
      dayId: dayId,
      nome: nome.trim(),
      data: data,
      orario: orario || undefined,
      indirizzo: indirizzo.trim() || undefined,
      budget: budget.trim() || undefined,
      linkPrenotazione: linkPrenotazione.trim() || undefined,
      telefono: telefono.trim() || undefined,
      coordinate: initialData?.coordinate,
      nota: nota.trim() || undefined,
      copilota: copilota || undefined
    } as any);
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
            Nome Locale / Ristorante *
          </label>
          <input
            type="text"
            placeholder="es. Fergburger, Starita Milano"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
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
              value={data}
              onChange={(e) => setData(e.target.value)}
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
              value={orario}
              onChange={(e) => setOrario(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            📍 Indirizzo / Città o Link Maps
          </label>
          <input
            type="text"
            placeholder="es. Shotover St, Queenstown o link Maps"
            value={indirizzo}
            onChange={(e) => setIndirizzo(e.target.value)}
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
          <span>{showAdvanced ? 'Nascondi Dettagli' : '+ Altri Dettagli (Costo, Note, Link)'}</span>
          <svg className={"w-4 h-4 transition-transform " + (showAdvanced ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Budget stimato (€)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={budget}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) setBudget(val);
                  }}
                  className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-400"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Link Prenotazione
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={linkPrenotazione}
                  onChange={(e) => setLinkPrenotazione(e.target.value)}
                  className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Note / Dettagli prenotazione
              </label>
              <textarea
                rows={2}
                placeholder="es. Tavolo prenotato a nome Mario, piatti consigliati..."
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-amber-500 placeholder:text-slate-400 resize-none"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <label htmlFor="copilota-ristorante-toggle" className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
                <span>🧭</span>
                <span>Mostra al co-pilota per pause pranzo/cena</span>
              </label>
              <input
                id="copilota-ristorante-toggle"
                type="checkbox"
                checked={copilota}
                onChange={(e) => setCopilota(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 bg-white border-slate-300 focus:ring-emerald-500 cursor-pointer"
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
          {initialData ? 'Aggiorna Ristorante' : 'Salva Ristorante'}
        </button>
      </div>
    </form>
  );
}
