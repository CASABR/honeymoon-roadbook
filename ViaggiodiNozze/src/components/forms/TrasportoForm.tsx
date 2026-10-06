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
  const [depositoCauzionale, setDepositoCauzionale] = useState('');
  const [franchigia, setFranchigia] = useState('');
  const [politicaCarburante, setPoliticaCarburante] = useState('');

  // Condizionali Traghetto
  const [sistemazioneTraghetto, setSistemazioneTraghetto] = useState('');
  const [veicoloTraghetto, setVeicoloTraghetto] = useState('');

  // Economico
  const [cost, setCost] = useState('');
  const [depositPaid, setDepositPaid] = useState('');
  const [isSaldato, setIsSaldato] = useState(false);

  // Extra
  const [ticketUrl, setTicketUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [copilota, setCopilota] = useState(false);

  const [error, setError] = useState('');
  
  const isRental = type === 'auto' || type === 'camper';
  const isFerry = type === 'traghetto';
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

      setDepositoCauzionale(initialData.depositoCauzionale || '');
      setFranchigia(initialData.franchigia || '');
      setPoliticaCarburante(initialData.politicaCarburante || '');

      setSistemazioneTraghetto(initialData.sistemazioneTraghetto || '');
      setVeicoloTraghetto(initialData.veicoloTraghetto || '');

      setCost(initialData.cost || '');
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
      setNotes(initialData.notes || '');
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
      setDepositoCauzionale('');
      setFranchigia('');
      setPoliticaCarburante('');
      setSistemazioneTraghetto('');
      setVeicoloTraghetto('');
      setCost('');
      setDepositPaid('');
      setIsSaldato(false);
      setTicketUrl('');
      setNotes('');
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
      
      cost: cost.trim() || undefined,
      depositPaid: depositPaid.trim() || undefined,
      acconto: depositPaid.trim() || undefined,
      
      ticketUrl: ticketUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      copilota: copilota || undefined,
      status: initialData?.status || 'pianificato' as StatoTrasporto,
    };

    if (isRental) {
      onSave({
        ...baseData,
        arrivalLocation: departureLocation.trim(),
        dropoffLocation: arrivalLocation.trim() || undefined,
        dropoffDate: parsedArrDate || undefined,
        dropoffTime: parsedArrTime || undefined,
        depositoCauzionale: depositoCauzionale.trim() || undefined,
        franchigia: franchigia.trim() || undefined,
        politicaCarburante: politicaCarburante.trim() || undefined,
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
        sistemazioneTraghetto: isFerry ? (sistemazioneTraghetto.trim() || undefined) : undefined,
        veicoloTraghetto: isFerry ? (veicoloTraghetto.trim() || undefined) : undefined,
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

        {/* 6. Campi Specifici (Noleggio) */}
        {isRental && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Cauzione / Deposito
              </label>
              <input
                type="text"
                placeholder="es. Carta Credito 500€"
                value={depositoCauzionale}
                onChange={(e) => setDepositoCauzionale(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Franchigia / Assicuraz.
              </label>
              <input
                type="text"
                placeholder="es. Kasko Totale"
                value={franchigia}
                onChange={(e) => setFranchigia(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Carburante
              </label>
              <input
                type="text"
                placeholder="es. Pieno/Pieno"
                value={politicaCarburante}
                onChange={(e) => setPoliticaCarburante(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
              />
            </div>
          </div>
        )}

        {/* 6. Campi Specifici (Traghetto) */}
        {isFerry && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Sistemazione
              </label>
              <input
                type="text"
                placeholder="es. Cabina esterna, Ponte"
                value={sistemazioneTraghetto}
                onChange={(e) => setSistemazioneTraghetto(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Veicolo a bordo
              </label>
              <input
                type="text"
                placeholder="es. Auto targa AA123BB"
                value={veicoloTraghetto}
                onChange={(e) => setVeicoloTraghetto(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
              />
            </div>
          </div>
        )}

        {/* 7. Quadro Economico */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">
            Quadro Economico
          </label>
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
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsSaldato(!isSaldato)}>
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
            Note / Promemoria
          </label>
          <textarea
            rows={2}
            placeholder="..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
