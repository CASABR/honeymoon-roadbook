import React, { useState, useEffect, useRef } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { getCoordinatesFromAddress, extractMapsUrlFromText } from '../../utils/mapsHelper';
import { storageService } from '../../storage/storageService';
import { isPasseggiataActivity } from '../../utils/activityType';
import DestinationSearchModal from '../modals/DestinationSearchModal';
import type { Tappa, Attivita, Coordinate, OpeningHoursInfo, TimeStatus } from '../../types';
import PlaceAutocompleteInput from '../common/PlaceAutocompleteInput';
import type { PlaceSuggestion } from '../../services/photonService';
import TimePickerInput from '../common/TimePickerInput';
import OpeningHoursFields from '../common/OpeningHoursFields';

interface TappaFormProps {
  initialData?: Tappa | null;
  defaultDate?: string;
  defaultTime?: string;
  onSave: (data: Omit<Tappa, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function TappaForm({ initialData, defaultDate, defaultTime, onSave, onCancel, onDelete }: TappaFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);

  const [data, setData] = useState(() => initialData?.data || (initialData as any)?.date || defaultDate || new Date().toISOString().split('T')[0]);
  const [sottocategoria, setSottocategoria] = useState(() => initialData?.sottocategoria || 'Tappa');
  const [passeggiataId, setPasseggiataId] = useState<string | undefined>(() => initialData?.passeggiataId);
  const [availablePasseggiate, setAvailablePasseggiate] = useState<Attivita[]>([]);
  const [titolo, setTitolo] = useState('');
  const [orario, setOrario] = useState('');
  const [timeStatus, setTimeStatus] = useState<TimeStatus>(initialData?.timeStatus || 'confermato');
  const [indirizzo, setIndirizzo] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [coordinate, setCoordinate] = useState<Coordinate | undefined>(() => initialData?.coordinate);
  const [noteCopilota, setNoteCopilota] = useState('');
  const [nota, setNota] = useState('');
  const [openingHours, setOpeningHours] = useState<OpeningHoursInfo | undefined>(() => initialData?.openingHours);
  const [error, setError] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  useEffect(() => {
    storageService.getActivities().then(activities => {
      const list = activities.filter(a => {
        const matchesDate = a.date === data || a.dayId === `day_${data}`;
        return matchesDate && isPasseggiataActivity(a);
      });
      setAvailablePasseggiate(list);
    }).catch(() => {});
  }, [data]);

  const initializedIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const currentId = initialData?.id || '__new__';
    if (initializedIdRef.current === currentId) {
      return;
    }
    initializedIdRef.current = currentId;

    if (initialData) {
      setData(initialData.data || (initialData as any)?.date || defaultDate || new Date().toISOString().split('T')[0]);
      setSottocategoria(initialData.sottocategoria || 'Tappa');
      setPasseggiataId(initialData.passeggiataId);
      setTitolo(initialData.titolo || '');
      setOrario(initialData.orario || (initialData as any).time || '');
      setTimeStatus(initialData.timeStatus || 'confermato');
      setIndirizzo(initialData.indirizzo || '');
      setMapsUrl(initialData.mapsUrl || '');
      setNoteCopilota(initialData.noteCopilota || '');
      setNota(initialData.nota || '');
      setOpeningHours(initialData.openingHours);
    } else {
      setData(defaultDate || new Date().toISOString().split('T')[0]);
      setSottocategoria('Tappa');
      setPasseggiataId(undefined);
      setTitolo('');
      setOrario(defaultTime || '');
      setTimeStatus('confermato');
      setIndirizzo('');
      setMapsUrl('');
      setNoteCopilota('');
      setNota('');
      setOpeningHours(undefined);
    }
  }, [defaultDate, defaultTime, initialData]);

  const handleSelectPlace = (place: PlaceSuggestion) => {
    setTitolo(place.title);
    if (place.address) {
      setIndirizzo(place.address);
    }
    if (place.coordinate) {
      setCoordinate(place.coordinate);
    }
    if (place.rawLocalItem) {
      const raw = place.rawLocalItem;
      if (raw.noteCopilota && !noteCopilota) setNoteCopilota(raw.noteCopilota);
      if (raw.nota && !nota) setNota(raw.nota);
    }
  };

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
    const dateClean = data.trim() || undefined;

    onSave({
      id: initialData?.id,
      titolo: titolo.trim(),
      sottocategoria: sottocategoria.trim() || undefined,
      passeggiataId: passeggiataId || undefined,
      orario: orario.trim() || undefined,
      time: orario.trim() || undefined,
      timeStatus: orario.trim() ? timeStatus : undefined,
      indirizzo: indirizzo.trim() || undefined,
      mapsUrl: mapsUrl.trim() || undefined,
      coordinate: finalCoord,
      noteCopilota: noteCopilota.trim() || undefined,
      nota: nota.trim() || undefined,
      copilota: hasCopilotaNotes || initialData?.copilota || undefined,
      data: dateClean,
      date: dateClean,
      dayId: dateClean ? `day_${dateClean}` : initialData?.dayId,
      completed: initialData?.completed,
      openingHours
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
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-xl font-bold flex gap-2 items-center animate-fade-in">
          <span className="text-base animate-pulse">⚠️</span>
          <span>Attenzione: il dispositivo "{lockedBy}" sta già modificando questo elemento in tempo reale. Le tue modifiche potrebbero sovrascriversi.</span>
        </div>
      )}

      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* 1. Data, Sottocategoria & Orario */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
            📅 Data
          </label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-full h-11 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#FF6B5F]"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
            Categoria Sosta
          </label>
          <select
            value={sottocategoria || 'Tappa'}
            onChange={(e) => setSottocategoria(e.target.value)}
            className="w-full h-11 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#FF6B5F]"
          >
            <option value="Tappa">📍 Tappa</option>
            <option value="Sosta panoramica">⛰️ Sosta panoramica</option>
            <option value="Spot fotografico">📸 Spot fotografico</option>
            <option value="Sosta fotografica">📸 Sosta fotografica</option>
            <option value="Sosta">📍 Sosta generica</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              ⏰ Orario (HH:mm)
            </label>
            {orario && (
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setTimeStatus('confermato')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    timeStatus === 'confermato'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  ✓ Confermato
                </button>
                <button
                  type="button"
                  onClick={() => setTimeStatus('indicativo')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    timeStatus === 'indicativo'
                      ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  ~ Indicativo
                </button>
              </div>
            )}
          </div>
          <TimePickerInput value={orario} onChange={setOrario} ariaLabel="Orario tappa" />
        </div>
      </div>

      {/* 2. Nome / Titolo con Autocomplete Integrato */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Cerca o digita luogo
          </span>
          <button
            type="button"
            onClick={() => setIsSearchModalOpen(true)}
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
          >
            <span>🔍</span>
            <span>Ricerca Avanzata &amp; Confronto</span>
          </button>
        </div>
        <PlaceAutocompleteInput
          value={titolo}
          onChange={setTitolo}
          onSelectPlace={handleSelectPlace}
          label="Nome / Punto di Interesse"
          placeholder="es. Lake Pukaki Viewpoint, Cape Reinga..."
          required
        />
      </div>

      {/* 3. Indirizzo e Link Maps separati */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
            Indirizzo / Luogo leggibile
          </label>
          <input
            type="text"
            placeholder="es. Bridge of Remembrance, Oxford Terrace"
            value={indirizzo}
            onChange={(e) => {
              const extracted = extractMapsUrlFromText(e.target.value);
              if (extracted.mapsUrl) {
                setIndirizzo(extracted.cleanText);
                setMapsUrl(extracted.mapsUrl);
              } else {
                setIndirizzo(e.target.value);
              }
            }}
            className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-750 focus:border-[#FF6B5F] transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
            Link Google Maps (separato)
          </label>
          <input
            type="url"
            placeholder="es. https://maps.app.goo.gl/... o https://www.google.com/maps/..."
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-750 focus:border-[#FF6B5F] transition-colors"
          />
        </div>
      </div>

      {/* Collegamento a Passeggiata contenitore (opzionale) */}
      {availablePasseggiate.length > 0 && (
        <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl">
          <label className="block text-xs font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider mb-1.5">
            🚶 Collega a Passeggiata del giorno (facoltativo)
          </label>
          <select
            value={passeggiataId || ''}
            onChange={(e) => setPasseggiataId(e.target.value || undefined)}
            className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#FF6B5F]"
          >
            <option value="">Nessuna (Tappa indipendente)</option>
            {availablePasseggiate.map(p => (
              <option key={p.id} value={p.id}>🚶 {p.title} {p.time ? `(${p.time})` : ''}</option>
            ))}
          </select>
          <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-1">
            Se collegata, questa tappa viene inclusa nella card della Passeggiata ed evitata come duplicato nella timeline.
          </p>
        </div>
      )}

      <OpeningHoursFields value={openingHours} onChange={setOpeningHours} date={data} time={orario} />

      {/* 4. Note Copilota */}
      <div className="p-3 bg-[#F0FAF9] dark:bg-slate-800/80 border border-[#DDF4F5] dark:border-slate-700 rounded-2xl">
        <label className="flex items-center gap-1.5 text-xs font-extrabold text-[#172033] dark:text-slate-200 uppercase tracking-wider mb-1.5">
          <span>🧭</span> Note per il Copilota (Guida)
        </label>
        <textarea
          rows={3}
          placeholder="es. Parcheggio gratuito a sinistra dopo il ponte. Attenzione al fondo sterrato."
          value={noteCopilota}
          onChange={(e) => setNoteCopilota(e.target.value)}
          className="w-full p-3 bg-white dark:bg-slate-900 border border-[#DDF4F5] dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#FF6B5F] resize-none"
        />
      </div>

      {/* 5. Note Generali */}
      <div>
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
          Note Generali
        </label>
        <textarea
          rows={2}
          placeholder="Dettagli aggiuntivi..."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-750 focus:border-[#FF6B5F] resize-none"
        />
      </div>

      {/* Azioni finali */}
      <div className="flex flex-col sm:flex-row-reverse items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 mt-4">
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
          className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
        >
          Annulla
        </button>

        {onDelete && initialData && (
          <button
            type="button"
            onClick={onDelete}
            className="w-full sm:w-auto mt-4 sm:mt-0 min-h-[44px] px-4 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 transition-all cursor-pointer"
          >
            Elimina tappa
          </button>
        )}
      </div>

      {/* Modale Ricerca Meta Gratuita OpenStreetMap */}
      <DestinationSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        entityType="tappa"
        initialQuery={titolo || indirizzo}
        currentValues={{
          name: titolo,
          address: indirizzo,
          coordinate: coordinate
        }}
        onApply={(applied) => {
          if (applied.name) setTitolo(applied.name);
          if (applied.address) setIndirizzo(applied.address);
          if (applied.coordinate) setCoordinate(applied.coordinate);
        }}
      />

    </form>
  );
}
