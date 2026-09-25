import { useState, useEffect } from 'react';
import type { Alloggio, StatoAlloggio } from '../../types';

interface AlloggioFormProps {
  initialData?: Alloggio | null;
  onSave: (data: Omit<Alloggio, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function AlloggioForm({ initialData, onSave, onCancel }: AlloggioFormProps) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [address, setAddress] = useState('');
  const [cost, setCost] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'saldato' | 'da_saldare'>('saldato');
  const [bookingUrl, setBookingUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [copilota, setCopilota] = useState(false);
  const [status, setStatus] = useState<StatoAlloggio>('prenotato');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setLocation(initialData.location);
      setCheckIn(initialData.checkIn);
      setCheckInTime(initialData.checkInTime || '');
      setCheckOut(initialData.checkOut);
      setCheckOutTime(initialData.checkOutTime || '');
      setAddress(initialData.address);
      setCost(initialData.cost || '');
      setPaymentStatus(initialData.paymentStatus || 'saldato');
      setBookingUrl(initialData.bookingUrl || '');
      setNotes(initialData.notes || '');
      setStatus(initialData.status);
      setCopilota(initialData.copilota || false);
    } else {
      setName('');
      setLocation('');
      setCheckIn('');
      setCheckInTime('14:00');
      setCheckOut('');
      setCheckOutTime('10:00');
      setAddress('');
      setCost('');
      setPaymentStatus('saldato');
      setBookingUrl('');
      setNotes('');
      setStatus('prenotato');
      setCopilota(false);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !checkIn || !checkOut) {
      setError('Nome struttura e date check-in/check-out sono obbligatori.');
      return;
    }
    if (checkOut < checkIn) {
      setError('La data di check-out non può essere precedente al check-in.');
      return;
    }
    setError('');
    onSave({
      id: initialData?.id,
      name: name.trim(),
      location: location.trim() || name.trim(),
      checkIn,
      checkInTime: checkInTime.trim() || undefined,
      checkOut,
      checkOutTime: checkOutTime.trim() || undefined,
      address: address.trim() || location.trim() || name.trim(),
      cost: cost.trim() || undefined,
      paymentStatus,
      bookingUrl: bookingUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      status,
      copilota: copilota || undefined,
      coordinate: initialData?.coordinate
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          {error}
        </div>
      )}

      {/* Nome struttura */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Nome Struttura / Hotel *
        </label>
        <input
          type="text"
          placeholder="es. Scenic Hotel Franz Josef Glacier, Hilton Auckland"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-purple-500 transition-colors placeholder:text-slate-400"
          required
        />
      </div>

      {/* Check-in: Data e Ora */}
      <div className="p-3.5 rounded-2xl bg-purple-50/40 border border-purple-100 space-y-2.5">
        <span className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
          <span>🛎️</span> Check-in
        </span>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Data Check-in *
            </label>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="w-full h-10 px-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-purple-500"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Ora Prevista
            </label>
            <input
              type="text"
              placeholder="es. 14:00"
              value={checkInTime}
              onChange={(e) => setCheckInTime(e.target.value)}
              className="w-full h-10 px-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-purple-500 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Check-out: Data e Ora */}
      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <span>🚪</span> Check-out
        </span>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Data Check-out *
            </label>
            <input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full h-10 px-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-purple-500"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Ora Limite
            </label>
            <input
              type="text"
              placeholder="es. 10:00"
              value={checkOutTime}
              onChange={(e) => setCheckOutTime(e.target.value)}
              className="w-full h-10 px-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-purple-500 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Indirizzo / Città */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Città / Località
          </label>
          <input
            type="text"
            placeholder="es. Franz Josef, Auckland"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-purple-500 transition-colors placeholder:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Indirizzo o Link Maps
          </label>
          <input
            type="text"
            placeholder="es. Main Rd 36 o link Maps"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-purple-500 transition-colors placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Costo e Stato Pagamento */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Costo Totale (€)
          </label>
          <input
            type="text"
            placeholder="es. 340 €"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-purple-500 transition-colors placeholder:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Stato Pagamento
          </label>
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value as 'saldato' | 'da_saldare')}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-purple-500 transition-colors"
          >
            <option value="saldato">✅ Saldato</option>
            <option value="da_saldare">⏳ Da saldare in loco</option>
          </select>
        </div>
      </div>

      {/* Link Prenotazione */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Link Prenotazione / Voucher (opzionale)
        </label>
        <input
          type="url"
          placeholder="https://booking.com/..."
          value={bookingUrl}
          onChange={(e) => setBookingUrl(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-purple-500 transition-colors placeholder:text-slate-400"
        />
      </div>

      {/* Note Check-in */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Note Check-in / Istruzioni
        </label>
        <textarea
          rows={2}
          placeholder="es. Codice cassetta chiavi, parcheggio sul retro, orario reception..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-purple-500 placeholder:text-slate-400 resize-none"
        />
      </div>

      {/* Opzione Co-pilota */}
      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
        <label htmlFor="copilota-alloggio-toggle" className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
          <span>🧭</span>
          <span>Mostra al co-pilota come sosta importante</span>
        </label>
        <input
          id="copilota-alloggio-toggle"
          type="checkbox"
          checked={copilota}
          onChange={(e) => setCopilota(e.target.checked)}
          className="w-4 h-4 rounded text-purple-600 bg-white border-slate-300 focus:ring-purple-500 cursor-pointer"
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
          className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-purple-600 hover:bg-purple-500 active:scale-95 text-white shadow-md shadow-purple-600/20 transition-all cursor-pointer"
        >
          {initialData ? 'Aggiorna Alloggio' : 'Salva Alloggio'}
        </button>
      </div>
    </form>
  );
}
