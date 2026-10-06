import React, { useState, useEffect } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { getCoordinatesFromAddress } from '../../utils/mapsHelper';
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
  const [sottocategoria, setSottocategoria] = useState<Ristorante['sottocategoria'] | ''>('');
  const [data, setData] = useState('');
  const [orario, setOrario] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [linkPrenotazione, setLinkPrenotazione] = useState('');
  const [budget, setBudget] = useState('');
  const [nota, setNota] = useState('');
  
  const [error, setError] = useState('');
  const [conflictWarning, setConflictWarning] = useState('');
  const [isConflictConfirmed, setIsConflictConfirmed] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const SOTTOCATEGORIE: Ristorante['sottocategoria'][] = ['Colazione', 'Pranzo', 'Cena', 'Aperitivo', 'Street Food', 'Altro'];
  const BUDGET_OPTIONS = ['$', '$$', '$$$'];

  useEffect(() => {
    if (initialData) {
      setNome(initialData.nome || '');
      setSottocategoria(initialData.sottocategoria || '');
      setData(initialData.data || '');
      setOrario(initialData.orario || '');
      setIndirizzo(initialData.indirizzo || '');
      setTelefono(initialData.telefono || '');
      setLinkPrenotazione(initialData.linkPrenotazione || '');
      setBudget(initialData.budget || '');
      setNota(initialData.nota || '');
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      
      setNome('');
      setSottocategoria('');
      setData(`${yyyy}-${mm}-${dd}`);
      setOrario('');
      setIndirizzo('');
      setTelefono('');
      setLinkPrenotazione('');
      setBudget('');
      setNota('');
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
    
    const dayId = `day_${data}`;
    setIsGeocoding(true);
    let finalCoord = initialData?.coordinate;

    if (indirizzo && indirizzo.trim()) {
      try {
        const coord = await getCoordinatesFromAddress(indirizzo);
        if (coord) {
          finalCoord = coord;
        } else if (!finalCoord) {
          const fallbackCoord = await getCoordinatesFromAddress(nome);
          if (fallbackCoord) finalCoord = fallbackCoord;
        }
      } catch (e) {
        console.error("Geocoding fallito", e);
      }
    } else if (nome.trim() && !finalCoord) {
       try {
         const coord = await getCoordinatesFromAddress(nome);
         if (coord) finalCoord = coord;
       } catch(e) {}
    }

    setIsGeocoding(false);

    onSave({
      id: initialData?.id,
      dayId: dayId,
      nome: nome.trim(),
      sottocategoria: sottocategoria || undefined,
      data: data,
      orario: orario || undefined,
      indirizzo: indirizzo.trim() || undefined,
      telefono: telefono.trim() || undefined,
      linkPrenotazione: linkPrenotazione.trim() || undefined,
      budget: budget.trim() || undefined,
      nota: nota.trim() || undefined,
      coordinate: finalCoord,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-4">
      {isLockedByOther && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl font-bold flex gap-2 items-center animate-fade-in">
          <span className="text-base animate-pulse">⚠️</span>
          <span>Attenzione: il dispositivo "{lockedBy}" sta già modificando questo elemento. Le tue modifiche potrebbero sovrascriversi.</span>
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
          <div className="mt-1 font-semibold">Clicca di nuovo Salva per confermare.</div>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Nome Locale / Ristorante *
        </label>
        <input
          type="text"
          placeholder="es. Da Mario"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#172033] transition-colors placeholder:text-slate-400"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Sottocategoria
        </label>
        <div className="flex flex-wrap gap-2">
          {SOTTOCATEGORIE.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSottocategoria(cat === sottocategoria ? '' : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                cat === sottocategoria
                  ? 'bg-[#172033] text-white border-[#172033]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Data Prenotazione *
          </label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#172033] transition-colors"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Ora Prenotazione
          </label>
          <input
            type="time"
            value={orario}
            onChange={(e) => setOrario(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#172033] transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Indirizzo / Posizione Maps
        </label>
        <input
          type="text"
          placeholder="Via Roma 1, Milano"
          value={indirizzo}
          onChange={(e) => setIndirizzo(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#172033] transition-colors placeholder:text-slate-400"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Telefono
          </label>
          <input
            type="tel"
            placeholder="+39 123 456..."
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#172033] transition-colors placeholder:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Link Menu / Web
          </label>
          <input
            type="url"
            placeholder="https://..."
            value={linkPrenotazione}
            onChange={(e) => setLinkPrenotazione(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#172033] transition-colors placeholder:text-slate-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Budget / Prezzo medio
        </label>
        <div className="flex items-center gap-2">
          {BUDGET_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setBudget(opt)}
              className={`w-12 h-10 rounded-xl text-sm font-semibold transition-colors border ${
                budget === opt
                  ? 'bg-[#172033] text-white border-[#172033]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {opt}
            </button>
          ))}
          <input
            type="text"
            placeholder="o inserisci testo libero (es. 35€)"
            value={!BUDGET_OPTIONS.includes(budget) ? budget : ''}
            onChange={(e) => setBudget(e.target.value)}
            className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#172033] transition-colors placeholder:text-slate-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Note Aggiuntive / Piatti consigliati
        </label>
        <textarea
          rows={3}
          placeholder="Da assaggiare assolutamente..."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#172033] placeholder:text-slate-400 resize-none transition-colors"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 px-6 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={isGeocoding}
          className={`h-12 px-8 rounded-xl text-sm font-bold bg-[#172033] hover:bg-[#1a2436] active:scale-95 text-white shadow-lg transition-all ${isGeocoding ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {isGeocoding ? 'Salvataggio...' : 'Salva Ristorante'}
        </button>
      </div>
    </form>
  );
}
