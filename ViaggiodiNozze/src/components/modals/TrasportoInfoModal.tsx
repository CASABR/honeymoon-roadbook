import type { Trasporto } from '../../types';
import Modal from '../common/Modal';
import { formatDate } from '../../utils/tripDates';

interface TrasportoInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  transport: Trasporto | null;
}

export default function TrasportoInfoModal({ isOpen, onClose, transport }: TrasportoInfoModalProps) {
  if (!transport) return null;

  const isRental = transport.type === 'auto' || transport.type === 'camper';
  const hasOperativeData = transport.terminalGate || transport.checkinCutoff || transport.bookingCode || transport.posti;
  const hasBagagli = !!transport.bagagli;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dettagli Trasporto" accentVariant="sky">
      <div className="space-y-4">
        
        {/* 1. Header Card (Dati di Viaggio Principali) */}
        <div className="p-4 rounded-2xl bg-white shadow-sm border border-slate-200">
          <div className="flex items-center justify-between gap-2 flex-wrap pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg uppercase tracking-wide border border-sky-100">
                {transport.type}
              </span>
              {transport.completed && (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">✓ Completato</span>
              )}
            </div>
            <span className="text-sm font-bold text-slate-700">
              {formatDate(transport.date)}
            </span>
          </div>

          <div className="mt-3">
            {transport.carrier && (
              <div className="text-sm font-extrabold text-slate-900 mb-2">
                {transport.carrier}
              </div>
            )}
            
            {!isRental ? (
              <div className="flex items-center gap-2 text-slate-700 text-sm font-medium">
                <span className="truncate">{transport.departureLocation}</span>
                <span className="text-sky-500 shrink-0">➔</span>
                <span className="truncate">{transport.arrivalLocation}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex gap-2">
                  <span className="text-slate-400">Ritiro:</span>
                  <span className="text-slate-700 font-medium">{transport.departureLocation}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-400">Riconsegna:</span>
                  <span className="text-slate-700 font-medium">{transport.dropoffLocation || transport.arrivalLocation}</span>
                </div>
              </div>
            )}
            
            <div className="mt-2 text-xs font-semibold text-slate-500 flex gap-4">
              {transport.departureTime && <span>Partenza: {transport.departureTime}</span>}
              {transport.arrivalTime && <span>Arrivo: {transport.arrivalTime}</span>}
            </div>
          </div>
        </div>

        {/* 2. Card Operativa Imbarco & Accesso (Quick-Look) */}
        {hasOperativeData && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Imbarco & Accesso</h4>
            <div className="grid grid-cols-2 gap-3">
              {transport.terminalGate && (
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">Terminal / Gate</div>
                  <div className="text-xs font-bold text-slate-800">{transport.terminalGate}</div>
                </div>
              )}
              {transport.checkinCutoff && (
                <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100">
                  <div className="text-[10px] text-rose-500 uppercase font-bold mb-0.5">Check-in Cutoff</div>
                  <div className="text-xs font-bold text-rose-700">{transport.checkinCutoff}</div>
                </div>
              )}
              {transport.bookingCode && (
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">PNR / Ticket</div>
                  <div className="text-xs font-mono font-bold text-sky-700">{transport.bookingCode}</div>
                </div>
              )}
              {transport.posti && (
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">Posti Assegnati</div>
                  <div className="text-xs font-bold text-slate-800">{transport.posti}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Card Bagagli & Requisiti */}
        {(hasBagagli || transport.ticketUrl) && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Bagagli & Documenti</h4>
            {transport.bagagli && (
              <div className="flex gap-2 items-start text-sm text-slate-700 mb-3 bg-white p-3 rounded-xl border border-slate-200">
                <span className="shrink-0 mt-0.5">🧳</span>
                <p className="leading-snug">{transport.bagagli}</p>
              </div>
            )}
            {transport.ticketUrl && (
              <a
                href={transport.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-xs transition-colors border border-sky-200"
              >
                <span>🎟️ Apri Voucher / E-Ticket</span>
              </a>
            )}
          </div>
        )}

        {/* 4. Card Scalo */}
        {transport.layover && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-1.5 mb-2">
              <span>🛑</span>
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Scalo Tecnico</h4>
            </div>
            <div className="text-sm font-bold text-amber-900 mb-1">{transport.layover.airport}</div>
            {transport.layover.duration && (
              <div className="text-xs text-amber-700 font-medium mb-2">
                Durata: {transport.layover.duration}
              </div>
            )}
            <div className="flex gap-4 text-xs font-mono text-amber-800 bg-amber-100/50 p-2 rounded-lg">
              {transport.layover.arrivalTime && <span>Arr: {transport.layover.arrivalTime}</span>}
              {transport.layover.departureTime && <span>Part: {transport.layover.departureTime}</span>}
            </div>
            {transport.layover.notes && (
              <p className="mt-2 text-xs text-amber-800 leading-relaxed border-t border-amber-200/50 pt-2">
                {transport.layover.notes}
              </p>
            )}
          </div>
        )}

        {/* 5. Card Note Copilota */}
        {transport.noteCopilota && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
            <div className="flex items-center gap-1.5 mb-2">
              <span>🧭</span>
              <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Note Operative Copilota</h4>
            </div>
            <div className="text-xs text-emerald-800 leading-relaxed whitespace-pre-wrap font-medium">
              {transport.noteCopilota}
            </div>
          </div>
        )}

        {/* Pagamenti Rapido (se serve, messo in basso piccolo) */}
        {(transport.cost || transport.depositPaid || transport.acconto) && (
          <div className="flex justify-between items-center px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs">
            <span className="text-slate-500 font-bold">Costo Totale: <span className="text-slate-800">{transport.cost || '-'}</span></span>
            {(transport.depositPaid || transport.acconto) && (
              <span className="text-emerald-600 font-bold">Acconto: {transport.depositPaid || transport.acconto}</span>
            )}
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </Modal>
  );
}
