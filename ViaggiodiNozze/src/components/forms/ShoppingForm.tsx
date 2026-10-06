import React, { useState, useEffect } from 'react';
import { usePresence } from '../../hooks/usePresence';
import type { Shopping } from '../../types';
import { extractFromText } from '../../services/aiExtractor';

interface ShoppingFormProps {
  initialData?: Shopping | null;
  onSave: (data: Omit<Shopping, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function ShoppingForm({ initialData, onSave, onCancel }: ShoppingFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);

  const [sottocategoria, setSottocategoria] = useState('');
  const [nome, setNome] = useState('');
  const [scopo, setScopo] = useState('');
  const [data, setData] = useState('');
  const [orario, setOrario] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [budget, setBudget] = useState('');
  const [link, setLink] = useState('');
  const [nota, setNota] = useState('');
  const [copilota, setCopilota] = useState(false);
  
  const [error, setError] = useState('');
  
  // AI State
  const [showAiBox, setShowAiBox] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const SOTTOCATEGORIE = ['Abbigliamento', 'Souvenir', 'Alimentari', 'Elettronica', 'Carburante', 'Altro'];

  useEffect(() => {
    if (initialData) {
      setSottocategoria(initialData.sottocategoria || '');
      setNome(initialData.nome || '');
      setScopo(initialData.scopo || '');
      setData(initialData.data || '');
      setOrario(initialData.orario || '');
      setIndirizzo(initialData.indirizzo || '');
      setBudget(initialData.budget || '');
      setLink(initialData.link || '');
      setNota(initialData.nota || '');
      setCopilota(initialData.copilota || false);
    } else {
      setSottocategoria('');
      setNome('');
      setScopo('');
      setData('');
      setOrario('');
      setIndirizzo('');
      setBudget('');
      setLink('');
      setNota('');
      setCopilota(false);
    }
  }, [initialData]);

  const handleAiExtraction = async () => {
    if (!aiText.trim()) return;
    setIsExtracting(true);
    setError('');
    
    try {
      const res = await extractFromText(aiText, 'Nuovo inserimento Shopping', 'import');
      if (res.success && res.entityType === 'shopping' && res.data?.type === 'shopping') {
        const d = res.data;
        if (d.nome) setNome(d.nome);
        if (d.indirizzo) setIndirizzo(d.indirizzo);
        if (d.data) setData(d.data);
        if (d.orario) setOrario(d.orario);
        if (d.budget) setBudget(d.budget);
        if (d.nota) setNota(d.nota);
        if (d.sottocategoria && SOTTOCATEGORIE.includes(d.sottocategoria)) {
          setSottocategoria(d.sottocategoria);
        }
        setShowAiBox(false);
        setAiText('');
      } else {
        setError(res.error || 'Nessun dato shopping riconosciuto. Controlla il testo e riprova.');
      }
    } catch (e) {
      setError('Errore di connessione a Houni AI.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setError('Il nome del negozio o centro commerciale è obbligatorio.');
      return;
    }

    setError('');
    onSave({
      id: initialData?.id,
      sottocategoria: sottocategoria || undefined,
      nome: nome.trim(),
      scopo: scopo.trim() || undefined,
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
    <div className="space-y-4">
      {/* Box AI Concierge */}
      <div className="bg-[#F0FAF9] border border-[#DDF4F5] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-pink-800 font-bold text-sm">
            <span className="text-sm">✨</span>
            Compila con Houni AI
          </div>
          <button
            type="button"
            onClick={() => setShowAiBox(!showAiBox)}
            className="text-xs font-semibold px-3 py-1.5 bg-white border border-pink-200 text-pink-700 rounded-lg hover:bg-pink-100 transition-colors"
          >
            {showAiBox ? 'Chiudi' : 'Incolla Testo'}
          </button>
        </div>
        {showAiBox && (
          <div className="mt-3 animate-fade-in space-y-2">
            <p className="text-xs text-pink-700/80 mb-2">
              Incolla qui note o messaggi. L'AI estrarrà per te nome, indirizzo, budget, ecc.
            </p>
            <textarea
              className="w-full p-3 rounded-xl border border-pink-200 text-sm focus:ring-2 focus:ring-pink-400 focus:border-pink-400 resize-none"
              rows={4}
              placeholder="Es: Domani andiamo da Harrods a Londra verso le 15:00. Dobbiamo comprare tè e biscotti, budget 50€."
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              disabled={isExtracting}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAiExtraction}
                disabled={isExtracting || !aiText.trim()}
                className="flex items-center gap-2 bg-pink-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-pink-500 disabled:opacity-50 transition-colors"
              >
                {isExtracting ? <span className="animate-spin text-sm">⏳</span> : <span className="text-sm">✨</span>}
                Estrai Dati
              </button>
            </div>
          </div>
        )}
      </div>

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

        {/* Categoria */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Sottocategoria
          </label>
          <div className="flex flex-wrap gap-2">
            {SOTTOCATEGORIE.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSottocategoria(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                  sottocategoria === cat 
                    ? 'bg-slate-800 text-white border-slate-800 shadow-md' 
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Nome Negozio / Luogo Shopping */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Negozio / Centro Commerciale / Mercato *
          </label>
          <input
            type="text"
            placeholder="es. Queenstown Mall, Harrods, Conad..."
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors placeholder:text-slate-400"
            required
          />
        </div>
        
        {/* Scopo (Cosa comprare brevemente) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Scopo / Titolo breve
          </label>
          <input
            type="text"
            placeholder="es. Souvenir, Rifornimento, Spesa..."
            value={scopo}
            onChange={(e) => setScopo(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors placeholder:text-slate-400"
          />
        </div>

        {/* Data e Orario */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Data (opzionale)
            </label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors"
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
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors"
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
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors placeholder:text-slate-400"
          />
        </div>

        {/* Budget stimato e Sito / Link */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Budget indicativo (€)
            </label>
            <input
              type="text"
              placeholder="es. 100"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors placeholder:text-slate-400"
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
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-rose-500 transition-colors placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Note / Dettagli shopping */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Lista Completa / Note Dettagliate
          </label>
          <textarea
            rows={3}
            placeholder="es. Miele di Manuka, maglione in lana merino, artigianato locale Maori, souvenir per famiglia..."
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:bg-slate-100 focus:border-rose-500 placeholder:text-slate-400 resize-none"
          />
        </div>

        {/* Opzione Co-pilota */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
          <label htmlFor="copilota-shopping-toggle" className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
            <span>🧭</span>
            <span>Mostra al co-pilota come sosta consigliata</span>
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
    </div>
  );
}
