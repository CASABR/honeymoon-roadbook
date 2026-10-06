import type { TimelineItem, Attivita, Trasporto } from '../../types';
import Modal from '../common/Modal';
import { resolveMapUrl, openMapLink } from '../../utils/mapsHelper';
import { useDeviceRole } from '../../utils/useDeviceRole';

interface TimelineItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: TimelineItem | null;
  onEdit: (item: TimelineItem) => void;
}

export default function TimelineItemDetailModal({
  isOpen,
  onClose,
  item,
  onEdit
}: TimelineItemDetailModalProps) {
  const { canEdit } = useDeviceRole();
  if (!item) return null;

  const isAttivita = item.type === 'attivita';
  const isTrasporto = item.type === 'trasporto';
  const isTappa = item.type === 'tappa';
  const isShopping = item.type === 'shopping';
  const data = item.originalData;

  const modalTitle = isAttivita
    ? 'Dettagli Attività'
    : isTrasporto
    ? 'Dettagli Trasporto'
    : isTappa
    ? 'Dettagli Tappa'
    : isShopping
    ? 'Dettagli Shopping'
    : 'Dettagli Ristorante';

  const modalAccent = isAttivita ? 'amber' : isTrasporto ? 'sky' : isTappa ? 'rose' : isShopping ? 'rose' : 'emerald';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      accentVariant={modalAccent as any}
    >
      <div className="space-y-4 text-slate-800">
        {/* Intestazione con Titolo e Badge */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 leading-snug">
                {item.title}
              </h2>
              {item.copilota && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  🧭 Co-pilota
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {isAttivita
                ? `Categoria: ${data.category?.toUpperCase() || 'ATTIVITÀ'}`
                : isTrasporto
                ? `Tipo: ${data.type?.toUpperCase() || 'TRASPORTO'}`
                : isTappa
                ? 'TAPPA PROGRAMMATA'
                : isShopping
                ? 'SHOPPING & ACQUISTI'
                : 'PRENOTAZIONE RISTORANTE'}
            </p>
          </div>
          <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-xl shrink-0">
            ⏰ {item.time}
          </span>
        </div>

        {/* Informazioni specifici per Attività */}
        {isAttivita ? (
          (() => {
            const att = data as Attivita;
            return (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                    Località / Indirizzo
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">📍 {att.location}</p>
                    {att.location && (
                      <button
                        type="button"
                        onClick={() => openMapLink(resolveMapUrl(att.location))}
                        className="text-[11px] font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        Apri Maps ↗
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Stato
                    </span>
                    <span className="font-semibold capitalize text-slate-700">
                      {att.status === 'prenotato' ? '🟢 Prenotato' : 
                       att.status === 'da_valutare' ? '🟡 Da Valutare' : 
                       att.status === 'non_bloccato' ? '🟠 Non Bloccato' : '⚪ Libero'}
                    </span>
                  </div>
                  {att.duration && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                        Durata Stimata
                      </span>
                      <span className="font-semibold text-slate-700">
                        ⏱️ {att.duration}
                      </span>
                    </div>
                  )}
                  {att.cost && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                        Prezzo & Pagamento
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {!isNaN(parseFloat(att.cost)) ? parseFloat(att.cost).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) : att.cost}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${att.status === 'prenotato' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'}`}>
                          {att.status === 'prenotato' ? 'Saldato' : 'Da Saldare'}
                        </span>
                      </div>
                    </div>
                  )}
                  {att.platform && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                        Piattaforma
                      </span>
                      <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
                        {att.platform}
                      </span>
                    </div>
                  )}
                </div>

                {att.link && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Link / Sito Web
                    </span>
                    <a
                      href={att.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-600 font-semibold underline truncate block hover:text-amber-700"
                    >
                      {att.link}
                    </a>
                  </div>
                )}

                {att.notes && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                      Note & Dettagli
                    </span>
                    <p className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-700 whitespace-pre-wrap">
                      {att.notes}
                    </p>
                  </div>
                )}

                {/* Sezione Biglietto / QR Code per Attività */}
                {att.qrCode && (
                  <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">
                          Codice Prenotazione / Voucher
                        </span>
                        <p className="text-sm font-mono font-bold text-slate-900 truncate">
                          {att.qrCode}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(att.qrCode || '');
                          alert('Codice copiato negli appunti!');
                        }}
                        className="px-2.5 py-1.5 bg-white border border-amber-200 hover:bg-amber-100 text-amber-900 font-bold text-[11px] rounded-xl shrink-0 transition-colors cursor-pointer"
                      >
                        Copia codice 📋
                      </button>
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0 pt-2 border-t border-amber-200/50">
                      <div className="w-12 h-12 bg-white rounded-xl border border-amber-200 p-1 flex items-center justify-center shrink-0">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(att.qrCode)}`}
                          alt="QR Code"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <a
                        href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(att.qrCode)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] rounded-xl shrink-0 transition-colors"
                      >
                        Apri QR Code 🔍
                      </a>
                    </div>
                  </div>
                )}

                {att.attachments && att.attachments.length > 0 && (
                  <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-purple-900">
                      <span className="font-semibold flex items-center gap-1.5">
                        <span>🎟️</span>
                        <span>{att.attachments.length} biglietti/allegati caricati</span>
                      </span>
                      <span className="text-[10px] text-purple-600 font-bold">Disponibili offline</span>
                    </div>
                    <div className="grid gap-2">
                      {att.attachments.map((attach, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            const content = attach.dataUrl;
                            if (content) {
                              const w = window.open();
                              if (w) w.document.write(`<iframe src="${content}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                            } else {
                              alert('Allegato non disponibile');
                            }
                          }}
                          className="w-full text-left px-3 py-2 bg-white rounded-lg border border-purple-100 hover:border-purple-300 transition-colors flex items-center justify-between text-xs cursor-pointer"
                        >
                          <span className="truncate font-medium">{attach.name}</span>
                          <span className="shrink-0 text-purple-600">Apri ↗</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        ) : isTrasporto ? (
          /* Informazioni specifici per Trasporto */
          (() => {
            const tr = data as Trasporto;
            return (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Partenza / Ritiro
                    </span>
                    <p className="font-semibold text-slate-800">🛫 {tr.departureLocation}</p>
                    {tr.departureTime && <p className="text-[11px] text-slate-500">Ora: {tr.departureTime}</p>}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Arrivo / Riconsegna
                    </span>
                    <p className="font-semibold text-slate-800">🛬 {tr.arrivalLocation}</p>
                    {tr.arrivalTime && <p className="text-[11px] text-slate-500">Ora: {tr.arrivalTime}</p>}
                  </div>
                </div>

                {(tr.carrier || tr.bookingCode) && (
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {tr.carrier && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                          Vettore / Compagnia
                        </span>
                        <span className="font-bold text-slate-800">{tr.carrier}</span>
                      </div>
                    )}
                    {tr.bookingCode && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                          Codice PNR / Prenotazione
                        </span>
                        <span className="font-mono font-bold text-indigo-600">{tr.bookingCode}</span>
                      </div>
                    )}
                  </div>
                )}

                {(tr.cost || tr.depositPaid || tr.acconto) && (
                  <div className="grid grid-cols-2 gap-3">
                    {tr.cost && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                          Costo Totale / Saldo
                        </span>
                        <span className="font-semibold text-slate-800">{tr.cost}</span>
                      </div>
                    )}
                    {(tr.depositPaid || tr.acconto) && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                          Acconto Versato
                        </span>
                        <span className="font-semibold text-emerald-600">💰 {tr.depositPaid || tr.acconto}</span>
                      </div>
                    )}
                  </div>
                )}

                {tr.layover && (
                  <div className="bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/60">
                    <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block mb-0.5">
                      Scalo Previsto
                    </span>
                    <p className="font-bold text-amber-950">{tr.layover.airport}</p>
                    {tr.layover.duration && <p className="text-[11px] text-amber-800">Durata: {tr.layover.duration}</p>}
                  </div>
                )}

                {tr.ticketUrl && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Biglietto / Ticket URL
                    </span>
                    <a
                      href={tr.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-600 font-semibold underline truncate block hover:text-sky-700"
                    >
                      {tr.ticketUrl}
                    </a>
                  </div>
                )}

                {tr.notes && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                      Note Operative
                    </span>
                    <p className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-700 whitespace-pre-wrap">
                      {tr.notes}
                    </p>
                  </div>
                )}
              </div>
            );
          })()
        ) : isTappa ? (
          /* Informazioni specifiche per Tappa */
          (() => {
            const tp = data as import('../../types').Tappa;
            return (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                    Nome / Destinazione Tappa
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-800 text-sm">📍 {tp.titolo}</p>
                    {(tp.mapsUrl || tp.titolo) && (
                      <button
                        type="button"
                        onClick={() => openMapLink(resolveMapUrl(tp.mapsUrl || tp.titolo))}
                        className="text-[11px] font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        Apri Maps ↗
                      </button>
                    )}
                  </div>
                </div>

                {tp.data && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Data Programmata
                    </span>
                    <p className="font-semibold text-slate-700">📅 {tp.data}</p>
                  </div>
                )}

                {tp.nota && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                      Note & Suggerimenti
                    </span>
                    <p className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-700 whitespace-pre-wrap">
                      {tp.nota}
                    </p>
                  </div>
                )}
              </div>
            );
          })()
        ) : isShopping ? (
          /* Informazioni specifiche per Shopping */
          (() => {
            const sh = data as import('../../types').Shopping;
            return (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                    Negozio / Mercato / Destinazione Shopping
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-800 text-sm">🛍️ {sh.nome}</p>
                    {(sh.indirizzo || sh.nome) && (
                      <button
                        type="button"
                        onClick={() => openMapLink(resolveMapUrl(sh.indirizzo || sh.nome))}
                        className="text-[11px] font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        Apri Maps ↗
                      </button>
                    )}
                  </div>
                </div>

                {sh.indirizzo && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Indirizzo / Località
                    </span>
                    <p className="font-semibold text-slate-700">{sh.indirizzo}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {sh.orario && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                        Orario Previsto
                      </span>
                      <span className="font-semibold text-slate-700">⏰ {sh.orario}</span>
                    </div>
                  )}
                  {sh.budget && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                        Budget Indicativo
                      </span>
                      <span className="font-semibold text-rose-600">💶 {sh.budget}</span>
                    </div>
                  )}
                </div>

                {sh.link && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Link Web / Info
                    </span>
                    <a
                      href={sh.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-rose-600 font-semibold underline truncate block hover:text-rose-700"
                    >
                      {sh.link}
                    </a>
                  </div>
                )}

                {sh.nota && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                      Cosa Comprare / Note
                    </span>
                    <p className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-700 whitespace-pre-wrap">
                      {sh.nota}
                    </p>
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          /* Informazioni specifiche per Ristorante */
          (() => {
            const rt = data as import('../../types').Ristorante;
            return (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                    Ristorante / Cucina
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-800 text-sm">🍽️ {rt.nome}</p>
                    {(rt.indirizzo || rt.nome) && (
                      <button
                        type="button"
                        onClick={() => openMapLink(resolveMapUrl(rt.indirizzo || rt.nome))}
                        className="text-[11px] font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        Apri Maps ↗
                      </button>
                    )}
                  </div>
                </div>

                {rt.indirizzo && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Indirizzo
                    </span>
                    <p className="font-semibold text-slate-700">{rt.indirizzo}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {rt.orario && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                        Orario Prenotazione
                      </span>
                      <span className="font-semibold text-slate-700">⏰ {rt.orario}</span>
                    </div>
                  )}
                  {rt.budget && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                        Budget Stimato
                      </span>
                      <span className="font-semibold text-emerald-600">💶 {rt.budget}</span>
                    </div>
                  )}
                </div>

                {rt.telefono && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Telefono
                    </span>
                    <a href={`tel:${rt.telefono}`} className="font-semibold text-indigo-600 hover:underline">
                      📞 {rt.telefono}
                    </a>
                  </div>
                )}

                {rt.linkPrenotazione && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                      Link Prenotazione
                    </span>
                    <a
                      href={rt.linkPrenotazione}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 font-semibold underline truncate block hover:text-emerald-700"
                    >
                      {rt.linkPrenotazione}
                    </a>
                  </div>
                )}

                {rt.nota && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                      Note Ristorante
                    </span>
                    <p className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-700 whitespace-pre-wrap">
                      {rt.nota}
                    </p>
                  </div>
                )}
              </div>
            );
          })()
        )}

        {/* Azioni del Modale */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Chiudi
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="min-h-[44px] px-5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>✏️ Modifica</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
