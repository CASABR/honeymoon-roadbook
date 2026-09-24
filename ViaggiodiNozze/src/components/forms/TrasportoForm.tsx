import { useState, useEffect } from 'react';
import type { Trasporto, TipoTrasporto, StatoTrasporto } from '../../types';

interface TrasportoFormProps {
  initialData?: Trasporto | null;
  onSave: (data: Omit<Trasporto, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function TrasportoForm({ initialData, onSave, onCancel }: TrasportoFormProps) {
  const [type, setType] = useState<TipoTrasporto>('volo');
  const [date, setDate] = useState('');
  const [departureLocation, setDepartureLocation] = useState('');
  const [arrivalLocation, setArrivalLocation] = useState('');
  const [status, setStatus] = useState<StatoTrasporto>('pianificato');

  // Campi facoltativi
  const [copilota, setCopilota] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cost, setCost] = useState('');
  const [dropoffDate, setDropoffDate] = useState('');
  const [dropoffTime, setDropoffTime] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [layoverAirport, setLayoverAirport] = useState('');
  const [layoverDuration, setLayoverDuration] = useState('');
  const [layoverArrivalTime, setLayoverArrivalTime] = useState('');
  const [layoverDepartureTime, setLayoverDepartureTime] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [carrier, setCarrier] = useState('');
  const [bookingCode, setBookingCode] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const isRental = type === 'auto' || type === 'camper';

  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setDate(initialData.date);
      setDepartureLocation(initialData.departureLocation);
      setArrivalLocation(initialData.arrivalLocation);
      setStatus(initialData.status);
      setCopilota(initialData.copilota || false);
      setCost(initialData.cost || '');
      setDropoffDate(initialData.dropoffDate || '');
      setDropoffTime(initialData.dropoffTime || '');
      setDropoffLocation(initialData.dropoffLocation || '');
      setLayoverAirport(initialData.layover?.airport || '');
      setLayoverDuration(initialData.layover?.duration || '');
      setLayoverArrivalTime(initialData.layover?.arrivalTime || '');
      setLayoverDepartureTime(initialData.layover?.departureTime || '');
      setDepartureTime(initialData.departureTime || '');
      setArrivalTime(initialData.arrivalTime || '');
      setCarrier(initialData.carrier || '');
      setBookingCode(initialData.bookingCode || '');
      setTicketUrl(initialData.ticketUrl || '');
      setNotes(initialData.notes || '');
      if (initialData.cost || initialData.layover || initialData.departureTime || initialData.arrivalTime || initialData.carrier || initialData.bookingCode || initialData.ticketUrl || initialData.notes || initialData.dropoffDate || initialData.dropoffTime || initialData.dropoffLocation || initialData.copilota) {
        setShowAdvanced(true);
      }
    } else {
      setType('volo');
      setDate(new Date().toISOString().split('T')[0]);
      setDepartureLocation('');
      setArrivalLocation('');
      setStatus('pianificato');
      setCopilota(false);
      setCost('');
      setDropoffDate('');
      setDropoffTime('');
      setDropoffLocation('');
      setLayoverAirport('');
      setLayoverDuration('');
      setLayoverArrivalTime('');
      setLayoverDepartureTime('');
      setDepartureTime('');
      setArrivalTime('');
      setCarrier('');
      setBookingCode('');
      setTicketUrl('');
      setNotes('');
      setShowAdvanced(false);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !departureLocation.trim()) {
      setError('Data e luogo di partenza/ritiro sono obbligatori.');
      return;
    }
    // Per noleggi, se arrivalLocation è vuoto ma dropoffLocation c'è, usa dropoffLocation
    const finalArrivalLocation = isRental ? (arrivalLocation.trim() || dropoffLocation.trim() || departureLocation.trim()) : arrivalLocation.trim();
    if (!finalArrivalLocation) {
      setError('Il luogo di arrivo o riconsegna è obbligatorio.');
      return;
    }

    setError('');
    onSave({
      id: initialData?.id,
      type,
      date,
      departureLocation: departureLocation.trim(),
      arrivalLocation: finalArrivalLocation,
      dropoffDate: isRental ? (dropoffDate || undefined) : undefined,
      dropoffTime: isRental ? (dropoffTime.trim() || undefined) : undefined,
      dropoffLocation: isRental ? (dropoffLocation.trim() || undefined) : undefined,
      status,
      copilota: copilota || undefined,
      cost: cost.trim() || undefined,
      layover: layoverAirport.trim()
        ? {
            airport: layoverAirport.trim(),
            duration: layoverDuration.trim() || undefined,
            arrivalTime: layoverArrivalTime.trim() || undefined,
            departureTime: layoverDepartureTime.trim() || undefined
          }
        : undefined,
      departureTime: departureTime.trim() || undefined,
      arrivalTime: arrivalTime.trim() || undefined,
      carrier: carrier.trim() || undefined,
      bookingCode: bookingCode.trim() || undefined,
      ticketUrl: ticketUrl.trim() || undefined,
      notes: notes.trim() || undefined
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Tipo Mezzo *
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TipoTrasporto)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500 transition-colors"
          >
            <option value="volo">✈️ Volo</option>
            <option value="traghetto">⛴️ Traghetto</option>
            <option value="camper">🚐 Camper / Campervan</option>
            <option value="auto">🚗 Auto / Noleggio</option>
            <option value="transfer">🚕 Taxi / Transfer</option>
            <option value="treno">🚄 Treno</option>
            <option value="bus">🚌 Bus</option>
            <option value="altro">Altro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            {isRental ? 'Data Ritiro (Pick-up) *' : 'Data Viaggio *'}
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500 transition-colors"
            required
          />
        </div>
      </div>

      {isRental ? (
        /* Box Ritiro & Riconsegna specifico per Noleggi */
        <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
          <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>🔑</span>
            <span>Dettagli Ritiro & Riconsegna</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Luogo Ritiro (Pick-up) *
              </label>
              <input
                type="text"
                placeholder="es. Auckland Apt"
                value={departureLocation}
                onChange={(e) => setDepartureLocation(e.target.value)}
                className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ora Ritiro
              </label>
              <input
                type="text"
                placeholder="es. 09:30"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Luogo Riconsegna (Drop-off)
              </label>
              <input
                type="text"
                placeholder="es. Christchurch Apt"
                value={dropoffLocation}
                onChange={(e) => {
                  setDropoffLocation(e.target.value);
                  setArrivalLocation(e.target.value);
                }}
                className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Data Riconsegna
              </label>
              <input
                type="date"
                value={dropoffDate}
                onChange={(e) => setDropoffDate(e.target.value)}
                className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Ora Riconsegna
            </label>
            <input
              type="text"
              placeholder="es. 12:30"
              value={dropoffTime}
              onChange={(e) => setDropoffTime(e.target.value)}
              className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      ) : (
        /* Campi Standard Tratta per Voli, Traghetti e Transfer */
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Partenza Da *
            </label>
            <input
              type="text"
              placeholder="es. Milano"
              value={departureLocation}
              onChange={(e) => setDepartureLocation(e.target.value)}
              className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Arrivo A *
            </label>
            <input
              type="text"
              placeholder="es. Auckland (AKL)"
              value={arrivalLocation}
              onChange={(e) => setArrivalLocation(e.target.value)}
              className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-500"
              required
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Stato Tratta *
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatoTrasporto)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500 transition-colors"
          >
            <option value="prenotato">Prenotato</option>
            <option value="da_prenotare">Da Prenotare</option>
            <option value="pianificato">Pianificato</option>
            <option value="completato">Completato</option>
            <option value="annullato">Annullato</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Costo / Note Pagamento
          </label>
          <input
            type="text"
            placeholder="es. 84,51 € / Incluso"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Opzione Co-pilota */}
      <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-base">🧭</span>
          <div>
            <label htmlFor="copilota-trasporto-toggle" className="text-xs font-semibold text-slate-200 cursor-pointer block">
              Mostra al co-pilota
            </label>
            <p className="text-[11px] text-slate-400">
              Segna questo spostamento come tratta o tappa rilevante per il co-pilota
            </p>
          </div>
        </div>
        <input
          id="copilota-trasporto-toggle"
          type="checkbox"
          checked={copilota}
          onChange={(e) => setCopilota(e.target.checked)}
          className="w-4 h-4 rounded text-sky-500 bg-slate-900 border-slate-700 focus:ring-sky-500 focus:ring-offset-slate-900 cursor-pointer"
        />
      </div>

      {/* Dettagli Avanzati */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer py-1"
        >
          <svg className={"w-4 h-4 transition-transform " + (showAdvanced ? 'rotate-90' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
          <span>{showAdvanced ? 'Nascondi orari e dettagli biglietto' : 'Aggiungi orari, vettore e codice PNR'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 animate-fade-in">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Orario / Note Partenza
                </label>
                <input
                  type="text"
                  placeholder="es. 08:30 / Mattina"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Orario / Note Arrivo
                </label>
                <input
                  type="text"
                  placeholder="es. 17:35 / 12:30 (15 Dic)"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Compagnia / Vettore
                </label>
                <input
                  type="text"
                  placeholder="es. Air China (CA783)"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Codice PNR / Prenotazione
                </label>
                <input
                  type="text"
                  placeholder="es. X8KORM"
                  value={bookingCode}
                  onChange={(e) => setBookingCode(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Aeroporto Scalo (se previsto)
                </label>
                <input
                  type="text"
                  placeholder="es. Pechino (PEK T3)"
                  value={layoverAirport}
                  onChange={(e) => setLayoverAirport(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Durata Attesa Scalo
                </label>
                <input
                  type="text"
                  placeholder="es. 18h 35m"
                  value={layoverDuration}
                  onChange={(e) => setLayoverDuration(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Inizio Scalo (Arrivo)
                </label>
                <input
                  type="text"
                  placeholder="es. 05:50 (30 Nov)"
                  value={layoverArrivalTime}
                  onChange={(e) => setLayoverArrivalTime(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Fine Scalo (Ripartenza)
                </label>
                <input
                  type="text"
                  placeholder="es. 00:25 (01 Dic)"
                  value={layoverDepartureTime}
                  onChange={(e) => setLayoverDepartureTime(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Link / Riferimento Biglietto
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
                className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Note operative (franchigie, biosicurezza...)
              </label>
              <textarea
                rows={2}
                placeholder="es. Dichiarare scarpe da trekking all'arrivo..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500 resize-none"
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
          className="min-h-[44px] px-6 rounded-xl text-sm font-semibold bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
        >
          {initialData ? 'Aggiorna Trasporto' : 'Salva Trasporto'}
        </button>
      </div>
    </form>
  );
}
