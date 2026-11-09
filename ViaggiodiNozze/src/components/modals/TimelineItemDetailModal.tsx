import { isTaskTappa, getTaskLink } from '../../utils/taskTappa';
import { useState } from 'react';
import type { TimelineItem, TransportAttachment } from '../../types';
import Modal from '../common/Modal';
import { Handshake, Copy, Check, ExternalLink } from 'lucide-react';
import { resolveMapUrl, openMapLink, hasReliableGeoDestination } from '../../utils/mapsHelper';
import GoogleMapsIcon from '../icons/GoogleMapsIcon';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { openAttachmentInNewTab } from '../../utils/fileAttachment';
import { formatDateIT } from '../../utils/tripDates';
import { PHOTO_LIGHT_LABELS, formatHikingDuration } from '../../utils/activityType';
import { resolvePaymentInfo } from '../../utils/priceHelper';

interface TimelineItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: TimelineItem | null;
  onEdit: (item: TimelineItem) => void;
  onDuplicate?: (item: TimelineItem) => void;
}

export default function TimelineItemDetailModal({
  isOpen,
  onClose,
  item,
  onEdit,
  onDuplicate
}: TimelineItemDetailModalProps) {
  const { canEdit, canSeePrivateInfo: deviceCanSeePrivate } = useDeviceRole();
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [pnrCopied, setPnrCopied] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);

  const isExternalLiveView = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('live') === '1' ||
    new URLSearchParams(window.location.search).get('live') === 'true' ||
    new URLSearchParams(window.location.search).get('view') === 'live' ||
    (window.location.hash || '').toLowerCase().includes('live')
  );
  const canSeePrivateInfo = !isExternalLiveView && deviceCanSeePrivate;

  if (!item) return null;

  const isAttivita = item.type === 'attivita';
  const isTrasporto = item.type === 'trasporto';
  const isTappa = item.type === 'tappa';
  const isShopping = item.type === 'shopping';
  const isAlloggio = item.type === 'alloggio';
  const isRistorante = item.type === 'ristorante';
  const data = item.originalData as any;

  const isTask = isTappa && isTaskTappa(data);
  const taskLink = isTask ? getTaskLink(data?.link) : undefined;

  // 1. Note: separazione semantica rigorosa
  const rawCopilotNotes = (
    item.noteCopilota ||
    data?.noteCopilota ||
    ''
  ).trim();

  const rawGeneralNotes = (
    data?.notes ||
    data?.nota ||
    ''
  ).trim();

  const safeCopilotNotes = canSeePrivateInfo
    ? rawCopilotNotes
    : rawCopilotNotes.replace(/\b(PIN|codice|keybox|cassaforte|digita)\s*[:=-]?\s*([A-Z0-9#*]{3,12})/gi, '$1: [Riservato]');

  // Header meta & accent
  const modalTitle = isAttivita
    ? 'Dettagli Attività'
    : isTrasporto
    ? 'Dettagli Trasporto'
    : isTappa
    ? (isTask ? 'Dettagli Task' : 'Dettagli Tappa')
    : isShopping
    ? 'Dettagli Shopping'
    : isAlloggio
    ? 'Dettagli Alloggio'
    : 'Dettagli Ristorante';

  const modalAccent = isAttivita ? 'amber' : isTrasporto ? 'sky' : isTappa ? 'rose' : isShopping ? 'rose' : isAlloggio ? 'purple' : 'emerald';

  const categoryBadgeLabel = isAttivita
    ? (data.sottocategoria || data.category || 'Attività')
    : isTrasporto
    ? (data.type ? data.type.toUpperCase() : 'TRASPORTO')
    : isTappa
    ? (data.sottocategoria || 'TAPPA')
    : isShopping
    ? (data.sottocategoria || 'SHOPPING')
    : isAlloggio
    ? (data.sottocategoria ? `ALLOGGIO · ${data.sottocategoria.toUpperCase()}` : 'ALLOGGIO')
    : (data.sottocategoria ? `RISTORANTE · ${data.sottocategoria.toUpperCase()}` : 'RISTORANTE');

  // Mappa
  const mapTarget = isTrasporto
    ? (data.arrivalLocation || data.dropoffLocation || data.departureLocation || item.location)
    : isAlloggio
    ? (data.address || data.location || data.name || item.location)
    : (data.indirizzo || data.location || data.address || item.location);

  const mapCoordinates = data?.coordinate || item.coordinate;
  const reliableMapDestination = hasReliableGeoDestination({ coordinate: mapCoordinates, mapsUrl: data?.mapsUrl || (data as any)?.googleMapsUrl, indirizzo: mapTarget });

  // Orario principale
  const isTimeConfirmed = (data?.timeStatus || item.timeStatus) === 'confermato';
  const primaryTimeDisplay = item.time ? (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${
      isTimeConfirmed && !isTrasporto
        ? 'text-[#E11D48] dark:text-[#FF6B5F] bg-rose-50 dark:bg-rose-950/40 border border-[#E11D48]/35 font-black'
        : 'text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800'
    }`}>
      {isTimeConfirmed && !isTrasporto && <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48] dark:bg-[#FF6B5F]" />}
      <span>⏰ {item.time}</span>
      {!isTrasporto && (
        <span className="text-[10px] uppercase font-semibold opacity-80">
          · {isTimeConfirmed ? 'Confermato' : 'indicativo'}
        </span>
      )}
    </span>
  ) : null;

  // Informazioni Economiche
  const paymentInfo = resolvePaymentInfo({
    cost: data?.cost || data?.costo || (isShopping ? data?.budget : undefined),
    depositPaid: data?.depositPaid || data?.acconto || data?.amountPaid,
    paymentStatus: data?.paymentStatus || data?.status,
    status: data?.status,
    completed: data?.completed,
    packageIncluded: Boolean(data?.packageIncluded)
  });

  const hasCostInfo = paymentInfo.costNum > 0 || paymentInfo.isPackageIncluded || Boolean(data?.budget) || paymentInfo.paidNum > 0;

  const hasOperationalDetails = isTrasporto
    ? Boolean(data?.carrier || data?.bookingCode || data?.terminalGate || data?.posti || (data?.type === 'volo' && data?.layover?.airport) || data?.bagagli || data?.provider || ['volo', 'traghetto', 'treno', 'auto', 'camper', 'transfer'].includes(data?.type))
    : isAlloggio
    ? true
    : isAttivita
    ? Boolean(data?.bookingCode || data?.ritrovo || data?.orarioRitrovo || data?.guida || data?.durata || data?.dislivello || data?.lightWindow || data?.photoSubject || (data?.openingHours?.weekly && Object.keys(data.openingHours.weekly).length > 0))
    : isTappa
    ? Boolean(data?.bookingCode || data?.qrCode || data?.lightWindow || data?.photoSubject || (data?.openingHours?.weekly && Object.keys(data.openingHours.weekly).length > 0))
    : isRistorante
    ? Boolean(data?.bookingCode || data?.tavolo || data?.persone || data?.telefono || data?.linkPrenotazione)
    : isShopping
    ? Boolean(data?.scopo || data?.link)
    : false;

  // Allegati unificati
  const attachments: TransportAttachment[] = [
    ...(data?.attachments || []),
    ...(data?.ticketUrl ? [{ id: 'ticket_url', name: 'Biglietto / Voucher', url: data.ticketUrl, type: 'pdf' as const, purpose: 'ticket' as const, size: 0, mimeType: 'application/pdf', uploadedAt: 0 }] : []),
    ...(data?.voucherUrl ? [{ id: 'voucher_url', name: 'Voucher Prenotazione', url: data.voucherUrl, type: 'pdf' as const, purpose: 'ticket' as const, size: 0, mimeType: 'application/pdf', uploadedAt: 0 }] : []),
    ...(data?.bookingUrl ? [{ id: 'booking_url', name: 'Pagina Prenotazione', url: data.bookingUrl, type: 'other' as const, size: 0, mimeType: 'text/html', uploadedAt: 0 }] : [])
  ];

  const handleCopy = (text: string, type: 'pnr' | 'pin') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === 'pnr') {
        setPnrCopied(true);
        setTimeout(() => setPnrCopied(false), 2000);
      } else {
        setPinCopied(true);
        setTimeout(() => setPinCopied(false), 2000);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      accentVariant={modalAccent as any}
    >
      <div className="space-y-4 text-slate-800 dark:text-slate-100">

        {/* ─── 1. INTESTAZIONE: CATEGORIA, TITOLO E ORARIO ─── */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {categoryBadgeLabel}
              </span>
              {Boolean(safeCopilotNotes || item.copilota) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                  <Handshake className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Copilota
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug break-words">
              {item.title}
            </h2>
            {((data as any)?.date || (data as any)?.data || (data as any)?.checkIn) && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                📅 {formatDateIT((data as any)?.date || (data as any)?.data || (data as any)?.checkIn)}
              </p>
            )}
          </div>
          {primaryTimeDisplay}
        </div>

        {/* ─── 2. INFORMAZIONI ESSENZIALI: LUOGO & PERCORSO ─── */}
        {!isTask && <>
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-2">
          {isTrasporto ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Partenza</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {data.departureLocation || 'Non specificata'}
                  </span>
                  {data.departureIata && (
                    <span className="ml-1.5 font-mono text-[10px] font-bold text-slate-500">({data.departureIata})</span>
                  )}
                  {data.departureTime && (
                    <span className="ml-2 font-mono text-slate-500 dark:text-slate-400">ore {data.departureTime}</span>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    {data.type === 'auto' || data.type === 'camper' ? 'Riconsegna' : 'Arrivo'}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {data.arrivalLocation || data.dropoffLocation || 'Non specificato'}
                  </span>
                  {data.arrivalIata && (
                    <span className="ml-1.5 font-mono text-[10px] font-bold text-slate-500">({data.arrivalIata})</span>
                  )}
                  {(data.arrivalTime || data.dropoffTime) && (
                    <span className="ml-2 font-mono text-slate-500 dark:text-slate-400">
                      ore {data.arrivalTime || data.dropoffTime}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {isAlloggio ? 'Indirizzo Struttura' : 'Indirizzo / Luogo'}
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 leading-relaxed break-words">
                  {mapTarget || 'Luogo non specificato'}
                </span>
              </div>
            </div>
          )}

          {reliableMapDestination && (
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => openMapLink(resolveMapUrl(data?.mapsUrl || mapTarget))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 transition-colors cursor-pointer shadow-2xs"
              >
                <GoogleMapsIcon className="w-3.5 h-3.5" />
                <span>Apri in Google Maps</span>
              </button>
            </div>
          )}
        </div>

        {/* ─── 3. DETTAGLI OPERATIVI SPECIFICI PER SOTTOCATEGORIA ─── */}
        </>}
        {hasOperationalDetails && (
          <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
            Dettagli Operativi
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* TRASPORTO: Volo / Treno / Metro / Noleggio */}
            {isTrasporto && (
              <>
                {data.carrier && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">
                      {data.type === 'metro' ? 'Linea / Gestore' : 'Compagnia / Vettore'}
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{data.carrier}</span>
                  </div>
                )}
                {data.bookingCode && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Codice Prenotazione (PNR)</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{data.bookingCode}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(data.bookingCode, 'pnr')}
                        className="text-slate-400 hover:text-slate-600 p-0.5"
                        title="Copia PNR"
                      >
                        {pnrCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
                {data.terminalGate && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">
                      {data.type === 'treno' || data.type === 'metro' ? 'Binario / Carrozza' : 'Terminal / Gate'}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{data.terminalGate}</span>
                  </div>
                )}
                {data.posti && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Posti Assegnati</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{data.posti}</span>
                  </div>
                )}
                {/* SCALO AEREO: VISIBILE RIGOROSAMENTE SOLO SE VOLO */}
                {data.type === 'volo' && data.layover && data.layover.airport && (
                  <div className="sm:col-span-2 p-2 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40">
                    <span className="text-sky-800 dark:text-sky-300 font-bold block text-[11px]">
                      ✈️ Scalo Aereo Intermedio: {data.layover.airport}
                      {data.layover.duration ? ` · Durata: ${data.layover.duration}` : ''}
                    </span>
                  </div>
                )}
                {data.checkinCutoff && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Chiusura Check-in</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-300">entro le ore {data.checkinCutoff}</span>
                  </div>
                )}
                {['volo', 'traghetto', 'treno', 'auto', 'camper', 'transfer'].includes(data.type) && (
                  <div className="sm:col-span-2 pt-1 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">
                        {data.type === 'auto' || data.type === 'camper' ? 'Stato Ritiro / Riconsegna' : 'Stato Check-in Operativo'}
                      </span>
                      <span className={`font-bold ${data.checkInDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                        {data.type === 'auto' || data.type === 'camper'
                          ? (data.checkInDone ? '✓ Mezzo ritirato' : 'Da ritirare')
                          : (data.checkInDone ? '✓ Check-in effettuato' : 'Check-in da effettuare')}
                      </span>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={async () => {
                          const { storageService, notifyDataChanged } = await import('../../storage/storageService');
                          const now = Date.now();
                          const nextCheckIn = !data.checkInDone;
                          const updated = {
                            ...data,
                            checkInDone: nextCheckIn,
                            checkInAt: nextCheckIn ? now : undefined,
                            updatedAt: now
                          };
                          data.checkInDone = nextCheckIn;
                          data.checkInAt = updated.checkInAt;
                          await storageService.saveTransport(updated);
                          notifyDataChanged('trasporti', 'save', updated);
                          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'trasporti', data: updated } }));
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          data.checkInDone
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700'
                            : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {data.checkInDone ? '✓ Fatto (Annulla)' : 'Segna come fatto'}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ALLOGGIO: Check-in, Check-out, PIN e Contatti */}
            {isAlloggio && (
              <>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Orario Check-in</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    dalle ore {data.checkInTime || '14:00'}{data.checkInDeadline ? ` alle ${data.checkInDeadline}` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Orario Check-out</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    entro le ore {data.checkOutTime || '10:00'}
                  </span>
                </div>
                <div className="sm:col-span-2 pt-1 flex items-center justify-between gap-2 flex-wrap border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Stato Check-in / Check-out</span>
                    <span className={`font-bold ${data.checkOutDone ? 'text-indigo-600 dark:text-indigo-400' : data.checkInDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                      {data.checkOutDone
                        ? '✓ Check-in e Check-out completati'
                        : data.checkInDone
                        ? '✓ Check-in effettuato'
                        : 'Check-in da effettuare'}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          const { storageService, notifyDataChanged } = await import('../../storage/storageService');
                          const now = Date.now();
                          const nextCheckIn = !data.checkInDone;
                          const updated = {
                            ...data,
                            checkInDone: nextCheckIn,
                            checkInAt: nextCheckIn ? now : undefined,
                            ...(nextCheckIn ? {} : { checkOutDone: false, checkOutAt: undefined }),
                            updatedAt: now
                          };
                          data.checkInDone = nextCheckIn;
                          data.checkInAt = updated.checkInAt;
                          if (!nextCheckIn) {
                            data.checkOutDone = false;
                            data.checkOutAt = undefined;
                          }
                          await storageService.saveAlloggio(updated);
                          notifyDataChanged('alloggi', 'save', updated);
                          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'alloggi', data: updated } }));
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          data.checkInDone
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700'
                            : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {data.checkInDone ? '✓ Check-in fatto' : 'Segna Check-in'}
                      </button>
                      {(data.checkInDone || data.checkOutDone) && (
                        <button
                          type="button"
                          onClick={async () => {
                            const { storageService, notifyDataChanged } = await import('../../storage/storageService');
                            const now = Date.now();
                            const nextCheckOut = !data.checkOutDone;
                            const updated = {
                              ...data,
                              checkInDone: nextCheckOut ? true : data.checkInDone,
                              checkInAt: nextCheckOut ? (data.checkInAt || now) : data.checkInAt,
                              checkOutDone: nextCheckOut,
                              checkOutAt: nextCheckOut ? now : undefined,
                              updatedAt: now
                            };
                            data.checkInDone = updated.checkInDone;
                            data.checkOutDone = nextCheckOut;
                            await storageService.saveAlloggio(updated);
                            notifyDataChanged('alloggi', 'save', updated);
                            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'alloggi', data: updated } }));
                          }}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                            data.checkOutDone
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-700'
                              : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {data.checkOutDone ? '✓ Check-out fatto' : 'Segna Check-out'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {data.pinCode && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Codice Keybox / PIN</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {canSeePrivateInfo ? data.pinCode : '•••••• [Riservato]'}
                      </span>
                      {canSeePrivateInfo && (
                        <button
                          type="button"
                          onClick={() => handleCopy(data.pinCode, 'pin')}
                          className="text-slate-400 hover:text-slate-600 p-0.5"
                          title="Copia PIN"
                        >
                          {pinCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {data.phone && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Telefono Struttura</span>
                    <a href={`tel:${data.phone}`} className="font-semibold text-[#FF6B5F] hover:underline">
                      📞 {data.phone}
                    </a>
                  </div>
                )}
              </>
            )}

            {/* ATTIVITÀ & SPOT FOTOGRAFICO */}
            {isAttivita && (
              <>
                {data.orarioRitrovo && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Orario Ritrovo</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">ore {data.orarioRitrovo}</span>
                  </div>
                )}
                {data.duration && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Durata Prevista</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{data.duration}</span>
                  </div>
                )}
                {/* Trekking Specs */}
                {(data.distanceKm || data.elevationGainM || data.hikingDurationMinutes) && (
                  <div className="sm:col-span-2 p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-amber-950 dark:text-amber-200 space-y-1">
                    <span className="font-bold block text-[11px]">🥾 Dati Percorso Trekking</span>
                    <div className="flex items-center gap-3 flex-wrap text-xs">
                      {data.distanceKm && <span>Distanza: <strong>{data.distanceKm} km</strong></span>}
                      {data.elevationGainM && <span>Dislivello: <strong>+{data.elevationGainM} m</strong></span>}
                      {data.hikingDurationMinutes && <span>Tempo: <strong>{formatHikingDuration(data.hikingDurationMinutes)}</strong></span>}
                      {data.difficulty && <span>Difficoltà: <strong>{data.difficulty}</strong></span>}
                    </div>
                  </div>
                )}
                {/* Spot Fotografico Specs */}
                {(data.lightWindow || data.photoSubject) && (
                  <div className="sm:col-span-2 p-2.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/50 dark:border-rose-800/40 text-xs space-y-1">
                    <span className="font-bold text-rose-800 dark:text-rose-300 block">📸 Scheda Spot Fotografico</span>
                    {data.lightWindow && data.lightWindow !== 'qualsiasi' && (
                      <p>Fascia di luce: <strong>{PHOTO_LIGHT_LABELS[data.lightWindow as keyof typeof PHOTO_LIGHT_LABELS] || data.lightWindow}</strong></p>
                    )}
                    {data.photoSubject && <p>Soggetto: <strong>{data.photoSubject}</strong></p>}
                  </div>
                )}
                {data.openingHours?.note && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Orari di Apertura</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{data.openingHours.note}</span>
                  </div>
                )}
              </>
            )}

            {/* TAPPA: Dettagli e sottotipo */}
            {isTappa && (
              <>
                {data.sottocategoria && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Tipologia Sosta</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{data.sottocategoria}</span>
                  </div>
                )}
                {data.bookingCode && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Codice Ingresso</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{data.bookingCode}</span>
                  </div>
                )}
                {data.openingHours?.note && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Orari Apertura</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{data.openingHours.note}</span>
                  </div>
                )}
              </>
            )}

            {/* RISTORANTE: Tavolo, Telefono, Dress code */}
            {isRistorante && (
              <>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Prenotazione</span>
                  <span className={`font-semibold ${data.status === 'saldato' || data.completed ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-300'}`}>
                    {data.status === 'saldato' || data.completed ? '✓ Confermata' : 'Da verificare'}
                  </span>
                </div>
                {data.telefono && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Telefono</span>
                    <a href={`tel:${data.telefono}`} className="font-semibold text-[#FF6B5F] hover:underline">
                      📞 {data.telefono}
                    </a>
                  </div>
                )}
                {data.linkPrenotazione && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Sito Web / Menu</span>
                    <a href={data.linkPrenotazione} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#FF6B5F] hover:underline inline-flex items-center gap-1">
                      <span>Apri Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </>
            )}

            {/* SHOPPING: Oggetti e scopo */}
            {isShopping && (
              <>
                {data.scopo && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Scopo / Categoria</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{data.scopo}</span>
                  </div>
                )}
                {data.link && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Sito Negozio</span>
                    <a href={data.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#FF6B5F] hover:underline inline-flex items-center gap-1">
                      <span>Apri Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        )}

        {/* ─── 4. COSTI E PAGAMENTI (SOLO SE PRESENTI) ─── */}
        {hasCostInfo && (
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Riepilogo Costi & Pagamenti
            </span>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-lg sm:text-xl font-black font-mono text-slate-900 dark:text-white">
                  {paymentInfo.displayText}
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  paymentInfo.isPackageIncluded
                    ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300'
                    : paymentInfo.isPaid
                    ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                }`}>
                  {paymentInfo.isPackageIncluded ? 'Incluso nel Pacchetto' : paymentInfo.isPaid ? '✓ Saldato' : '⏳ Da Saldare'}
                </span>
              </div>

              {/* Acconto o cauzione */}
              {paymentInfo.paidNum > 0 && !paymentInfo.isPaid && (
                <div className="text-right text-xs">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Acconto già versato</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    € {paymentInfo.paidNum.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Cauzione alloggio separata */}
              {isAlloggio && data.deposit && (
                <div className="text-right text-xs">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Cauzione richiesta</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    € {data.deposit}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── 5. NOTE E COPILOTA: NOTE GENERICHE + COPILOTA DISTINTE ─── */}
        {isTask && <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{data.completed ? 'Completato' : 'Da fare'}</p>
          {!rawGeneralNotes && <p className="text-xs text-slate-600 dark:text-slate-300">Una cosa pratica da fare durante il viaggio.</p>}
          {taskLink && <a href={taskLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-bold text-[#FF6B5F] border border-slate-200 dark:border-slate-700"><ExternalLink className="w-4 h-4" />Apri link</a>}
          {canEdit && <button type="button" disabled={taskSaving} onClick={async () => {
            setTaskSaving(true); setTaskError('');
            try {
              const { storageService } = await import('../../storage/storageService');
              await storageService.saveTappa({ ...data, completed: !data.completed });
              onClose();
            } catch { setTaskError('Impossibile aggiornare il Task. Riprova.'); }
            finally { setTaskSaving(false); }
          }} className="min-h-11 px-3 rounded-xl text-xs font-bold bg-[#FF6B5F] text-white disabled:opacity-50">{data.completed ? 'Segna come da fare' : 'Segna come completato'}</button>}
          {taskError && <p role="alert" className="text-xs text-rose-600">{taskError}</p>}
        </div>}
        {/* A. Note Generiche della Prenotazione */}
        {rawGeneralNotes && (
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1">
            <span className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400 tracking-wider block">
              {isTask ? 'Descrizione / Note operative' : 'Note di Viaggio & Prenotazione'}
            </span>
            <p className="text-slate-800 dark:text-slate-200 font-medium whitespace-pre-wrap leading-relaxed">
              {rawGeneralNotes}
            </p>
          </div>
        )}

        {/* B. Note per il Copilota con Icona Handshake */}
        {safeCopilotNotes && (
          <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 shadow-2xs">
            <span className="text-[10px] uppercase font-extrabold text-emerald-800 dark:text-emerald-300 tracking-wider block mb-1 flex items-center gap-1.5">
              <Handshake className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>Note per il Copilota</span>
            </span>
            <p className="text-xs text-emerald-950 dark:text-emerald-100 font-medium whitespace-pre-wrap leading-relaxed">
              {safeCopilotNotes}
            </p>
          </div>
        )}

        {/* ─── 6. FOTO E DOCUMENTI ALLEGATI (SOLO SE PRESENTI) ─── */}
        {attachments.length > 0 && (
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Documenti, Voucher & Foto
            </span>
            <div className="flex flex-wrap gap-2">
              {attachments.map(att => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => openAttachmentInNewTab(att.dataUrl, att.name)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors cursor-pointer shadow-2xs"
                >
                  <span>{att.type === 'image' ? '📸' : '🎟️'}</span>
                  <span className="truncate max-w-[150px]">{att.name || 'Documento'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── 7. AZIONI DISPONIBILI ─── */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm('Sei sicuro di voler eliminare questo elemento?')) {
                    const { storageService } = await import('../../storage/storageService');
                    if (isAttivita) await storageService.deleteActivity(item.id);
                    else if (isTrasporto) await storageService.deleteTransport(item.id);
                    else if (isTappa) await storageService.deleteTappa(item.id);
                    else if (isShopping) await storageService.deleteShopping(item.id);
                    else if (isAlloggio) await storageService.deleteAccommodation(data?.id || item.id);
                    else await storageService.deleteRistorante(item.id);

                    window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'delete' } }));
                    onClose();
                  }
                }}
                className="min-h-[44px] px-3.5 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 transition-colors cursor-pointer"
                title="Elimina"
              >
                🗑️ Elimina
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Chiudi
            </button>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { liveService } = await import('../../services/liveService');
                    const { getTripConfig } = await import('../../utils/tripConfig');
                    const tripId = getTripConfig()?.id;
                    if (!tripId) {
                      alert('Viaggio non configurato.');
                      return;
                    }

                    const title = isAttivita ? `Iniziata attività: ${item.title}` :
                                  isTrasporto ? `In viaggio verso ${item.title}` :
                                  isTappa ? `Arrivati a ${item.title}` :
                                  isShopping ? `Shopping time: ${item.title}` :
                                  isAlloggio ? `Check-in: ${item.title}` :
                                  `A tavola: ${item.title}`;

                    await liveService.publishToLive(tripId, {
                      title,
                      text: 'Aggiornamento dal diario di viaggio',
                      locationName: mapTarget
                    });
                    alert('Pubblicato con successo in Live! 📡');
                  } catch (err) {
                    alert('Errore durante la pubblicazione: ' + (err as Error).message);
                  }
                }}
                className="min-h-[44px] px-3.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-500 to-amber-500 hover:opacity-90 shadow-md shadow-rose-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Condividi in Live"
              >
                <span>📡 Condividi in Live</span>
              </button>
            )}

            {canEdit && onDuplicate && (
              <button
                type="button"
                onClick={() => onDuplicate(item)}
                className="min-h-[44px] px-3.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Crea una copia di questa card"
              >
                <span>📄 Duplica</span>
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="min-h-[44px] px-5 rounded-xl text-xs font-bold bg-[#FF6B5F] hover:bg-[#e85c50] text-white shadow-md shadow-[#FF6B5F]/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>✏️ Modifica</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </Modal>
  );
}
