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
  const [checkOut, setCheckOut] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<StatoAlloggio>('da_prenotare');

  // Campi facoltativi richiudibili
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bookingCode, setBookingCode] = useState('');
  const [bookingUrl, setBookingUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setLocation(initialData.location);
      setCheckIn(initialData.checkIn);
      setCheckOut(initialData.checkOut);
      setAddress(initialData.address);
      setStatus(initialData.status);
      setBookingCode(initialData.bookingCode || '');
      setBookingUrl(initialData.bookingUrl || '');
      setPhone(initialData.phone || '');
      setNotes(initialData.notes || '');
      if (initialData.bookingCode || initialData.bookingUrl || initialData.phone || initialData.notes) {
        setShowAdvanced(true);
      }
    } else {
      setName('');
      setLocation('');
      setCheckIn('');
      setCheckOut('');
      setAddress('');
      setStatus('da_prenotare');
      setBookingCode('');
      setBookingUrl('');
      setPhone('');
      setNotes('');
      setShowAdvanced(false);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !location.trim() || !checkIn || !checkOut || !address.trim()) {
      setError('Nome struttura, località, date check-in/out e indirizzo sono obbligatori.');
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
      location: location.trim(),
      checkIn,
      checkOut,
      address: address.trim(),
      status,
      bookingCode: bookingCode.trim() || undefined,
      bookingUrl: bookingUrl.trim() || undefined,
      phone: phone.trim() || undefined,
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

      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
          Nome Struttura / Hotel *
        </label>
        <input
          type="text"
          placeholder="es. Hotel Gracery Shinjuku"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-500"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Località *
          </label>
          <input
            type="text"
            placeholder="es. Tokyo"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-500"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Stato Prenotazione *
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatoAlloggio)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors"
          >
            <option value="da_prenotare">Da Prenotare</option>
            <option value="prenotato">Prenotato</option>
            <option value="completato">Completato</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Check-in *
          </label>
          <input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Check-out *
          </label>
          <input
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
          Indirizzo Completo *
        </label>
        <input
          type="text"
          placeholder="es. 1-19-1 Kabukicho, Shinjuku City"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full h-11 px-3 bg-slate-800 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-500"
          required
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
          <span>{showAdvanced ? 'Nascondi recapiti e codici' : 'Aggiungi codice prenotazione, link o telefono'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 animate-fade-in">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Codice Prenotazione
                </label>
                <input
                  type="text"
                  placeholder="es. BK-982312"
                  value={bookingCode}
                  onChange={(e) => setBookingCode(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-purple-500 placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Telefono
                </label>
                <input
                  type="tel"
                  placeholder="+81 3-xxxx-xxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-purple-500 placeholder:text-slate-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Link Prenotazione (Booking, Airbnb, ecc.)
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={bookingUrl}
                onChange={(e) => setBookingUrl(e.target.value)}
                className="w-full h-10 px-3 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-purple-500 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Note o istruzioni per il check-in
              </label>
              <textarea
                rows={2}
                placeholder="es. Deposito bagagli consentito, colazione inclusa..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 bg-slate-800 border border-slate-700/80 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-purple-500 placeholder:text-slate-500 resize-none"
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
          className="min-h-[44px] px-6 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-500 active:scale-95 text-white shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
        >
          {initialData ? 'Aggiorna Alloggio' : 'Salva Alloggio'}
        </button>
      </div>
    </form>
  );
}
