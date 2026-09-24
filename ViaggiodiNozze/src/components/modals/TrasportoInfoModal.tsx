import type { Trasporto } from '../../types';
import Modal from '../common/Modal';
import { getTransportMapTargets } from '../../utils/mapsHelper';

interface TrasportoInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  transport: Trasporto | null;
}

export default function TrasportoInfoModal({ isOpen, onClose, transport }: TrasportoInfoModalProps) {
  if (!transport) return null;

  const mapTargets = getTransportMapTargets(transport);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  const isRental = transport.type === 'auto' || transport.type === 'camper';

  // Analisi intelligente del testo delle note per estrarre sezioni con icone
  const parseNotes = (notesText: string) => {
    const parts = notesText.split(/(?<=[.!?])\s+/);
    return parts.map((part, index) => {
      const lower = part.toLowerCase();
      let icon = 'ℹ️';
      let title = '';

      if (lower.includes('franchigia') || lower.includes('bagagl') || lower.includes('colli') || lower.includes('kg')) {
        icon = '🧳';
        title = 'Franchigia Bagagli';
      } else if (lower.includes('biosicurezza') || lower.includes('trekking') || lower.includes('calzatur') || lower.includes('dichiar')) {
        icon = '🌿';
        title = 'Controlli Biosicurezza';
      } else if (lower.includes('chiav') || lower.includes('cassett') || lower.includes('ritiro notturno') || lower.includes('contactless')) {
        icon = '🔑';
        title = 'Ritiro Chiavi & Accesso';
      } else if (lower.includes('targa') || lower.includes('linkt') || lower.includes('pedaggi')) {
        icon = '🛣️';
        title = 'Pedaggi & Registrazione';
      } else if (lower.includes('tassativo') || lower.includes('check-in') || lower.includes('imbarco') || lower.includes('minuti prima')) {
        icon = '⏱️';
        title = 'Check-in & Imbarco';
      } else if (lower.includes('navetta') || lower.includes('one-way fee')) {
        icon = '🚐';
        title = 'Navetta & Tariffe';
      }

      return (
        <div key={index} className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-800">
          <div className="flex items-start gap-2.5">
            <span className="text-base shrink-0 pt-0.5">{icon}</span>
            <div className="min-w-0 flex-1">
              {title && (
                <div className="font-bold text-sky-800 text-[11px] uppercase tracking-wider mb-0.5">
                  {title}
                </div>
              )}
              <p className="leading-relaxed text-slate-700">{part}</p>
            </div>
          </div>
        </div>
      );
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dettagli & Indicazioni Navigatore" accentVariant="sky">
      <div className="space-y-4">
        {/* Intestazione Principale Tratta */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-sky-800 uppercase tracking-wide">
                {transport.type.toUpperCase()}
              </span>
              {transport.copilota && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span>🧭</span>
                  <span>Co-pilota</span>
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {formatDate(transport.date)}
            </span>
          </div>

          <div className="mt-2 text-sm font-bold text-slate-900 leading-snug">
            {isRental ? (
              <span>{transport.carrier || 'Noleggio Veicolo'}</span>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>{transport.departureLocation}</span>
                <span className="text-sky-600">➔</span>
                <span>{transport.arrivalLocation}</span>
              </div>
            )}
          </div>

          {transport.carrier && !isRental && (
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span>Compagnia:</span>
              <span className="text-slate-800 font-semibold">{transport.carrier}</span>
            </div>
          )}

          {transport.bookingCode && (
            <div className="text-xs text-slate-600 mt-1.5 flex items-center gap-2">
              <span className="text-slate-500">Codice PNR:</span>
              <span className="font-mono font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                {transport.bookingCode}
              </span>
            </div>
          )}

          {/* Navigatore Maps Primario Rapido */}
          {mapTargets.primaryUrl && (
            <div className="mt-3 pt-2.5 border-t border-slate-200">
              <a
                href={mapTargets.primaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer min-h-[40px]"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Naviga verso {mapTargets.primaryLabel} con Google Maps</span>
              </a>
            </div>
          )}
        </div>

        {/* Dettagli Indirizzi / Orari Estesi per Noleggio con Link Maps */}
        {isRental && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase tracking-wider">
                  <span>🔑</span>
                  <span>Sede Ritiro (Pick-up)</span>
                </div>
                {mapTargets.pickupUrl && (
                  <a
                    href={mapTargets.pickupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 transition-colors"
                  >
                    <span>Apri Maps</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
              <div className="text-xs text-slate-800 font-semibold">
                {formatDate(transport.date)} {transport.departureTime ? `• ore ${transport.departureTime}` : ''}
              </div>
              <div className="text-xs text-slate-600 leading-relaxed">
                {transport.departureLocation}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase tracking-wider">
                  <span>🏁</span>
                  <span>Sede Riconsegna (Drop-off)</span>
                </div>
                {mapTargets.dropoffUrl && (
                  <a
                    href={mapTargets.dropoffUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 transition-colors"
                  >
                    <span>Apri Maps</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
              <div className="text-xs text-slate-800 font-semibold">
                {formatDate(transport.dropoffDate || transport.date)}{' '}
                {transport.dropoffTime ? `• ore ${transport.dropoffTime}` : ''}
              </div>
              <div className="text-xs text-slate-600 leading-relaxed">
                {transport.dropoffLocation || transport.arrivalLocation}
              </div>
            </div>
          </div>
        )}

        {/* Dettagli Tratta con Collegamenti Terminal per Voli e Traghetti */}
        {!isRental && (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
            <div className="text-xs font-bold text-sky-800 uppercase tracking-wider">
              Terminal e Moli di Imbarco
            </div>
            <div className="space-y-2 text-xs">
              {mapTargets.departureUrl && (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                  <div className="truncate min-w-0">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Partenza:</span>
                    <span className="text-slate-800 font-semibold truncate block">{transport.departureLocation}</span>
                  </div>
                  <a
                    href={mapTargets.departureUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] shrink-0 border border-emerald-200"
                  >
                    Maps ➔
                  </a>
                </div>
              )}

              {mapTargets.arrivalUrl && (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                  <div className="truncate min-w-0">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Arrivo:</span>
                    <span className="text-slate-800 font-semibold truncate block">{transport.arrivalLocation}</span>
                  </div>
                  <a
                    href={mapTargets.arrivalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] shrink-0 border border-emerald-200"
                  >
                    Maps ➔
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dettagli Scalo Esteso (se presente) */}
        {transport.layover && (
          <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-1.5">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <span>🛑</span>
                <span>Dettagli Scalo: {transport.layover.airport}</span>
              </span>
              {mapTargets.layoverUrl && (
                <a
                  href={mapTargets.layoverUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1"
                >
                  <span>Mappa Scalo</span>
                  <span>➔</span>
                </a>
              )}
            </div>
            {transport.layover.duration && (
              <div className="text-xs text-amber-800 font-medium">
                <strong>Durata attesa prevista:</strong> {transport.layover.duration}
              </div>
            )}
            {(transport.layover.arrivalTime || transport.layover.departureTime) && (
              <div className="text-xs font-mono text-slate-700">
                Arrivo: {transport.layover.arrivalTime || '—'} ➔ Ripartenza: {transport.layover.departureTime || '—'}
              </div>
            )}
            {transport.layover.notes && (
              <p className="text-xs text-slate-700 pt-1 border-t border-amber-200">
                {transport.layover.notes}
              </p>
            )}
          </div>
        )}

        {/* Riepilogo Costi, Saldo ed Acconto Pagato */}
        {(transport.cost || transport.depositPaid || transport.acconto) && (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>💳</span>
              <span>Dati Economici & Pagamento</span>
            </div>
            <div className="space-y-1.5 text-xs">
              {transport.cost && (
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Costo / Saldo da pagare:</span>
                  <span className="font-bold text-slate-900">{transport.cost}</span>
                </div>
              )}
              {(transport.depositPaid || transport.acconto) && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-emerald-800 font-semibold flex items-center gap-1">
                    <span>✓</span>
                    <span>Acconto già dato:</span>
                  </span>
                  <span className="font-extrabold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-lg border border-emerald-300">
                    {transport.depositPaid || transport.acconto}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sezione Note Operative Spacchettata per Icone */}
        {transport.notes && (
          <div className="space-y-2 pt-1">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Istruzioni Operative & Franchigie
            </h3>
            <div className="space-y-2">
              {parseNotes(transport.notes)}
            </div>
          </div>
        )}

        {/* Link Biglietto / Voucher esterno */}
        {transport.ticketUrl && (
          <div className="pt-2">
            <a
              href={transport.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 font-semibold text-xs transition-colors cursor-pointer min-h-[40px]"
            >
              <span>Apri Link Voucher / Biglietto Esterno</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {/* Pulsante Chiusura Rapido */}
        <div className="pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer min-h-[40px]"
          >
            Chiudi
          </button>
        </div>
      </div>
    </Modal>
  );
}
