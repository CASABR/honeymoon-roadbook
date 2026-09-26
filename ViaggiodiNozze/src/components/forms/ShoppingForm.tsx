import { useState, useEffect } from 'react';
import type { Shopping } from '../../types';

interface ShoppingFormProps {
  initialData?: Shopping | null;
  onSave: (data: Omit<Shopping, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function ShoppingForm({ initialData, onSave, onCancel }: ShoppingFormProps) {
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [orario, setOrario] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [budget, setBudget] = useState('');
  const [link, setLink] = useState('');
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
      setLink(initialData.link || '');
      setNota(initialData.nota || '');
      setCopilota(initialData.copilota || false);
    } else {
      setNome('');
      setData('');
      setOrario('');
      setIndirizzo('');
      setBudget('');
      setLink('');
      setNota('');
      setCopilota(false);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setError('Il nome del negozio o centro commerciale è obbligatorio.');
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
      link: link.trim() || undefined,
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

      {/* Nome Negozio / Luogo Shopping */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Negozio / Centro Commerciale / Mercato *
        </label>
        <input
          type="text"
          placeholder="es. Queenstown Mall, Auckland Night Market, Queen Victoria Market"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-rose-500 transition-colors placeholder:text-slate-400"
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
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-rose-500 transition-colors"
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
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-rose-500 transition-colors"
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
          placeholder="es. The Rocks, Sydney o link Google Maps"
          value={indirizzo}
          onChange={(e) => setIndirizzo(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-rose-500 transition-colors placeholder:text-slate-400"
        />
      </div>

      {/* Budget stimato e Sito / Link */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Budget indicativo (€)
          </label>
          <input
            type="text"
            placeholder="es. 100 € souvenir"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-rose-500 transition-colors placeholder:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Link / Sito Web
          </label>
          <input
            type="url"
            placeholder="https://..."
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-rose-500 transition-colors placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Note / Dettagli shopping */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Cosa comprare / Note & Idee
        </label>
        <textarea
          rows={2}
          placeholder="es. Miele di Manuka, maglione in lana merino, artigianato locale Maori, souvenir per famiglia..."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-rose-500 placeholder:text-slate-400 resize-none"
        />
      </div>

      {/* Opzione Co-pilota */}
      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
        <label htmlFor="copilota-shopping-toggle" className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
          <span>🧭</span>
          <span>Mostra al co-pilota come sosta / acquisto consigliato</span>
        </label>
        <input
          id="copilota-shopping-toggle"
          type="checkbox"
          checked={copilota}
          onChange={(e) => setCopilota(e.target.checked)}
          className="w-4 h-4 rounded text-rose-600 bg-white border-slate-300 focus:ring-rose-500 cursor-pointer"
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
          className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-rose-500 hover:bg-rose-400 active:scale-95 text-white shadow-md shadow-rose-500/20 transition-all cursor-pointer"
        >
          {initialData ? 'Aggiorna Shopping' : 'Salva Shopping'}
        </button>
      </div>
    </form>
  );
}
