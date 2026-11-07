import { useState } from 'react';
import { MOCK_DAY_DATA, type MockItem } from './mockTripData';

interface Props {
  isViewer?: boolean;
}

export default function PropostaARoadbookEditoriale({ isViewer = false }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeModalItem, setActiveModalItem] = useState<MockItem | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full bg-[#FAF9F5] dark:bg-[#0F141C] text-slate-900 dark:text-slate-100 min-h-screen font-sans antialiased selection:bg-[#FF6B5F]/20">
      
      {/* ─── HEADER EDITORIALE COMPATTO ─── */}
      <header className="px-5 pt-4 pb-5 border-b border-stone-200/80 dark:border-slate-800/80 bg-[#FAF9F5]/90 dark:bg-[#0F141C]/90 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-widest uppercase text-[#FF6B5F] font-mono">
                GIORNO {MOCK_DAY_DATA.dayNumber} DI {MOCK_DAY_DATA.totalDays}
              </span>
              <span className="text-stone-300 dark:text-slate-700">·</span>
              <span className="text-[11px] text-stone-500 dark:text-slate-400 font-medium">
                {MOCK_DAY_DATA.weather}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-stone-900 dark:text-white mt-0.5 font-brand-title">
              {MOCK_DAY_DATA.location}
            </h1>
            <p className="text-xs text-stone-500 dark:text-slate-400 font-medium">
              {MOCK_DAY_DATA.formattedDate}
            </p>
          </div>

          {!isViewer && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-xs shrink-0 cursor-pointer"
            >
              <span className="text-sm leading-none">+</span>
              <span>Aggiungi</span>
            </button>
          )}
        </div>
      </header>

      {/* ─── TIMELINE CONTINUA (ROADBOOK CHRONICLE) ─── */}
      <main className="px-4 py-5 max-w-xl mx-auto">
        <div className="relative">
          {/* Vertical continuous spine */}
          <div className="absolute left-[54px] top-4 bottom-4 w-[2px] bg-stone-200 dark:bg-slate-800" />

          <div className="space-y-6">
            {MOCK_DAY_DATA.items.map((item) => {
              const isSpot = item.type === 'spot';

              return (
                <div key={item.id} className="relative flex items-start gap-4 group">
                  {/* Colonna Orario (Protagonista Visivo) */}
                  <div className="w-[46px] shrink-0 pt-1 text-right">
                    <span className="font-mono text-xs sm:text-sm font-black text-stone-900 dark:text-white block leading-none tabular-nums tracking-tight">
                      {item.time}
                    </span>
                    {item.endTime && (
                      <span className="font-mono text-[10px] text-stone-400 dark:text-slate-500 block leading-tight mt-1 tabular-nums">
                        {item.endTime}
                      </span>
                    )}
                  </div>

                  {/* Punto di connessione sulla colonna continua */}
                  <div className="relative z-10 shrink-0 mt-1.5">
                    <div 
                      className="w-3.5 h-3.5 rounded-full bg-white dark:bg-[#0F141C] border-2 flex items-center justify-center transition-transform group-hover:scale-110 shadow-xs"
                      style={{ borderColor: item.accentColor }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.accentColor }} />
                    </div>
                  </div>

                  {/* Corpo Evento Roadbook (Niente scatola card anonima) */}
                  <div className="min-w-0 flex-1 bg-white dark:bg-[#161D2A] rounded-2xl border border-stone-200/80 dark:border-slate-800/80 p-3.5 sm:p-4 shadow-xs transition-shadow hover:shadow-md">
                    
                    {/* Testata dell'evento: Categoria discreta & PNR */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span 
                        className="text-[10px] font-extrabold uppercase tracking-widest font-mono"
                        style={{ color: item.accentColor }}
                      >
                        {item.type === 'trasporto' ? 'Trasporto AVE' :
                         item.type === 'alloggio' ? 'Base & Hotel' :
                         item.type === 'noleggio' ? 'Auto a Noleggio' :
                         item.type === 'spot' ? 'Spot Fotografico' :
                         item.type === 'attivita' ? 'Esperienza Guidata' : 'Tappa'}
                      </span>

                      {/* Codice Prenotazione Rapido */}
                      {item.bookingCode && (
                        <button
                          type="button"
                          onClick={() => handleCopy(item.id, item.bookingCode!)}
                          className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1 border border-stone-200/70 dark:border-slate-700"
                          title="Copia codice prenotazione"
                        >
                          <span>PNR: {item.bookingCode}</span>
                          <span className="text-[9px] text-[#FF6B5F]">
                            {copiedId === item.id ? '✓' : '⎘'}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Titolo e percorso */}
                    <h2 className="text-sm sm:text-base font-bold text-stone-900 dark:text-white leading-snug">
                      {item.title}
                    </h2>

                    {item.subtitle && (
                      <p className="text-xs text-stone-500 dark:text-slate-400 font-medium mt-0.5">
                        {item.subtitle}
                      </p>
                    )}

                    {/* Dettagli operativi specifici in griglia discreta */}
                    <div className="mt-2.5 pt-2 border-t border-stone-100 dark:border-slate-800/80 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {Object.entries(item.details).map(([k, v]) => (
                        <div key={k} className="flex items-baseline gap-1 text-[11px]">
                          <span className="text-stone-400 dark:text-slate-500 font-medium">{k}:</span>
                          <span className="font-semibold text-stone-800 dark:text-slate-200">{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Spot Fotografico Anteprima */}
                    {isSpot && item.photoUrl && (
                      <div className="mt-3 relative rounded-xl overflow-hidden border border-stone-200 dark:border-slate-700 aspect-video max-h-36">
                        <img src={item.photoUrl} alt="Mirador" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-2.5">
                          <span className="text-[11px] font-bold text-white bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded">
                            ✨ {item.goldenHour}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Note operative essenziali */}
                    {item.notes && (
                      <div className="mt-2 text-[11px] text-stone-500 dark:text-slate-400 bg-stone-50 dark:bg-slate-900/50 p-2 rounded-lg border border-stone-100 dark:border-slate-800/60 leading-relaxed">
                        <span className="font-bold text-stone-700 dark:text-slate-300">Nota: </span>
                        {item.notes}
                      </div>
                    )}

                    {/* Barra Azioni Operative (Tutti i pulsanti essenziali a portata di pollice) */}
                    <div className="mt-3 pt-2 border-t border-stone-100 dark:border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Indicazioni Maps */}
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.location)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-slate-800 hover:bg-stone-200 dark:hover:bg-slate-700 text-stone-800 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer border border-stone-200/60 dark:border-slate-700"
                        >
                          <span>Indicazioni</span>
                          <span className="text-[10px]">↗</span>
                        </a>

                        {/* Voucher o Biglietto QR */}
                        {item.hasQr && (
                          <button
                            type="button"
                            onClick={() => setActiveModalItem(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FF6B5F]/10 text-[#FF6B5F] hover:bg-[#FF6B5F]/20 text-xs font-bold transition-colors cursor-pointer border border-[#FF6B5F]/20"
                          >
                            <span>Biglietto QR</span>
                          </button>
                        )}
                      </div>

                      {/* Azione di gestione solo per Owner/Copilota */}
                      {!isViewer && (
                        <div className="flex items-center gap-1 text-stone-400 dark:text-slate-500">
                          <button
                            type="button"
                            onClick={() => alert(`Modifica: ${item.title}`)}
                            className="text-[11px] font-semibold hover:text-stone-900 dark:hover:text-white px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            Modifica
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* ─── VOUCHER QR MODAL SIMULATA ─── */}
      {activeModalItem && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setActiveModalItem(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl border border-stone-200 dark:border-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-slate-800 mx-auto flex items-center justify-center text-xl mb-3">
              🎟️
            </div>
            <h3 className="text-base font-bold text-stone-900 dark:text-white">
              {activeModalItem.title}
            </h3>
            <p className="text-xs text-stone-500 dark:text-slate-400 mt-1 font-mono">
              Codice: {activeModalItem.bookingCode || 'CONFERMATO'}
            </p>

            <div className="my-5 p-4 bg-white rounded-2xl border border-stone-200 shadow-inner flex flex-col items-center">
              {/* QR Mockup visual */}
              <div className="w-40 h-40 bg-stone-900 rounded-lg p-2 flex items-center justify-center">
                <div className="w-full h-full border-4 border-dashed border-white/50 flex flex-col items-center justify-center text-white text-xs font-mono">
                  <span>[ QR PASS ]</span>
                  <span className="text-[9px] mt-1 text-white/70">{activeModalItem.bookingCode}</span>
                </div>
              </div>
              <span className="text-[10px] text-stone-500 font-mono mt-2">Valido per 2 passeggeri</span>
            </div>

            <button
              type="button"
              onClick={() => setActiveModalItem(null)}
              className="w-full py-2.5 rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-900 text-xs font-bold cursor-pointer transition-all"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* ─── BOTTOM NAV SIMULATA (MOBILE SHELL) ─── */}
      <footer className="sticky bottom-0 border-t border-stone-200/80 dark:border-slate-800/80 bg-[#FAF9F5]/95 dark:bg-[#0F141C]/95 backdrop-blur-md px-6 py-2 flex items-center justify-around z-30">
        <div className="flex flex-col items-center text-[#FF6B5F]">
          <span className="text-xs font-extrabold">Oggi</span>
          <div className="w-1 h-1 rounded-full bg-[#FF6B5F] mt-0.5" />
        </div>
        <div className="flex flex-col items-center text-stone-400 dark:text-slate-500">
          <span className="text-xs font-bold">Mappa</span>
        </div>
        <div className="flex flex-col items-center text-stone-400 dark:text-slate-500">
          <span className="text-xs font-bold">Categorie</span>
        </div>
        <div className="flex flex-col items-center text-stone-400 dark:text-slate-500">
          <span className="text-xs font-bold">Altro</span>
        </div>
      </footer>
    </div>
  );
}
