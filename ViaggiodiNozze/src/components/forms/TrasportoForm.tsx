import { useState, useEffect } from 'react';
import type { Trasporto, TipoTrasporto, StatoTrasporto } from '../../types';

interface TrasportoFormProps {
  initialData?: Trasporto | null;
  onSave: (data: Omit<Trasporto, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function TrasportoForm({ initialData, onSave, onCancel }: TrasportoFormProps) {
  // Livello 1: Essenziali
  const [type, setType] = useState<TipoTrasporto>('volo');
  const [date, setDate] = useState('');
  const [departureLocation, setDepartureLocation] = useState('');
  const [arrivalLocation, setArrivalLocation] = useState('');
  
  // Noleggi Level 1 speciali
  const [dropoffDate, setDropoffDate] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [carrier, setCarrier] = useState('');

  // Livello 2: Dettagli
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [status, setStatus] = useState<StatoTrasporto>('pianificato');
  const [copilota, setCopilota] = useState(false);
  const [cost, setCost] = useState('');
  const [depositPaid, setDepositPaid] = useState('');
  
  // Orari (potrebbero stare nel livello 1 o 2, mettiamo quelli principali nell'1)
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [dropoffTime, setDropoffTime] = useState('');
  
  // Altri dettagli volo/treno
  const [bookingCode, setBookingCode] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [notes, setNotes] = useState('');
  
  // Scalo
  const [layoverAirport, setLayoverAirport] = useState('');
  
  const [error, setError] = useState('');

  const isRental = type === 'auto' || type === 'camper';

  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setDate(initialData.date);
      setDepartureLocation(initialData.departureLocation);
      setArrivalLocation(initialData.arrivalLocation);
      
      setDropoffDate(initialData.dropoffDate || '');
      setDropoffLocation(initialData.dropoffLocation || '');
      setCarrier(initialData.carrier || '');
      
      setStatus(initialData.status);
      setCopilota(initialData.copilota || false);
      setCost(initialData.cost || '');
      setDepositPaid(initialData.depositPaid || initialData.acconto || '');
      
      setDepartureTime(initialData.departureTime || '');
      setArrivalTime(initialData.arrivalTime || '');
      setDropoffTime(initialData.dropoffTime || '');
      
      setBookingCode(initialData.bookingCode || '');
      setTicketUrl(initialData.ticketUrl || '');
      setNotes(initialData.notes || '');
      setLayoverAirport(initialData.layover?.airport || '');

      if (
        initialData.cost || initialData.depositPaid || initialData.acconto || 
        initialData.bookingCode || initialData.ticketUrl || initialData.notes || 
        initialData.layover?.airport || initialData.copilota || 
        initialData.arrivalTime || initialData.dropoffTime || initialData.status !== 'pianificato'
      ) {
        setShowAdvanced(true);
      }
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      
      setType('volo');
      setDate(`${yyyy}-${mm}-${dd}`);
      setDepartureLocation('');
      setArrivalLocation('');
      
      setDropoffDate('');
      setDropoffLocation('');
      setCarrier('');
      
      setStatus('pianificato');
      setCopilota(false);
      setCost('');
      setDepositPaid('');
      
      setDepartureTime('');
      setArrivalTime('');
      setDropoffTime('');
      
      setBookingCode('');
      setTicketUrl('');
      setNotes('');
      setLayoverAirport('');
      setShowAdvanced(false);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !departureLocation.trim()) {
      setError('Data e luogo di partenza/ritiro sono obbligatori.');
      return;
    }
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
          }
        : undefined,
      departureTime: departureTime.trim() || undefined,
      arrivalTime: arrivalTime.trim() || undefined,
      carrier: carrier.trim() || undefined,
      bookingCode: bookingCode.trim() || undefined,
      ticketUrl: ticketUrl.trim() || undefined,
      notes: notes.trim() || undefined
    } as any);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          {error}
        </div>
      )}

      {/* Livello 1: Essenziale */}
      <div className="space-y-4">
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
            <option value="treno">🚆 Treno</option>
            <option value="traghetto">⛴️ Traghetto</option>
            <option value="auto">🚗 Auto Noleggio</option>
            <option value="camper">🚐 Camper / Van</option>
            <option value="transfer">🚕 Transfer / Taxi</option>
          </select>
        </div>

        {isRental ? (
          <>
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
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Data Ritiro *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Ora Ritiro (opzionale)
                </label>
                <input
                  type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Luogo Ritiro *
              </label>
              <input
                type="text"
                placeholder="es. Auckland Airport Terminal"
                value={departureLocation}
                onChange={(e) => setDepartureLocation(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
                required
              />
            </div>
          </>
        ) : (
          <>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Data *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Ora Partenza
                </label>
                <input
                  type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-sky-500 transition-colors"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Livello 2: Dettagli Aggiuntivi (Richiudibile) */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-1.5 text-xs font-bold hover:opacity-80 transition-opacity cursor-pointer py-1 w-full justify-center rounded-xl h-10 border ${
            isRental ? 'bg-amber-50 text-amber-600 border-amber-200/60' : 'bg-sky-50 text-sky-600 border-sky-200/60'
          }`}
        >
          <span>{showAdvanced ? 'Nascondi Dettagli' : '+ Altri Dettagli (Costo, Ticket, Check-out, Note)'}</span>
          <svg className={"w-4 h-4 transition-transform " + (showAdvanced ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 animate-fade-in">
            {/* Stato Prenotazione (comune) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Stato Prenotazione
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatoTrasporto)}
                className={`w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none transition-colors ${
                  isRental ? 'focus:border-amber-500' : 'focus:border-sky-500'
                }`}
              >
                <option value="prenotato">✅ Prenotato</option>
                <option value="da_prenotare">⏳ Da Prenotare</option>
                <option value="pianificato">📋 Pianificato</option>
                <option value="completato">🏁 Completato</option>
              </select>
            </div>

            {isRental ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Data Riconsegna
                    </label>
                    <input
                      type="date"
                      value={dropoffDate}
                      onChange={(e) => setDropoffDate(e.target.value)}
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Ora Riconsegna
                    </label>
                    <input
                      type="time"
                      value={dropoffTime}
                      onChange={(e) => setDropoffTime(e.target.value)}
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Luogo Riconsegna
                  </label>
                  <input
                    type="text"
                    placeholder="es. Christchurch Airport"
                    value={dropoffLocation}
                    onChange={(e) => {
                      setDropoffLocation(e.target.value);
                      setArrivalLocation(e.target.value);
                    }}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Costo Totale (€)
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
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Acconto Versato
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      pattern="[0-9]*"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={depositPaid}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) setDepositPaid(val);
                      }}
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-400"
                    />
                  </div>
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
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-400"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Vettore / Compagnia
                    </label>
                    <input
                      type="text"
                      placeholder="es. Air China CA783"
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Ora Arrivo
                    </label>
                    <input
                      type="time"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-400"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Costo (€)
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
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Codice PNR / Ticket
                    </label>
                    <input
                      type="text"
                      placeholder="es. 7Y39XW"
                      value={bookingCode}
                      onChange={(e) => setBookingCode(e.target.value)}
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm font-mono focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-400"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Scalo (opzionale)
                  </label>
                  <input
                    type="text"
                    placeholder="es. Pechino (PEK)"
                    value={layoverAirport}
                    onChange={(e) => setLayoverAirport(e.target.value)}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-400"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Note operative
              </label>
              <textarea
                rows={2}
                placeholder="es. Bagagli inclusi 23kg, presentarsi 45 min prima..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`w-full p-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none placeholder:text-slate-400 resize-none ${
                  isRental ? 'focus:border-amber-500' : 'focus:border-sky-500'
                }`}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <label htmlFor="copilota-trasporto-toggle" className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
                <span>🧭</span>
                <span>Mostra al co-pilota come rotta principale</span>
              </label>
              <input
                id="copilota-trasporto-toggle"
                type="checkbox"
                checked={copilota}
                onChange={(e) => setCopilota(e.target.checked)}
                className={`w-4 h-4 rounded bg-white border-slate-300 cursor-pointer ${
                  isRental ? 'text-amber-600 focus:ring-amber-500' : 'text-sky-600 focus:ring-sky-500'
                }`}
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
          className={`min-h-[44px] px-6 rounded-xl text-sm font-bold active:scale-95 shadow-md transition-all cursor-pointer ${
            isRental 
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20' 
              : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20'
          }`}
        >
          {initialData ? 'Aggiorna Trasporto' : 'Salva Trasporto'}
        </button>
      </div>
    </form>
  );
}
