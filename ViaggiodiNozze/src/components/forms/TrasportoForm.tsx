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
  const [cost, setCost] = useState('');
  const [depositPaid, setDepositPaid] = useState('');
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
      setDepositPaid(initialData.depositPaid || initialData.acconto || '');
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
    } else {
      setType('volo');
      setDate(new Date().toISOString().split('T')[0]);
      setDepartureLocation('');
      setArrivalLocation('');
      setStatus('pianificato');
      setCopilota(false);
      setCost('');
      setDepositPaid('');
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
      depositPaid: depositPaid.trim() || undefined,
      acconto: depositPaid.trim() || undefined,
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
        <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          {error}
        </div>
      )}

      {/* Tipo di Trasporto (Sfoltito alle 5 categorie essenziali) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Tipo Mezzo *
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TipoTrasporto)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors"
          >
            <option value="volo">✈️ Volo</option>
            <option value="traghetto">⛴️ Traghetto</option>
            <option value="auto">🚗 Auto Noleggio</option>
            <option value="camper">🚐 Camper / Van</option>
            <option value="transfer">🚕 Transfer / Taxi</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Stato Prenotazione *
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatoTrasporto)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors"
          >
            <option value="prenotato">✅ Prenotato</option>
            <option value="da_prenotare">⏳ Da Prenotare</option>
            <option value="pianificato">📋 Pianificato</option>
            <option value="completato">🏁 Completato</option>
          </select>
        </div>
      </div>

      {isRental ? (
        /* ================= SEZIONE AUTO / CAMPER ================= */
        <div className="space-y-3.5">
          {/* Vettore / Società & Modello */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Società Noleggio *
              </label>
              <input
                type="text"
                placeholder="es. Snap Rentals, Hertz, Maui"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Modello Veicolo
              </label>
              <input
                type="text"
                placeholder="es. Toyota RAV4, 4-berth Van"
                value={bookingCode}
                onChange={(e) => setBookingCode(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Ritiro: Data, Ora, Luogo */}
          <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-2.5">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
              <span>🔑</span> Ritiro (Pick-up) *
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Data Ritiro *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-10 px-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Ora Ritiro</label>
                <input
                  type="text"
                  placeholder="es. 09:30"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="w-full h-10 px-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Luogo Ritiro *</label>
              <input
                type="text"
                placeholder="es. Auckland Airport Terminal o Indirizzo"
                value={departureLocation}
                onChange={(e) => setDepartureLocation(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
                required
              />
            </div>
          </div>

          {/* Riconsegna: Data, Ora, Luogo */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>🏁</span> Riconsegna (Drop-off)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Data Riconsegna</label>
                <input
                  type="date"
                  value={dropoffDate}
                  onChange={(e) => setDropoffDate(e.target.value)}
                  className="w-full h-10 px-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Ora Riconsegna</label>
                <input
                  type="text"
                  placeholder="es. 14:00"
                  value={dropoffTime}
                  onChange={(e) => setDropoffTime(e.target.value)}
                  className="w-full h-10 px-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Luogo Riconsegna</label>
              <input
                type="text"
                placeholder="es. Christchurch Airport"
                value={dropoffLocation}
                onChange={(e) => {
                  setDropoffLocation(e.target.value);
                  setArrivalLocation(e.target.value);
                }}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Economia noleggio: Costo totale, Acconto già versato, Saldo al banco */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Costo Totale (€ o valuta)
              </label>
              <input
                type="text"
                placeholder="es. 1.250 €"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Acconto Già Versato
              </label>
              <input
                type="text"
                placeholder="es. 282 € (518 NZD)"
                value={depositPaid}
                onChange={(e) => setDepositPaid(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-emerald-500 transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>
      ) : (
        /* ================= SEZIONE VOLO / TRAGHETTO / TRANSFER ================= */
        <div className="space-y-3.5">
          {/* Tratta: Partenza -> Arrivo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Partenza Da *
              </label>
              <input
                type="text"
                placeholder="es. Milano (MXP)"
                value={departureLocation}
                onChange={(e) => setDepartureLocation(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors placeholder:text-slate-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Arrivo A *
              </label>
              <input
                type="text"
                placeholder="es. Auckland (AKL)"
                value={arrivalLocation}
                onChange={(e) => setArrivalLocation(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors placeholder:text-slate-400"
                required
              />
            </div>
          </div>

          {/* Data, Orario Partenza e Orario Arrivo */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Data *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 px-2 sm:px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Ora Partenza
              </label>
              <input
                type="text"
                placeholder="es. 12:30"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="w-full h-11 px-2 sm:px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Ora Arrivo
              </label>
              <input
                type="text"
                placeholder="es. 05:40 (+1)"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="w-full h-11 px-2 sm:px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Vettore / Compagnia & Codice PNR */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Vettore / Compagnia
              </label>
              <input
                type="text"
                placeholder="es. Air China CA783, Bluebridge"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Codice PNR / Biglietto
              </label>
              <input
                type="text"
                placeholder="es. 7Y39XW"
                value={bookingCode}
                onChange={(e) => setBookingCode(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm font-mono focus:outline-none focus:bg-white focus:border-sky-500 transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Costo e Scalo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Costo (€ o valuta)
              </label>
              <input
                type="text"
                placeholder="es. 850 € / Incluso"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Scalo (opzionale)
              </label>
              <input
                type="text"
                placeholder="es. Pechino (PEK) 5h"
                value={layoverAirport}
                onChange={(e) => setLayoverAirport(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Note / Operative comuni */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Note operative (franchigie, ritiro chiavi, gate...)
        </label>
        <textarea
          rows={2}
          placeholder="es. Bagagli inclusi 23kg a testa, presentarsi al molo 45 min prima..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-sky-500 placeholder:text-slate-400 resize-none"
        />
      </div>

      {/* Opzione Co-pilota */}
      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
        <label htmlFor="copilota-trasporto-toggle" className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
          <span>🧭</span>
          <span>Mostra al co-pilota come rotta principale</span>
        </label>
        <input
          id="copilota-trasporto-toggle"
          type="checkbox"
          checked={copilota}
          onChange={(e) => setCopilota(e.target.checked)}
          className="w-4 h-4 rounded text-sky-600 bg-white border-slate-300 focus:ring-sky-500 cursor-pointer"
        />
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
          className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 shadow-md shadow-sky-500/20 transition-all cursor-pointer"
        >
          {initialData ? 'Aggiorna Trasporto' : 'Salva Trasporto'}
        </button>
      </div>
    </form>
  );
}
