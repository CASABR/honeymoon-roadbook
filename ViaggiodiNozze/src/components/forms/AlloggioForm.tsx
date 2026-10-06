import React, { useState, useEffect } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { getCoordinatesFromAddress } from '../../utils/mapsHelper';
import type { Alloggio } from '../../types';

interface AlloggioFormProps {
  initialData?: Alloggio | null;
  onSave: (data: Omit<Alloggio, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function AlloggioForm({ initialData, onSave, onCancel, onDelete }: AlloggioFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);

  const [sottocategoria, setSottocategoria] = useState<Alloggio['sottocategoria'] | ''>('');
  const [name, setName] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [address, setAddress] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [phone, setPhone] = useState('');
  const [cost, setCost] = useState('');
  const [acconto, setAcconto] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'saldato' | 'da_saldare'>('saldato');
  const [notes, setNotes] = useState('');
  
  const [error, setError] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const SOTTOCATEGORIE: Alloggio['sottocategoria'][] = ['Hotel', 'B&B', 'Appartamento', 'Campeggio/Piazzola', 'Altro'];

  useEffect(() => {
    if (initialData) {
      setSottocategoria(initialData.sottocategoria || '');
      setName(initialData.name || '');
      setCheckIn(initialData.checkIn || '');
      setCheckOut(initialData.checkOut || '');
      setCheckInTime(initialData.checkInTime || '');
      setCheckOutTime(initialData.checkOutTime || '');
      setAddress(initialData.address || '');
      setPinCode(initialData.pinCode || '');
      setPhone(initialData.phone || '');
      setCost(initialData.cost || '');
      setAcconto(initialData.acconto || '');
      setPaymentStatus(initialData.paymentStatus || 'saldato');
      setNotes(initialData.notes || '');
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tm_yyyy = tomorrow.getFullYear();
      const tm_mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const tm_dd = String(tomorrow.getDate()).padStart(2, '0');
      
      setSottocategoria('');
      setName('');
      setCheckIn(`${yyyy}-${mm}-${dd}`);
      setCheckOut(`${tm_yyyy}-${tm_mm}-${tm_dd}`);
      setCheckInTime('14:00');
      setCheckOutTime('10:00');
      setAddress('');
      setPinCode('');
      setPhone('');
      setCost('');
      setAcconto('');
      setPaymentStatus('da_saldare');
      setNotes('');
    }
  }, [initialData]);

  const calculateSaldo = () => {
    const c = parseFloat(cost.replace(',', '.')) || 0;
    const a = parseFloat(acconto.replace(',', '.')) || 0;
    return c - a;
  };

  const processSave = async () => {
    setIsGeocoding(true);
    let finalCoord = initialData?.coordinate;

    if (address && address.trim()) {
      try {
        const coord = await getCoordinatesFromAddress(address);
        if (coord) {
          finalCoord = coord;
        } else if (!finalCoord) {
          const fallbackCoord = await getCoordinatesFromAddress(name);
          if (fallbackCoord) finalCoord = fallbackCoord;
        }
      } catch (e) {
        console.error("Geocoding fallito", e);
      }
    } else if (name.trim() && !finalCoord) {
       try {
         const coord = await getCoordinatesFromAddress(name);
         if (coord) finalCoord = coord;
       } catch(e) {}
    }

    setIsGeocoding(false);

    onSave({
      id: initialData?.id,
      sottocategoria: sottocategoria || undefined,
      name: name.trim(),
      location: address.trim() || name.trim(),
      checkIn,
      checkOut,
      checkInTime: checkInTime.trim() || undefined,
      checkOutTime: checkOutTime.trim() || undefined,
      address: address.trim() || name.trim(),
      pinCode: pinCode.trim() || undefined,
      phone: phone.trim() || undefined,
      cost: cost.trim() || undefined,
      acconto: acconto.trim() || undefined,
      paymentStatus,
      notes: notes.trim() || undefined,
      status: 'prenotato',
      coordinate: finalCoord
    });
  };

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
    processSave();
  };

  const saldo = calculateSaldo();

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-4">
      {isLockedByOther && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl font-bold flex gap-2 items-center animate-fade-in">
          <span className="text-base animate-pulse">⚠️</span>
          <span>Attenzione: il dispositivo "{lockedBy}" sta modificando questo elemento. Le modifiche potrebbero sovrascriversi.</span>
        </div>
      )}

      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Sottocategoria
        </label>
        <div className="flex flex-wrap gap-2">
          {SOTTOCATEGORIE.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSottocategoria(cat === sottocategoria ? '' : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                cat === sottocategoria
                  ? 'bg-[#FF6B5F] text-white border-[#FF6B5F]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Nome Struttura *
        </label>
        <input
          type="text"
          placeholder="es. Grand Hotel"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] transition-colors placeholder:text-slate-400"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Data Check-in *
          </label>
          <input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Data Check-out *
          </label>
          <input
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Ora Check-in
          </label>
          <input
            type="time"
            value={checkInTime}
            onChange={(e) => setCheckInTime(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Ora Check-out
          </label>
          <input
            type="time"
            value={checkOutTime}
            onChange={(e) => setCheckOutTime(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Indirizzo / Strada Maps
        </label>
        <input
          type="text"
          placeholder="Via Roma 1, Milano"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] placeholder:text-slate-400"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Codice PIN / Accesso
          </label>
          <input
            type="text"
            placeholder="es. 1234 o #5521"
            value={pinCode}
            onChange={(e) => setPinCode(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] placeholder:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Telefono Reception
          </label>
          <input
            type="tel"
            placeholder="+39..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          Dettaglio Economico
        </label>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Costo Totale (€)</label>
            <input
              type="text"
              placeholder="es. 480"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Acconto Versato (€)</label>
            <input
              type="text"
              placeholder="es. 100"
              value={acconto}
              onChange={(e) => setAcconto(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-600">
            Saldo Rimanente: <span className={`font-bold ${saldo > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{saldo > 0 ? saldo.toFixed(2) : '0.00'} €</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="saldato-toggle" className="text-xs font-bold text-slate-700 cursor-pointer">Saldato</label>
            <input
              id="saldato-toggle"
              type="checkbox"
              checked={paymentStatus === 'saldato'}
              onChange={(e) => setPaymentStatus(e.target.checked ? 'saldato' : 'da_saldare')}
              className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Note / Parcheggio
        </label>
        <textarea
          rows={3}
          placeholder="es. Colazione inclusa, parcheggio nel cortile sul retro..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] placeholder:text-slate-400 resize-none"
        />
      </div>

      <div className="flex flex-col gap-3 pt-4 mt-2 border-t border-slate-100">
        <button
          type="submit"
          disabled={isGeocoding}
          className={`w-full h-12 rounded-xl text-sm font-bold bg-[#FF6B5F] hover:bg-[#e85c50] active:scale-95 text-white shadow-lg transition-all ${isGeocoding ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {isGeocoding ? 'Salvataggio...' : 'Salva Modifiche'}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors py-1"
          >
            Annulla
          </button>
        )}
        
        {initialData && onDelete && (
          <div className="text-center">
            {!showConfirmDelete ? (
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                className="text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors py-2"
              >
                Elimina alloggio
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 py-1">
                <span className="text-xs font-medium text-slate-600">Sei sicuro?</span>
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700"
                >
                  Sì, elimina
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-3 py-1 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300"
                >
                  Annulla
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
