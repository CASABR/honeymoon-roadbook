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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [carrier, setCarrier] = useState('');
  const [bookingCode, setBookingCode] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setDate(initialData.date);
      setDepartureLocation(initialData.departureLocation);
      setArrivalLocation(initialData.arrivalLocation);
      setStatus(initialData.status);
      setDepartureTime(initialData.departureTime || '');
      setArrivalTime(initialData.arrivalTime || '');
      setCarrier(initialData.carrier || '');
      setBookingCode(initialData.bookingCode || '');
      setTicketUrl(initialData.ticketUrl || '');
      setNotes(initialData.notes || '');
      if (initialData.departureTime || initialData.arrivalTime || initialData.carrier || initialData.bookingCode || initialData.ticketUrl || initialData.notes) {
        setShowAdvanced(true);
      }
    } else {
      setType('volo');
      setDate(new Date().toISOString().split('T')[0]);
      setDepartureLocation('');
      setArrivalLocation('');
      setStatus('pianificato');
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
    if (!date || !departureLocation.trim() || !arrivalLocation.trim()) {
      setError('Data, luogo di partenza e luogo di arrivo sono obbligatori.');
      return;
    }
    setError('');
    onSave({
      id: initialData?.id,
      type,
      date,
      departureLocation: departureLocation.trim(),
      arrivalLocation: arrivalLocation.trim(),
      status,
      departureTime: departureTime || undefined,
      arrivalTime: arrivalTime || undefined,
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
            <option value="treno">🚄 Treno</option>
            <option value="auto">🚗 Auto / Noleggio</option>
            <option value="bus">🚌 Bus</option>
            <option value="traghetto">⛴️ Traghetto</option>
            <option value="transfer">🚕 Taxi / Transfer</option>
            <option value="altro">Altro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Data Viaggio *
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Partenza Da *
          </label>
          <input
            type="text"
            placeholder="es. Roma Fiumicino (FCO)"
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
            placeholder="es. Tokyo Haneda (HND)"
            value={arrivalLocation}
            onChange={(e) => setArrivalLocation(e.target.value)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-500"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
          Stato Tratta *
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatoTrasporto)}
          className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500 transition-colors"
        >
          <option value="pianificato">Pianificato</option>
          <option value="prenotato">Prenotato</option>
          <option value="completato">Completato</option>
          <option value="annullato">Annullato</option>
        </select>
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
          <span>{showAdvanced ? 'Nascondi orari e riferimenti biglietto' : 'Aggiungi orari, compagnia e codice prenotazione'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 animate-fade-in">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Orario Partenza
                </label>
                <input
                  type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Orario Arrivo
                </label>
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500"
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
                  placeholder="es. ANA / Shinkansen"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Codice / Tratta
                </label>
                <input
                  type="text"
                  placeholder="es. NH216 / Treno 35"
                  value={bookingCode}
                  onChange={(e) => setBookingCode(e.target.value)}
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
                Note o coincidenze
              </label>
              <textarea
                rows={2}
                placeholder="es. Terminal 3, franchigia bagagli 23kg..."
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
