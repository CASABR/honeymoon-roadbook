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
  const [orario, setOrario] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [budget, setBudget] = useState('');
  const [linkPrenotazione, setLinkPrenotazione] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nota, setNota] = useState('');
  const [copilota, setCopilota] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setNome(initialData.nome);
      setData(initialData.data || '');
      setOrario(initialData.orario || '');
      setIndirizzo(initialData.indirizzo || '');
      setBudget(initialData.budget || '');
      setLinkPrenotazione(initialData.linkPrenotazione || '');
      setTelefono(initialData.telefono || '');
      setNota(initialData.nota || '');
      setCopilota(initialData.copilota || false);
    } else {
      setNome('');
      setData('');
      setOrario('');
      setIndirizzo('');
      setBudget('');
      setLinkPrenotazione('');
      setTelefono('');
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

    setError('');
    onSave({
      id: initialData?.id,
      nome: nome.trim(),
      data: data || undefined,
      orario: orario || undefined,
      indirizzo: indirizzo.trim() || undefined,
      budget: budget.trim() || undefined,
      linkPrenotazione: linkPrenotazione.trim() || undefined,
      telefono: telefono.trim() || undefined,
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

      {/* Nome locale */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Nome Locale / Ristorante *
        </label>
        <input
          type="text"
          placeholder="es. Fergburger, Starita Milano, Depot Eatery"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
          required
        />
      </div>

      {/* Data e Orario */}
      <div className="grid grid-cols-2 gap-3">
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
            Orario (opzionale)
          </label>
          <input
            type="time"
            value={orario}
            onChange={(e) => setOrario(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors"
          />
        </div>
      </div>

      {/* Indirizzo / Città / Link Maps */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Indirizzo / Città o Link Maps
        </label>
        <input
          type="text"
          placeholder="es. Shotover St, Queenstown o link Maps"
          value={indirizzo}
          onChange={(e) => setIndirizzo(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
        />
      </div>

      {/* Budget stimato e Link / Prenotazione */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Budget stimato (€)
          </label>
          <input
            type="text"
            placeholder="es. 35 € a persona"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Link Prenotazione / Web
          </label>
          <input
            type="url"
            placeholder="https://..."
            value={linkPrenotazione}
            onChange={(e) => setLinkPrenotazione(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-amber-500 transition-colors placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Note / Prenotazione */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Note / Dettagli prenotazione
        </label>
        <textarea
          rows={2}
          placeholder="es. Tavolo prenotato a nome Mario, piatti consigliati, orario limite arrivo..."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-amber-500 placeholder:text-slate-400 resize-none"
        />
      </div>

      {/* Opzione Co-pilota */}
      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
        <label htmlFor="copilota-ristorante-toggle" className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
          <span>🧭</span>
          <span>Mostra al co-pilota per pause pranzo/cena</span>
        </label>
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
          className="min-h-[44px] px-4 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
        >
          Annulla
        </button>
        <button
          type="submit"
          className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
        >
          {initialData ? 'Aggiorna Ristorante' : 'Salva Ristorante'}
        </button>
      </div>
    </form>
  );
}
