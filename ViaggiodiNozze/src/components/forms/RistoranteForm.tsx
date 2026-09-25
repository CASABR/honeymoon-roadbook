import { useState, useEffect } from 'react';
import type { Ristorante } from '../../types';

interface RistoranteFormProps {
  initialData?: Ristorante | null;
  onSave: (data: Omit<Ristorante, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function RistoranteForm({ initialData, onSave, onCancel }: RistoranteFormProps) {
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [linkPrenotazione, setLinkPrenotazione] = useState('');
  const [nota, setNota] = useState('');
  const [copilota, setCopilota] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setNome(initialData.nome);
      setData(initialData.data || '');
      setLat(initialData.coordinate?.lat !== undefined ? String(initialData.coordinate.lat) : '');
      setLng(initialData.coordinate?.lng !== undefined ? String(initialData.coordinate.lng) : '');
      setIndirizzo(initialData.indirizzo || '');
      setTelefono(initialData.telefono || '');
      setLinkPrenotazione(initialData.linkPrenotazione || '');
      setNota(initialData.nota || '');
      setCopilota(initialData.copilota || false);
    } else {
      setNome('');
      setData('');
      setLat('');
      setLng('');
      setIndirizzo('');
      setTelefono('');
      setLinkPrenotazione('');
      setNota('');
      setCopilota(false);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setError('Il nome del ristorante è obbligatorio.');
      return;
    }

    let coordinate: { lat: number; lng: number } | undefined = undefined;
    if (lat.trim() !== '' && lng.trim() !== '') {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        setError('Le coordinate devono essere valori numerici validi.');
        return;
      }
      coordinate = { lat: parsedLat, lng: parsedLng };
    }

    setError('');
    onSave({
      id: initialData?.id,
      nome: nome.trim(),
      data: data || undefined,
      coordinate,
      indirizzo: indirizzo.trim() || undefined,
      telefono: telefono.trim() || undefined,
      linkPrenotazione: linkPrenotazione.trim() || undefined,
      nota: nota.trim() || undefined,
      copilota: copilota || undefined
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Nome Ristorante *
        </label>
        <input
          type="text"
          placeholder="es. Starita Milano, Fergburger Queenstown"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Data (opzionale)
        </label>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Latitudine (opzionale)
          </label>
          <input
            type="text"
            placeholder="es. 45.4789"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Longitudine (opzionale)
          </label>
          <input
            type="text"
            placeholder="es. 9.1762"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400 text-xs"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Indirizzo (opzionale)
        </label>
        <input
          type="text"
          placeholder="es. Via G. G. Mora 5, Milano"
          value={indirizzo}
          onChange={(e) => setIndirizzo(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Telefono (opzionale)
          </label>
          <input
            type="tel"
            placeholder="es. +39 02 123456"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Link Prenotazione (opzionale)
          </label>
          <input
            type="url"
            placeholder="https://..."
            value={linkPrenotazione}
            onChange={(e) => setLinkPrenotazione(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400 text-xs"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Nota / Menu / Consigli (opzionale)
        </label>
        <textarea
          rows={3}
          placeholder="es. Tavolo prenotato alle 20:30 a nome Mario. Specialità montanara e pizza fritta..."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-amber-500 placeholder:text-slate-400 resize-none"
        />
      </div>

      {/* Checkbox Co-pilota */}
      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-base">🧭</span>
          <div>
            <label htmlFor="copilota-ristorante-toggle" className="text-xs font-bold text-slate-800 cursor-pointer block">
              Mostra al co-pilota
            </label>
            <p className="text-[11px] text-slate-500 font-medium">
              Mostra il badge "🧭 Co-pilota" per le tappe culinarie chiave del percorso
            </p>
          </div>
        </div>
        <input
          id="copilota-ristorante-toggle"
          type="checkbox"
          checked={copilota}
          onChange={(e) => setCopilota(e.target.checked)}
          className="w-4 h-4 rounded text-emerald-600 bg-white border-slate-300 focus:ring-emerald-500 cursor-pointer"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
        >
          Annulla
        </button>
        <button
          type="submit"
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
        >
          {initialData ? 'Salva Modifiche' : 'Aggiungi Ristorante'}
        </button>
      </div>
    </form>
  );
}
