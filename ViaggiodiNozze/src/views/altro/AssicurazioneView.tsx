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
  const [copiedPolicy, setCopiedPolicy] = useState(false);
  const [expandedAccordion, setExpandedAccordion] = useState<string | null>('ospedale');

  const policyNumber = 'DA INSERIRE';

  const handleCopyPolicy = async () => {
    try {
      await navigator.clipboard.writeText(policyNumber);
      setCopiedPolicy(true);
      setTimeout(() => setCopiedPolicy(false), 2000);
    } catch {
      // fallback
    }
  };
  
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

  const toggleAccordion = (id: string) => {
    setExpandedAccordion(prev => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-12">
      <header className="flex items-center gap-3 mb-5 px-1">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/70 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>🛡️</span> Assicurazione &amp; SOS
          </h1>
          <p className="text-[11px] text-slate-500 font-medium">
            Polizza attiva, emergenze locali e procedure rapide
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[200px]">
          <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-1 space-y-4">
          {/* ─── SEZIONE 1: ASSICURAZIONE ─────────────────────────────────── */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-1">🛡️ Assicurazione</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Card Polizza Primaria */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/90 relative overflow-hidden">
            <div className="flex justify-between items-start gap-2 mb-3">
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                  NOME COMPAGNIA
                </span>
                <h2 className="text-lg font-black text-slate-900 mt-1.5 leading-snug">
                  Polizza Assicurativa
                </h2>
                
                {/* Numero Polizza in evidenza con tasto "Copia" */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">N°:</span>
                    <span className="font-mono text-xs font-black text-slate-900">
                      {policyNumber}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPolicy}
                      className="ml-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 transition-colors cursor-pointer"
                      title="Copia numero polizza"
                    >
                      {copiedPolicy ? '✓ Copiato!' : '📋 Copia'}
                    </button>
                  </div>
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    ✓ H24 ATTIVA
                  </span>
                </div>
              </div>

              <button 
                onClick={() => setIsEditing(true)} 
                className="text-xs text-slate-600 font-bold bg-slate-100 hover:bg-slate-200 active:scale-95 px-3 py-1.5 rounded-xl border border-slate-200 transition-all cursor-pointer shrink-0"
              >
                Modifica
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-3.5 border-t border-slate-100 text-xs">
              <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Validità</span>
                <span className="font-bold text-slate-800 text-[11px] block mt-0.5">Da inserire</span>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Copertura Paesi</span>
                <span className="font-bold text-slate-800 text-[11px] block mt-0.5">Da inserire</span>
              </div>
            </div>
          </div>

          {/* ─── SEZIONE 2: EMERGENZE & SOS ──────────────────────────────── */}
          <div className="flex items-center gap-2 mt-4 mb-2">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-500 px-1">🚨 Emergenze & SOS</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Contatti rapidi e numeri di emergenza */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
              Chiamata Rapida di Emergenza (Un Tap)
            </h3>

            {/* 1. Pulsantone Centrale Operativa H24 Assicurazione */}
            <a
              href="tel:+390000000000"
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-3xl shadow-md shadow-rose-600/20 transition-all active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-xl shrink-0 border border-white/20">
                  📞
                </span>
                <div className="min-w-0 text-left">
                  <p className="text-[10px] font-bold text-rose-200 uppercase tracking-wider">
                    ASSICURAZIONE DI VIAGGIO
                  </p>
                  <h4 className="text-sm font-extrabold text-white leading-tight truncate">
                    Centrale Operativa H24
                  </h4>
                  <p className="font-mono text-xs font-bold text-rose-100 mt-0.5">
                    +39 000 000 0000
                  </p>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-white text-rose-700 font-extrabold text-xs shadow-xs shrink-0 ml-2">
                Chiama
              </span>
            </a>

            {/* 2. Pulsantone Emergenza Sanitaria Locale */}
            <div className="w-full bg-slate-900 text-white rounded-3xl p-4 shadow-sm border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚑</span>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Emergenza Sanitaria & Urgenze Locali
                    </h4>
                    <p className="text-[10px] text-slate-400">Polizia, Ambulanza, Vigili del Fuoco</p>
                  </div>
                </div>
                <span className="text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full">
                  SOS LOCALE
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <a
                  href="tel:111"
                  className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-white/10 hover:bg-white/15 transition-all text-center border border-white/10 active:scale-95"
                >
                  <span className="text-base">🇳🇿</span>
                  <span className="text-[10px] font-bold text-slate-300 mt-0.5">NZ</span>
                  <span className="font-mono text-sm font-black text-rose-400">111</span>
                </a>

                <a
                  href="tel:000"
                  className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-white/10 hover:bg-white/15 transition-all text-center border border-white/10 active:scale-95"
                >
                  <span className="text-base">🇦🇺</span>
                  <span className="text-[10px] font-bold text-slate-300 mt-0.5">AU</span>
                  <span className="font-mono text-sm font-black text-rose-400">000</span>
                </a>

                <a
                  href="tel:911"
                  className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-white/10 hover:bg-white/15 transition-all text-center border border-white/10 active:scale-95"
                >
                  <span className="text-base">🇵🇭</span>
                  <span className="text-[10px] font-bold text-slate-300 mt-0.5">PH</span>
                  <span className="font-mono text-sm font-black text-rose-400">911</span>
                </a>
              </div>
            </div>
          </div>

          {/* Box Accordion Casistiche ("Cosa fare in caso di...") */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/90 space-y-3 mt-4">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                Cosa fare in caso di...
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Schede operative immediate per ogni imprevisto
              </p>
            </div>

            {/* Accordion 1: Ospedale */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => toggleAccordion('ospedale')}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🏥</span>
                  <span className="text-xs font-bold text-slate-900">
                    Emergenza Sanitaria / Ricovero Ospedaliero
                  </span>
                </div>
                <span className="text-slate-400 text-xs font-bold ml-2">
                  {expandedAccordion === 'ospedale' ? '▲' : '▼'}
                </span>
              </button>
              {expandedAccordion === 'ospedale' && (
                <div className="p-3.5 bg-rose-50/50 border-t border-rose-100 text-xs text-rose-950 space-y-2 leading-relaxed">
                  <p>
                    <strong>1. Telefona prima alla Centrale Operativa H24</strong> comunicando il numero di polizza <span className="font-mono font-bold">{policyNumber}</span>. In questo modo l'assicurazione invia subito la garanzia di pagamento.
                  </p>
                  <p>
                    <strong>2. In caso di pericolo di vita imminente</strong>, chiama direttamente i soccorsi locali e avvisa la centrale H24 non appena possibile.
                  </p>
                  <p>
                    <strong>3. Conserva cartelle cliniche</strong>, prescrizioni e quietanze di qualsiasi farmaco o ticket.
                  </p>
                </div>
              )}
            </div>

            {/* Accordion 2: Smarrimento Bagaglio (PIR) */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => toggleAccordion('bagaglio')}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🧳</span>
                  <span className="text-xs font-bold text-slate-900">
                    Smarrimento o Ritardo Bagaglio (Modulo PIR)
                  </span>
                </div>
                <span className="text-slate-400 text-xs font-bold ml-2">
                  {expandedAccordion === 'bagaglio' ? '▲' : '▼'}
                </span>
              </button>
              {expandedAccordion === 'bagaglio' && (
                <div className="p-3.5 bg-amber-50/50 border-t border-amber-100 text-xs text-amber-950 space-y-2 leading-relaxed">
                  <p>
                    <strong>1. Compila subito il modulo PIR</strong> al banco Lost & Found in aeroporto prima di superare i varchi doganali.
                  </p>
                  <p>
                    <strong>2. Conserva il tagliando di imbarco bagaglio (Baggage Claim Tag)</strong> attaccato al biglietto.
                  </p>
                  <p>
                    <strong>3. Acquisti di prima necessità:</strong> conserva ogni scontrino per richiedere il rimborso.
                  </p>
                </div>
              )}
            </div>

            {/* Accordion 3: Smarrimento Passaporto */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => toggleAccordion('passaporto')}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🛂</span>
                  <span className="text-xs font-bold text-slate-900">
                    Smarrimento Passaporto & Consolati
                  </span>
                </div>
                <span className="text-slate-400 text-xs font-bold ml-2">
                  {expandedAccordion === 'passaporto' ? '▲' : '▼'}
                </span>
              </button>
              {expandedAccordion === 'passaporto' && (
                <div className="p-3.5 bg-indigo-50/50 border-t border-indigo-100 text-xs text-indigo-950 space-y-2.5 leading-relaxed">
                  <p>
                    <strong>1. Fai subito denuncia</strong> presso il posto di polizia locale e richiedi copia del verbale.
                  </p>
                  <p>
                    <strong>2. Contatta la sede diplomatica competente</strong> per il rilascio di un ETD (Emergency Travel Document). Inserisci qui sotto i numeri di emergenza della tua Ambasciata locale:
                  </p>
                  <div className="space-y-2 pt-1 font-medium text-[11px] text-indigo-900">
                    <div className="p-2.5 rounded-xl bg-white/80 border border-indigo-150">
                      <p className="font-bold text-slate-900">Ambasciata / Consolato</p>
                      <p className="text-slate-600">Da inserire</p>
                      <p className="font-mono text-indigo-700 font-bold mt-0.5">
                        Tel: <span className="underline">+00 0000 000</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
