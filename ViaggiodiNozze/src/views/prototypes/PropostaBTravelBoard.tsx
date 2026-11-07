import { useState } from 'react';
import { MOCK_DAY_DATA, type MockItem } from './mockTripData';

interface Props {
  isViewer?: boolean;
}

export default function PropostaBTravelBoard({ isViewer = false }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeModalItem, setActiveModalItem] = useState<MockItem | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Raggruppamento funzionale del Travel Board
  const transitItems = MOCK_DAY_DATA.items.filter(i => i.type === 'trasporto' || i.type === 'noleggio');
  const experiences = MOCK_DAY_DATA.items.filter(i => i.type === 'tappa' || i.type === 'attivita' || i.type === 'spot');
  const lodgingItem = MOCK_DAY_DATA.items.find(i => i.type === 'alloggio');

  return (
    <div className="w-full bg-[#F4F5F7] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 min-h-screen font-sans antialiased selection:bg-indigo-500/20">

      {/* ─── FLIGHT/TRAIN BOARDING HEADER ─── */}
      <header className="px-5 pt-4 pb-4 bg-[#172033] text-white sticky top-0 z-20 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#FF6B5F] bg-[#FF6B5F]/15 px-2 py-0.5 rounded border border-[#FF6B5F]/30 font-mono">
                TRAVEL MANIFEST · D{MOCK_DAY_DATA.dayNumber}
              </span>
              <span className="text-slate-400 text-xs font-mono">
                {MOCK_DAY_DATA.weather}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <h1 className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white uppercase">
                MAD <span className="text-[#FF6B5F]">➔</span> COR
              </h1>
              <span className="text-xs text-slate-300 font-medium">
                (Madrid ad Andalusia)
              </span>
            </div>
          </div>

          {!isViewer && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF6B5F] text-white text-xs font-bold hover:bg-[#e05b50] active:scale-95 transition-all shadow-xs shrink-0 cursor-pointer"
            >
              <span>+ Aggiungi</span>
            </button>
          )}
        </div>
      </header>

      {/* ─── TRAVEL BOARD CONTAINER ─── */}
      <main className="px-3.5 py-4 max-w-xl mx-auto space-y-5">

        {/* ─── SEZIONE 1: SPOSTAMENTI & LOGISTICA (BOARDING / TICKET STUB STYLE) ─── */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-blue-500 inline-block" />
              1. Spostamenti & Logistica
            </h2>
            <span className="text-[10px] font-mono text-slate-400">2 impegni vincolanti</span>
          </div>

          <div className="space-y-3">
            {transitItems.map(item => {
              const isTrain = item.type === 'trasporto';
              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#131A26] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden relative"
                >
                  {/* Striscia superiore orario & PNR */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-2 border-b border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-slate-900 dark:text-white bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                        {item.time} {item.endTime ? `➔ ${item.endTime}` : ''}
                      </span>
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        {isTrain ? 'Treno AVE Alta Velocità' : 'Ritiro Auto'}
                      </span>
                    </div>

                    {item.bookingCode && (
                      <button
                        type="button"
                        onClick={() => handleCopy(item.id, item.bookingCode!)}
                        className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
                        title="Copia codice prenotazione"
                      >
                        <span>PNR: {item.bookingCode}</span>
                        <span className="text-blue-500 font-bold">{copiedId === item.id ? '✓' : '⎘'}</span>
                      </button>
                    )}
                  </div>

                  {/* Corpo principale Boarding pass */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>

                    {/* Casellario Tecnico a griglia tipo Boarding Pass */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                      {Object.entries(item.details).map(([k, v]) => (
                        <div key={k} className="flex flex-col">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono leading-none">
                            {k}
                          </span>
                          <span className="text-xs font-black text-slate-800 dark:text-slate-200 mt-1 leading-snug">
                            {v}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Note di sicurezza */}
                    {item.notes && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                        ⚠️ {item.notes}
                      </p>
                    )}

                    {/* Footer Operativo */}
                    <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.location)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-all cursor-pointer"
                        >
                          Indicazioni ↗
                        </a>

                        {item.hasQr && (
                          <button
                            type="button"
                            onClick={() => setActiveModalItem(item)}
                            className="px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold hover:bg-blue-100 transition-all cursor-pointer"
                          >
                            Pass QR 🎟️
                          </button>
                        )}
                      </div>

                      {!isViewer && (
                        <button
                          type="button"
                          onClick={() => alert(`Modifica: ${item.title}`)}
                          className="text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          Modifica
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── SEZIONE 2: METE & ESPERIENZE (WAYPOINT TIMELINE) ─── */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-purple-500 inline-block" />
              2. Mete & Esperienze del Giorno
            </h2>
            <span className="text-[10px] font-mono text-slate-400">3 tappe in città</span>
          </div>

          <div className="bg-white dark:bg-[#131A26] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800/80">
            {experiences.map((item) => {
              const isSpot = item.type === 'spot';

              return (
                <div key={item.id} className="p-3.5 sm:p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {item.time}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 font-mono">
                        {item.type === 'spot' ? 'Spot Fotografico' : item.type === 'attivita' ? 'Tour Salta-Fila' : 'Tappa'}
                      </span>
                    </div>

                    {item.bookingCode && (
                      <button
                        type="button"
                        onClick={() => handleCopy(item.id, item.bookingCode!)}
                        className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 cursor-pointer"
                      >
                        Voucher: {item.bookingCode} {copiedId === item.id ? '✓' : ''}
                      </button>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                      {item.subtitle}
                    </p>
                  </div>

                  {/* Foto preview per spot */}
                  {isSpot && item.photoUrl && (
                    <div className="relative rounded-xl overflow-hidden aspect-21/9 max-h-32 border border-slate-200 dark:border-slate-700">
                      <img src={item.photoUrl} alt="Mirador" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2">
                        <span className="text-[10px] font-bold text-white bg-amber-600/80 px-2 py-0.5 rounded">
                          ✨ {item.goldenHour}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Dettagli sintetici */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {Object.entries(item.details).map(([k, v]) => (
                      <span key={k}>
                        <span className="text-slate-400">{k}:</span> <strong className="font-semibold">{v}</strong>
                      </span>
                    ))}
                  </div>

                  {/* Pulsantiera rapida */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.location)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white underline decoration-slate-300 dark:decoration-slate-700 underline-offset-4"
                      >
                        Indicazioni Maps ↗
                      </a>
                      {item.hasQr && (
                        <button
                          type="button"
                          onClick={() => setActiveModalItem(item)}
                          className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                        >
                          Apri QR 🎟️
                        </button>
                      )}
                    </div>

                    {!isViewer && (
                      <button
                        type="button"
                        onClick={() => alert(`Modifica: ${item.title}`)}
                        className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        Modifica
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── SEZIONE 3: BASE & ALLOGGIO (HOSPITALITY VOUCHER) ─── */}
        {lodgingItem && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-rose-500 inline-block" />
                3. Base & Pernottamento Serale
              </h2>
              <span className="text-[10px] font-mono text-rose-500 font-bold">Check-in dalle 15:00</span>
            </div>

            <div className="bg-white dark:bg-[#131A26] rounded-2xl border border-rose-200 dark:border-rose-950/60 p-4 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {lodgingItem.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lodgingItem.address}
                  </p>
                </div>

                {lodgingItem.bookingCode && (
                  <button
                    type="button"
                    onClick={() => handleCopy(lodgingItem.id, lodgingItem.bookingCode!)}
                    className="font-mono text-[10px] font-bold px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 cursor-pointer shrink-0"
                  >
                    Prenotazione: {lodgingItem.bookingCode} {copiedId === lodgingItem.id ? '✓' : ''}
                  </button>
                )}
              </div>

              {/* Servizi & Info Check-in */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-rose-50/50 dark:bg-rose-950/20 p-2.5 rounded-xl border border-rose-100 dark:border-rose-900/30">
                {Object.entries(lodgingItem.details).map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-wider text-rose-600/80 dark:text-rose-400 font-bold font-mono">
                      {k}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {v}
                    </span>
                  </div>
                ))}
              </div>

              {lodgingItem.notes && (
                <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Arrivo in auto: </span>
                  {lodgingItem.notes}
                </div>
              )}

              {/* Bottoni Operativi Alloggio */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lodgingItem.address || lodgingItem.location)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    Naviga all'Hotel ↗
                  </a>
                  <a
                    href="tel:+34957498900"
                    className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                  >
                    Chiama Reception 📞
                  </a>
                </div>

                {!isViewer && (
                  <button
                    type="button"
                    onClick={() => alert(`Modifica: ${lodgingItem.title}`)}
                    className="text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    Modifica
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

      </main>

      {/* ─── MODAL QR CODE SIMULATA ─── */}
      {activeModalItem && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setActiveModalItem(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl border border-slate-200 dark:border-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 mx-auto flex items-center justify-center text-xl mb-3">
              ✈️
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              {activeModalItem.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
              Manifest Boarding Ref: {activeModalItem.bookingCode}
            </p>

            <div className="my-5 p-4 bg-white rounded-2xl border border-slate-200 shadow-inner flex flex-col items-center">
              <div className="w-40 h-40 bg-slate-900 rounded-lg p-2 flex items-center justify-center">
                <div className="w-full h-full border-4 border-dashed border-white/50 flex flex-col items-center justify-center text-white text-xs font-mono">
                  <span>[ BOARDING PASS ]</span>
                  <span className="text-[9px] mt-1 text-white/70">{activeModalItem.bookingCode}</span>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-2">Valido per accesso rapido ai varchi</span>
            </div>

            <button
              type="button"
              onClick={() => setActiveModalItem(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer transition-all"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* ─── BOTTOM NAV SIMULATA ─── */}
      <footer className="sticky bottom-0 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-[#0B0F17]/95 backdrop-blur-md px-6 py-2 flex items-center justify-around z-30">
        <div className="flex flex-col items-center text-[#FF6B5F]">
          <span className="text-xs font-black font-mono">OGGI</span>
          <div className="w-1.5 h-1 rounded-full bg-[#FF6B5F] mt-0.5" />
        </div>
        <div className="flex flex-col items-center text-slate-400">
          <span className="text-xs font-bold font-mono">MAPPA</span>
        </div>
        <div className="flex flex-col items-center text-slate-400">
          <span className="text-xs font-bold font-mono">CATEGORIE</span>
        </div>
        <div className="flex flex-col items-center text-slate-400">
          <span className="text-xs font-bold font-mono">HUB</span>
        </div>
      </footer>
    </div>
  );
}
