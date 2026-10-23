import React, { useState, useEffect } from 'react';
import { usePresence } from '../../hooks/usePresence';
import type { Trasporto, TipoTrasporto, StatoTrasporto } from '../../types';

interface TrasportoFormProps {
  initialData?: Trasporto | null;
  onSave: (data: Omit<Trasporto, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function TrasportoForm({ initialData, onSave, onCancel, onDelete }: TrasportoFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);

  const [type, setType] = useState<TipoTrasporto>('volo');
  
  // Carrier & PNR
  const [carrier, setCarrier] = useState('');
  const [bookingCode, setBookingCode] = useState('');

  // Partenza
  const [departureLocation, setDepartureLocation] = useState('');
  const [departureIata, setDepartureIata] = useState('');
  const [departureDate, setDepartureDate] = useState(''); // Usa datetime-local -> YYYY-MM-DDTHH:mm

  // Arrivo / Riconsegna
  const [arrivalLocation, setArrivalLocation] = useState('');
  const [arrivalIata, setArrivalIata] = useState('');
  const [arrivalDate, setArrivalDate] = useState(''); // Usa datetime-local -> YYYY-MM-DDTHH:mm

  // Condizionali Volo/Treno
  const [posti, setPosti] = useState('');
  const [bagagli, setBagagli] = useState('');
  const [hasLayover, setHasLayover] = useState(false);
  const [layoverAirport, setLayoverAirport] = useState('');
  const [layoverDuration, setLayoverDuration] = useState('');

  // Condizionali Noleggio

  // Condizionali Traghetto

  // Economico
  const [cost, setCost] = useState('');
  const [depositPaid, setDepositPaid] = useState('');
  const [isSaldato, setIsSaldato] = useState(false);
  const [packageIncluded, setPackageIncluded] = useState(false);

  // Extra
  const [ticketUrl, setTicketUrl] = useState('');
  const [terminalGate, setTerminalGate] = useState('');
  const [checkinCutoff, setCheckinCutoff] = useState('');
  const [noteCopilota, setNoteCopilota] = useState('');
  const [copilota, setCopilota] = useState(false);

  const [error, setError] = useState('');
  
  const isRental = type === 'auto' || type === 'camper';
    const isFlightOrTrain = type === 'volo' || type === 'treno';

  // Utils per manipolare date/ore
  const formatForInput = (d?: string, t?: string) => {
    if (!d) return '';
    return t ? `${d}T${t}` : `${d}T00:00`;
  };

  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setCarrier(initialData.carrier || '');
      setBookingCode(initialData.bookingCode || '');
      
      setDepartureLocation(initialData.departureLocation || '');
      setDepartureIata(initialData.departureIata || '');
      setDepartureDate(formatForInput(initialData.date, initialData.departureTime));
      
      if (isRental) {
        setArrivalLocation(initialData.dropoffLocation || initialData.arrivalLocation || '');
        setArrivalDate(formatForInput(initialData.dropoffDate, initialData.dropoffTime));
      } else {
        setArrivalLocation(initialData.arrivalLocation || '');
        setArrivalIata(initialData.arrivalIata || '');
        setArrivalDate(formatForInput(initialData.arrivalDate || initialData.date, initialData.arrivalTime));
      }

      setPosti(initialData.posti || '');
      setBagagli(initialData.bagagli || '');
      setHasLayover(!!initialData.layover?.airport);
      setLayoverAirport(initialData.layover?.airport || '');
      setLayoverDuration(initialData.layover?.duration || '');



      setCost(initialData.cost || '');
      setPackageIncluded(initialData.packageIncluded === true || (initialData.cost === 'Incluso' || initialData.cost === 'Incluso nel pacchetto'));
      const acconto = initialData.depositPaid || initialData.acconto || '';
      setDepositPaid(acconto);
      
      const c = parseFloat((initialData.cost || '0').replace(',', '.'));
      const a = parseFloat((acconto || '0').replace(',', '.'));
      if (c > 0 && a >= c) {
        setIsSaldato(true);
      } else {
        setIsSaldato(false);
      }

      setTicketUrl(initialData.ticketUrl || '');
      setTerminalGate(initialData.terminalGate || '');
      setCheckinCutoff(initialData.checkinCutoff || '');
      setNoteCopilota(initialData.noteCopilota || '');
      setCopilota(initialData.copilota || false);
    } else {
      setType('volo');
      setCarrier('');
      setBookingCode('');
      setDepartureLocation('');
      setDepartureIata('');
      setDepartureDate('');
      setArrivalLocation('');
      setArrivalIata('');
      setArrivalDate('');
      setPosti('');
      setBagagli('');
      setHasLayover(false);
      setLayoverAirport('');
      setLayoverDuration('');
      setCost('');
      setPackageIncluded(false);
      setDepositPaid('');
      setIsSaldato(false);
      setTicketUrl('');
      setTerminalGate('');
      setCheckinCutoff('');
      setNoteCopilota('');
      setCopilota(false);
    }
  }, [initialData, isRental]);

  useEffect(() => {
    if (isSaldato && cost) {
      setDepositPaid(cost);
    }
  }, [isSaldato, cost]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departureLocation.trim() || !departureDate) {
      setError('Partenza (Luogo e Data) sono obbligatori.');
      return;
    }
    
    let parsedDepDate = '';
    let parsedDepTime = '';
    if (departureDate) {
      const parts = departureDate.split('T');
      parsedDepDate = parts[0];
      parsedDepTime = parts[1] || '';
    }

    let parsedArrDate = '';
    let parsedArrTime = '';
    if (arrivalDate) {
      const parts = arrivalDate.split('T');
      parsedArrDate = parts[0];
      parsedArrTime = parts[1] || '';
    }

    setError('');
    
    const baseData = {
      id: initialData?.id,
      type,
      carrier: carrier.trim() || undefined,
      bookingCode: bookingCode.trim() || undefined,
      
      date: parsedDepDate,
      departureTime: parsedDepTime || undefined,
      departureLocation: departureLocation.trim(),
      departureIata: departureIata.trim() || undefined,
      
      cost: packageIncluded ? 'Incluso nel pacchetto' : (cost.trim() || undefined),
      packageIncluded,
      depositPaid: packageIncluded ? '0' : (depositPaid.trim() || undefined),
      acconto: packageIncluded ? '0' : (depositPaid.trim() || undefined),
      
      ticketUrl: ticketUrl.trim() || undefined,
      noteCopilota: noteCopilota.trim() || undefined,
      terminalGate: terminalGate.trim() || undefined,
      checkinCutoff: checkinCutoff.trim() || undefined,
      bagagli: bagagli.trim() || undefined,
      copilota: copilota || undefined,
      paymentStatus: (packageIncluded ? undefined : (isSaldato ? 'saldato' : 'da_saldare')) as any,
      status: (packageIncluded || isSaldato) ? 'completato' : (initialData?.status || 'prenotato') as StatoTrasporto,
    };

    if (isRental) {
      onSave({
        ...baseData,
        arrivalLocation: departureLocation.trim(),
        dropoffLocation: arrivalLocation.trim() || undefined,
        dropoffDate: parsedArrDate || undefined,
        dropoffTime: parsedArrTime || undefined,
      });
    } else {
      onSave({
        ...baseData,
        arrivalLocation: arrivalLocation.trim() || departureLocation.trim(),
        arrivalIata: arrivalIata.trim() || undefined,
        arrivalDate: parsedArrDate || parsedDepDate || undefined,
        arrivalTime: parsedArrTime || undefined,
        posti: posti.trim() || undefined,
        bagagli: bagagli.trim() || undefined,

        layover: (isFlightOrTrain && hasLayover && layoverAirport.trim()) ? {
          airport: layoverAirport.trim(),
          duration: layoverDuration.trim() || undefined,
        } : undefined
      });
    }
  };

  const getSaldo = () => {
    const c = parseFloat(cost.replace(',', '.')) || 0;
    const a = parseFloat(depositPaid.replace(',', '.')) || 0;
    return Math.max(0, c - a);
  };

  return (
    <div className="space-y-4">
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
            Sottocategoria
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'volo', label: '✈️ Aereo' },
              { id: 'treno', label: '🚆 Treno' },
              { id: 'auto', label: '🚗 Noleggio Auto' },
              { id: 'camper', label: '🚐 Camper' },
              { id: 'traghetto', label: '⛴️ Traghetto' },
              { id: 'transfer', label: '🚌 Bus / Transfer' }
            ].map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setType(cat.id as TipoTrasporto)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                  type === cat.id 
                    ? 'bg-slate-800 text-white border-slate-800 shadow-md' 
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Compagnia & Codice */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Compagnia / Vettore
            </label>
            <input
              type="text"
              placeholder="es. Air China, Hertz..."
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] transition-colors placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Volo / Modello (es. CA950, RAV4)
            </label>
            <input
              type="text"
              placeholder="..."
              value={bookingCode}
              onChange={(e) => setBookingCode(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] transition-colors placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* 4. Partenza */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            {isRental ? 'Partenza / Ritiro' : 'Partenza'}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <input
                type="text"
                placeholder="Stazione / Aeroporto / Luogo"
                value={departureLocation}
                onChange={(e) => setDepartureLocation(e.target.value)}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
                required
              />
            </div>
            <div className="sm:col-span-4">
              <input
                type="text"
                placeholder="Sigla IATA"
                value={departureIata}
                onChange={(e) => setDepartureIata(e.target.value)}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
              />
            </div>
          </div>
          <input
            type="datetime-local"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
            className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
            required
          />
        </div>

        {/* 5. Arrivo */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            {isRental ? 'Arrivo / Riconsegna' : 'Arrivo'}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <input
                type="text"
                placeholder="Stazione / Aeroporto / Luogo"
                value={arrivalLocation}
                onChange={(e) => setArrivalLocation(e.target.value)}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
              />
            </div>
            <div className="sm:col-span-4">
              <input
                type="text"
                placeholder="Sigla IATA"
                value={arrivalIata}
                onChange={(e) => setArrivalIata(e.target.value)}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
                disabled={isRental}
              />
            </div>
          </div>
          <input
            type="datetime-local"
            value={arrivalDate}
            onChange={(e) => setArrivalDate(e.target.value)}
            className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
          />
        </div>

        {/* 6. Campi Specifici (Aereo/Treno) */}
        {isFlightOrTrain && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Posti a sedere
                </label>
                <input
                  type="text"
                  placeholder="es. 14A, 14B"
                  value={posti}
                  onChange={(e) => setPosti(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Bagagli inclusi
                </label>
                <input
                  type="text"
                  placeholder="es. 2x23kg stiva"
                  value={bagagli}
                  onChange={(e) => setBagagli(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Volo con Scalo?
                </label>
                <input
                  type="checkbox"
                  checked={hasLayover}
                  onChange={(e) => setHasLayover(e.target.checked)}
                  className="w-4 h-4 rounded text-[#FF6B5F] bg-white border-slate-300 focus:ring-[#FF6B5F]"
                />
              </div>
              {hasLayover && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <input
                    type="text"
                    placeholder="Aeroporto Scalo (es. PEK)"
                    value={layoverAirport}
                    onChange={(e) => setLayoverAirport(e.target.value)}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
                  />
                  <input
                    type="text"
                    placeholder="Durata scalo (es. 2h 15m)"
                    value={layoverDuration}
                    onChange={(e) => setLayoverDuration(e.target.value)}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6. Campi Accesso & Operatività */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Terminal / Gate / Molo
            </label>
            <input
              type="text"
              placeholder="es. Terminal 1, Gate B2"
              value={terminalGate}
              onChange={(e) => setTerminalGate(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Cutoff Check-in (Orario Limite)
            </label>
            <input
              type="text"
              placeholder="es. Presentarsi entro le 18:00"
              value={checkinCutoff}
              onChange={(e) => setCheckinCutoff(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
            />
          </div>
        </div>

        {/* 7. Quadro Economico */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Quadro Economico
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs hover:bg-sky-50 transition-colors">
              <input
                type="checkbox"
                checked={packageIncluded}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setPackageIncluded(checked);
                  if (checked) {
                    setCost('Incluso');
                    setDepositPaid('0');
                    setIsSaldato(false);
                  } else {
                    setCost('');
                  }
                }}
                className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500"
              />
              <span className="text-xs font-bold text-sky-800">Incluso nel pacchetto</span>
            </label>
          </div>

          {!packageIncluded ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Costo Totale (€)
                  </label>
                  <input
                    type="text"
                    placeholder="es. 150.00"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm font-bold focus:outline-none focus:border-[#FF6B5F]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Acconto Versato (€)
                  </label>
                  <input
                    type="text"
                    placeholder="es. 50.00"
                    value={depositPaid}
                    onChange={(e) => {
                      setDepositPaid(e.target.value);
                      setIsSaldato(false);
                    }}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => {
                  const newVal = !isSaldato;
                  setIsSaldato(newVal);
                  if (newVal && cost) {
                    setDepositPaid(cost);
                  } else if (!newVal) {
                    setDepositPaid('0');
                  }
                }}>
                  <input
                    type="checkbox"
                    checked={isSaldato}
                    readOnly
                    className="w-4 h-4 rounded text-emerald-500 bg-white border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700">Saldato interamente</span>
                </div>
                {cost && (
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-slate-500 font-bold block">Saldo Rimanente</span>
                    <span className={`text-sm font-extrabold ${getSaldo() > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {getSaldo().toFixed(2)} €
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl text-xs text-sky-800 font-medium">
              ℹ️ Servizio coperto dal pacchetto di viaggio. Non genera costi autonomi nel bilancio e non richiede pagamenti separati.
            </div>
          )}
        </div>

        {/* 8. Link & Documento */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Link Biglietto / Voucher / Carta d'imbarco
          </label>
          <input
            type="url"
            placeholder="https://..."
            value={ticketUrl}
            onChange={(e) => setTicketUrl(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
          />
        </div>

        {/* 9. Note */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Note Copilota (Istruzioni Operative)
          </label>
          <textarea
            rows={2}
            placeholder="..."
            value={noteCopilota}
            onChange={(e) => setNoteCopilota(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F] resize-none"
          />
        </div>

        {/* Azioni finali */}
        <div className="flex flex-col sm:flex-row-reverse items-center justify-between gap-3 pt-3 border-t border-slate-100 mt-4">
          <button
            type="submit"
            className="w-full sm:w-auto min-w-[200px] min-h-[44px] px-6 rounded-xl text-sm font-bold bg-[#FF6B5F] hover:bg-[#e85c50] active:scale-95 text-white shadow-md shadow-rose-500/20 transition-all cursor-pointer"
          >
            {initialData ? 'Salva Modifiche' : 'Crea Trasporto'}
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
              Elimina trasporto
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
