import { useState, useEffect } from 'react';
import type { Tappa } from '../../types';

interface TappaFormProps {
  initialData?: Tappa | null;
  onSave: (data: Omit<Tappa, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function TappaForm({ initialData, onSave, onCancel }: TappaFormProps) {
  const [titolo, setTitolo] = useState('');
  const [data, setData] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [nota, setNota] = useState('');
  const [copilota, setCopilota] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setTitolo(initialData.titolo);
      setData(initialData.data || '');
      setMapsUrl(initialData.mapsUrl || '');
      setNota(initialData.nota || '');
      setCopilota(initialData.copilota || false);
    } else {
      setTitolo('');
      setData('');
      setMapsUrl('');
      setNota('');
      setCopilota(false);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titolo.trim()) {
      setError('Il titolo/luogo della tappa è obbligatorio.');
      return;
    }

    setError('');
    onSave({
      id: initialData?.id,
      titolo: titolo.trim(),
      data: data || undefined,
      mapsUrl: mapsUrl.trim() || undefined,
      coordinate: initialData?.coordinate,
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
          Titolo Tappa *
        </label>
        <input
          type="text"
          placeholder="es. Sosta Lago Taupo"
          value={titolo}
          onChange={(e) => setTitolo(e.target.value)}
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

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Link o Indirizzo Google Maps (opzionale)
        </label>
        <input
          type="text"
          placeholder="es. Indirizzo o link https://maps.app.goo.gl/..."
          value={mapsUrl}
          onChange={(e) => setMapsUrl(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Descrizione / Note sintetiche (opzionale)
        </label>
        <textarea
          rows={2}
          placeholder="es. Punto panoramico per foto al tramonto, rifornimento carburante..."
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
            <label htmlFor="copilota-tappa-toggle" className="text-xs font-bold text-slate-800 cursor-pointer block">
              Mostra al co-pilota
            </label>
            <p className="text-[11px] text-slate-500 font-medium">
              Mostra il badge "🧭 Co-pilota" per le soste importanti di navigazione
            </p>
          </div>
        </div>
        <input
          id="copilota-tappa-toggle"
          type="checkbox"
          checked={copilota}
          onChange={(e) => setCopilota(e.target.checked)}
          className="w-4 h-4 rounded text-emerald-600 bg-white border-slate-300 focus:ring-emerald-500 cursor-pointer"
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
          className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
        >
          {initialData ? 'Aggiorna Tappa' : 'Salva Tappa'}
        </button>
      </div>
    </form>
  );
}
