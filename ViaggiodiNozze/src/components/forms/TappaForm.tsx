import React, { useState, useEffect } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { getCoordinatesFromAddress } from '../../utils/mapsHelper';
import type { Tappa } from '../../types';

interface TappaFormProps {
  initialData?: Tappa | null;
  onSave: (data: Omit<Tappa, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function TappaForm({ initialData, onSave, onCancel, onDelete }: TappaFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);

  const [sottocategoria, setSottocategoria] = useState('Sosta panoramica');
  const [titolo, setTitolo] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [noteCopilota, setNoteCopilota] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);

  useEffect(() => {
    if (initialData) {
      setSottocategoria(initialData.sottocategoria || 'Sosta panoramica');
      setTitolo(initialData.titolo || '');
      setIndirizzo(initialData.indirizzo || initialData.mapsUrl || '');
      setNoteCopilota(initialData.noteCopilota || '');
      setNota(initialData.nota || '');
    } else {
      setSottocategoria('Sosta panoramica');
      setTitolo('');
      setIndirizzo('');
      setNoteCopilota('');
      setNota('');
    }
  }, [initialData]);

  const processSave = async () => {
    setError('');
    setIsGeocoding(true);

    let finalCoord = initialData?.coordinate;
    
    // Geocoding basato sull'indirizzo se fornito
    if (indirizzo && indirizzo.trim()) {
      try {
        const coord = await getCoordinatesFromAddress(indirizzo);
        if (coord) {
          finalCoord = coord;
        } else if (!finalCoord && titolo.trim()) {
          const fallbackCoord = await getCoordinatesFromAddress(titolo);
          if (fallbackCoord) finalCoord = fallbackCoord;
        }
      } catch (e) {
        console.error("Geocoding fallito", e);
      }
    } else if (titolo.trim() && !finalCoord) {
       try {
         const coord = await getCoordinatesFromAddress(titolo);
         if (coord) finalCoord = coord;
       } catch(e) {}
    }

    setIsGeocoding(false);
    
    // Auto-imposta copilota se ci sono note copilota
    const hasCopilotaNotes = (noteCopilota || '').trim().length > 0;

    onSave({
      id: initialData?.id,
      titolo: titolo.trim(),
      sottocategoria: sottocategoria.trim() || undefined,
      indirizzo: indirizzo.trim() || undefined,
      mapsUrl: indirizzo.trim() || undefined, // manteniamo mapsUrl allineato con indirizzo per retrocompatibilità
      coordinate: finalCoord,
      noteCopilota: noteCopilota.trim() || undefined,
      nota: nota.trim() || undefined,
      copilota: hasCopilotaNotes || initialData?.copilota || undefined,
      data: initialData?.data,
      dayId: initialData?.dayId,
      completed: initialData?.completed
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titolo.trim()) {
      setError('Il titolo/nome della sosta è obbligatorio.');
      return;
    }
    processSave();
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

      {/* 1. Sottocategoria */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Categoria Sosta
        </label>
        <select
          value={sottocategoria}
          onChange={(e) => setSottocategoria(e.target.value)}
          className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
        >
          <option value="Sosta panoramica">⛰️ Sosta panoramica</option>
          <option value="Sosta fotografica">📸 Sosta fotografica</option>
          <option value="Sosta">📍 Sosta generica</option>
        </select>
      </div>

      {/* 2. Nome / Titolo */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Nome / Punto di Interesse
        </label>
        <input
          type="text"
          placeholder="es. Lake Pukaki Viewpoint"
          value={titolo}
          onChange={(e) => setTitolo(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] transition-colors"
          required
        />
      </div>

      {/* 3. Indirizzo / Posizione */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Indirizzo / Link Maps
        </label>
        <input
          type="text"
          placeholder="es. State Highway 8, Lake Pukaki"
          value={indirizzo}
          onChange={(e) => setIndirizzo(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] transition-colors"
        />
      </div>

      {/* 4. Note Copilota */}
      <div className="p-3 bg-[#F0FAF9] border border-[#DDF4F5] rounded-2xl">
        <label className="flex items-center gap-1.5 text-xs font-extrabold text-[#172033] uppercase tracking-wider mb-1.5">
          <span>🧭</span> Note per il Copilota (Guida)
        </label>
        <textarea
          rows={3}
          placeholder="es. Parcheggio gratuito a sinistra dopo il ponte. Attenzione al fondo sterrato."
          value={noteCopilota}
          onChange={(e) => setNoteCopilota(e.target.value)}
          className="w-full p-3 bg-white border border-[#DDF4F5] rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F] resize-none"
        />
      </div>

      {/* 5. Note Generali */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Note Generali / Orario
        </label>
        <textarea
          rows={2}
          placeholder="Dettagli aggiuntivi..."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] resize-none"
        />
      </div>

      {/* Azioni finali */}
      <div className="flex flex-col sm:flex-row-reverse items-center justify-between gap-3 pt-3 border-t border-slate-100 mt-4">
        <button
          type="submit"
          disabled={isGeocoding}
          className="w-full sm:w-auto min-w-[200px] min-h-[44px] px-6 rounded-xl text-sm font-bold bg-[#FF6B5F] hover:bg-[#e85c50] active:scale-95 text-white shadow-md shadow-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
        >
          {isGeocoding ? 'Salvataggio...' : (initialData ? 'Salva Modifiche' : 'Crea Tappa')}
        </button>
        
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
        >
          Annulla
        </button>

        {onDelete && initialData && (
          <button
            type="button"
            onClick={onDelete}
            className="w-full sm:w-auto mt-4 sm:mt-0 min-h-[44px] px-4 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
          >
            Elimina tappa
          </button>
        )}
      </div>

    </form>
  );
}
