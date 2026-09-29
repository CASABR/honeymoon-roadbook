import { useState, useEffect } from 'react';
import type { TravelDocument } from '../../types';
import { storageService } from '../../storage/storageService';
import DocumentValidityModal from '../../components/modals/DocumentValidityModal';

interface AssicurazioneViewProps {
  onBack: () => void;
}

export default function AssicurazioneView({ onBack }: AssicurazioneViewProps) {
  const [doc, setDoc] = useState<TravelDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  
  const loadDoc = async () => {
    try {
      setLoading(true);
      const loaded = await storageService.getDocuments();
      let insurance = loaded.find(d => d.category === 'assicurazione');
      if (!insurance) {
        // Create an empty one
        insurance = {
          id: 'doc_assicurazione',
          category: 'assicurazione',
          title: 'Assicurazione di Viaggio',
          attachments: [],
          updatedAt: new Date().toISOString()
        };
      }
      setDoc(insurance);
    } catch (err) {
      console.error('Errore caricamento assicurazione:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoc();
  }, []);

  const handleSaveDocument = async (updated: TravelDocument) => {
    try {
      await storageService.saveDocument(updated);
      setIsEditing(false);
      await loadDoc();
    } catch (err) {
      console.error('Errore salvataggio assicurazione:', err);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-10">
      <header className="flex items-center gap-3 mb-6 px-1">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <span>🛡️</span> Assicurazione
        </h1>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[200px]">
          <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-1 space-y-4">
          {/* Card 1: Informazioni Principali Polizza */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/90 relative overflow-hidden">
            <div className="flex justify-between items-start gap-2 mb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  Allianz Global Assistance / Heymondo Top
                </span>
                <h2 className="text-lg font-black text-slate-900 mt-1">Polizza Viaggio No-Stop</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                    N° Polizza: HMN-2026-NZAU-88942
                  </span>
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    ✓ H24 ATTIVA
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setIsEditing(true)} 
                className="text-xs text-slate-600 font-bold bg-slate-100 hover:bg-slate-200 active:scale-95 px-3 py-1.5 rounded-xl border border-slate-200 transition-all cursor-pointer"
              >
                Modifica
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-100 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Validità</span>
                <span className="font-bold text-slate-800 text-[11px]">28 Nov 2026 – 12 Gen 2027</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Destinazioni</span>
                <span className="font-bold text-slate-800 text-[11px]">Nuova Zelanda, Australia & Filippine</span>
              </div>
            </div>
          </div>

          {/* Card 2: Chiamata Rapida Emergenze H24 per Paese */}
          <div className="bg-gradient-to-br from-rose-500 via-rose-600 to-red-700 text-white rounded-3xl p-5 shadow-lg shadow-rose-500/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🚨</span>
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-rose-100">
                Centrale Operativa H24 (Chiamata Rapida)
              </h3>
            </div>
            <p className="text-xs text-rose-100 leading-relaxed mb-4">
              Contatta immediatamente la centrale prima di qualsiasi prestazione medica per attivare la presa in carico diretta delle spese.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href="tel:+390226609133"
                className="flex items-center justify-between bg-white text-slate-900 px-3.5 py-2.5 rounded-2xl font-bold text-xs shadow-sm hover:bg-rose-50 transition-all active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">🌐</span>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Centrale Italia / Estero</p>
                    <p className="text-xs font-mono font-extrabold text-rose-600">+39 02 2660 9133</p>
                  </div>
                </div>
                <span className="text-xs text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-lg">Chiama</span>
              </a>

              <a
                href="tel:+6499859000"
                className="flex items-center justify-between bg-white text-slate-900 px-3.5 py-2.5 rounded-2xl font-bold text-xs shadow-sm hover:bg-rose-50 transition-all active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">🇳🇿</span>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Assistenza Nuova Zelanda</p>
                    <p className="text-xs font-mono font-extrabold text-rose-600">+64 9 985 9000</p>
                  </div>
                </div>
                <span className="text-xs text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-lg">Chiama</span>
              </a>

              <a
                href="tel:+61280155000"
                className="flex items-center justify-between bg-white text-slate-900 px-3.5 py-2.5 rounded-2xl font-bold text-xs shadow-sm hover:bg-rose-50 transition-all active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">🇦🇺</span>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Assistenza Australia</p>
                    <p className="text-xs font-mono font-extrabold text-rose-600">+61 2 8015 5000</p>
                  </div>
                </div>
                <span className="text-xs text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-lg">Chiama</span>
              </a>

              <a
                href="tel:+63285241728"
                className="flex items-center justify-between bg-white text-slate-900 px-3.5 py-2.5 rounded-2xl font-bold text-xs shadow-sm hover:bg-rose-50 transition-all active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">🇵🇭</span>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Polizia Turistica Filippine</p>
                    <p className="text-xs font-mono font-extrabold text-rose-600">+63 2 8524 1728</p>
                  </div>
                </div>
                <span className="text-xs text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-lg">Chiama</span>
              </a>

              <a
                href="tel:911"
                className="flex items-center justify-between bg-rose-950/40 text-white border border-white/20 px-3.5 py-2.5 rounded-2xl font-bold text-xs hover:bg-rose-950/60 transition-all active:scale-95"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">🚑</span>
                  <div>
                    <p className="text-[10px] text-rose-200 font-bold uppercase">Soccorso Locale Urgenze</p>
                    <p className="text-xs font-mono font-extrabold">111 (NZ) • 000 (AU) • 911 (PH)</p>
                  </div>
                </div>
                <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-lg">SOS</span>
              </a>
            </div>
          </div>

          {/* Card 3: Massimali Essenziali */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/90">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Massimali di Copertura Inclusi
            </h3>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-2xl">
                <span className="text-[10px] font-bold text-emerald-800 uppercase block">Spese Mediche</span>
                <span className="text-base font-extrabold text-emerald-950">ILLIMITATE</span>
                <p className="text-[10px] text-emerald-700 mt-0.5">Pagamento diretto ricoveri</p>
              </div>

              <div className="bg-indigo-50/60 border border-indigo-100 p-3 rounded-2xl">
                <span className="text-[10px] font-bold text-indigo-800 uppercase block">Rimpatrio Sanitario</span>
                <span className="text-base font-extrabold text-indigo-950">100% INCLUSO</span>
                <p className="text-[10px] text-indigo-700 mt-0.5">Volo sanitario dedicato</p>
              </div>

              <div className="bg-sky-50/60 border border-sky-100 p-3 rounded-2xl">
                <span className="text-[10px] font-bold text-sky-800 uppercase block">Bagaglio & Effetti</span>
                <span className="text-base font-extrabold text-sky-950">€ 2.500 / persona</span>
                <p className="text-[10px] text-sky-700 mt-0.5">Furto, smarrimento o danno</p>
              </div>

              <div className="bg-amber-50/60 border border-amber-100 p-3 rounded-2xl">
                <span className="text-[10px] font-bold text-amber-800 uppercase block">Ritardo Volo</span>
                <span className="text-base font-extrabold text-amber-950">Fino a € 500</span>
                <p className="text-[10px] text-amber-700 mt-0.5">Spese di prima necessità</p>
              </div>
            </div>
          </div>

          {/* Card 4: Persone Assicurate */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/90">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Persone Assicurate
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <p className="font-extrabold text-slate-900 text-sm">Assicurato 1 (Sposo)</p>
                  <p className="text-[11px] text-slate-500 font-mono">CF: Verificabile sul passaporto</p>
                </div>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                  Titolare
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <p className="font-extrabold text-slate-900 text-sm">Assicurata 2 (Sposa)</p>
                  <p className="text-[11px] text-slate-500 font-mono">CF: Verificabile sul passaporto</p>
                </div>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                  Beneficiaria
                </span>
              </div>
            </div>
          </div>

          {/* Card 5: Guida Pratica alle Emergenze Reali */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/90 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <span className="text-lg">📋</span>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                  Guida Rapida alle Casistiche Reali
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Cosa fare passo dopo passo in caso di imprevisto
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              {/* Caso 1: Ospedale */}
              <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-100 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏥</span>
                  <h4 className="font-extrabold text-rose-950 text-xs uppercase tracking-wider">
                    1. Emergenza Sanitaria / Visita o Ricovero
                  </h4>
                </div>
                <p className="text-rose-900 leading-relaxed pl-6">
                  <strong>Telefona prima alla Centrale H24</strong> (+39 02 2660 9133) indicando il numero di polizza <span className="font-mono font-bold">HMN-2026-NZAU-88942</span> per richiedere l'autorizzazione alla presa in carico diretta.
                </p>
                <div className="pl-6 flex items-center gap-2 pt-1 font-mono text-[11px] text-rose-800 font-bold">
                  <span>Pronto Soccorso:</span>
                  <span className="bg-white/80 px-2 py-0.5 rounded-md border border-rose-200">NZ: 111</span>
                  <span className="bg-white/80 px-2 py-0.5 rounded-md border border-rose-200">AU: 000</span>
                  <span className="bg-white/80 px-2 py-0.5 rounded-md border border-rose-200">PH: 911</span>
                </div>
              </div>

              {/* Caso 2: Bagaglio */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">🧳</span>
                  <h4 className="font-extrabold text-amber-950 text-xs uppercase tracking-wider">
                    2. Smarrimento Bagaglio / Ritardo Volo
                  </h4>
                </div>
                <p className="text-amber-900 leading-relaxed pl-6">
                  Fatti rilasciare subito il modulo <strong>PIR (Property Irregularity Report)</strong> al banco Lost & Found in aeroporto prima di uscire dalla zona doganale. Conserva tutti gli scontrini per acquisti di prima necessità (vestiti, spazzolino, ecc.) fino a € 500 / persona.
                </p>
              </div>

              {/* Caso 3: Passaporto o Documenti */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">🛂</span>
                  <h4 className="font-extrabold text-indigo-950 text-xs uppercase tracking-wider">
                    3. Smarrimento Passaporto o Documenti
                  </h4>
                </div>
                <p className="text-indigo-900 leading-relaxed pl-6">
                  Sporgi tempestiva denuncia alla polizia locale e contatta subito il Consolato o l'Ambasciata d'Italia per l'emissione del documento di viaggio provvisorio (ETD):
                </p>
                <div className="pl-6 space-y-1 pt-1 font-medium text-[11px] text-indigo-900">
                  <p>• <strong>Wellington (NZ):</strong> Ambasciata d'Italia — Tel: <a href="tel:+6444735339" className="underline font-mono font-bold">+64 4 473 5339</a></p>
                  <p>• <strong>Sydney (AU):</strong> Consolato Generale d'Italia — Tel: <a href="tel:+61293927900" className="underline font-mono font-bold">+61 2 9392 7900</a></p>
                  <p>• <strong>Manila (PH):</strong> Ambasciata d'Italia — Tel: <a href="tel:+63288924531" className="underline font-mono font-bold">+63 2 8892 4531</a></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditing && doc && (
        <DocumentValidityModal
          isOpen={true}
          onClose={() => setIsEditing(false)}
          document={doc}
          onSave={handleSaveDocument}
        />
      )}
    </div>
  );
}
