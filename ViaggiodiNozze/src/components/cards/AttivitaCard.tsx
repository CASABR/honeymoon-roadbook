import { useState } from 'react';
import type { Attivita } from '../../types';
import Badge from '../common/Badge';
import { resolveMapUrl } from '../../utils/mapsHelper';
import AttivitaTicketsModal from '../modals/AttivitaTicketsModal';
import QRCodeModal from '../modals/QRCodeModal';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { storageService } from '../../storage/storageService';

interface AttivitaCardProps {
  activity: Attivita;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate?: (updated: Attivita) => void;
}

export default function AttivitaCard({ activity, onEdit, onDelete, onUpdate }: AttivitaCardProps) {
  const { canEdit } = useDeviceRole();
  const [isTicketsOpen, setIsTicketsOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);

  const categoryLabels: Record<string, string> = {
    visita: 'Visita',
    cibo: 'Ristorante',
    relax: 'Relax',
    natura: 'Natura',
    cultura: 'Cultura',
    shopping: 'Shopping',
    altro: 'Altro',
  };

  const statusVariant = {
    pianificata: 'amber',
    completata: 'emerald',
    annullata: 'rose',
  }[activity.status] as 'amber' | 'emerald' | 'rose';

  const mapLink = activity.location ? resolveMapUrl(activity.location) : '';
  const attachmentsCount = activity.attachments?.length || 0;
  const hasQRCode = Boolean(activity.qrCode);
  const canHavePass = hasQRCode || attachmentsCount > 0;

  const [isCopilotPopoverOpen, setIsCopilotPopoverOpen] = useState(false);
  const [editingCopilotNotes, setEditingCopilotNotes] = useState(activity.copilotNotes || '');
  const [isSavingCopilot, setIsSavingCopilot] = useState(false);
  const hasCopilotNotes = Boolean(activity.copilotNotes?.trim());

  return (
    <>
      <div className="rounded-3xl border border-slate-200/90 bg-white p-4.5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex-1 min-w-0">
            {/* Badges riga */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {activity.time && (
                <span className="text-[11px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  {activity.time}
                </span>
              )}
              <Badge label={categoryLabels[activity.category] || activity.category} variant="slate" />
              <Badge label={activity.status} variant={statusVariant} />
              
              {/* Pillola Co-pilota: Mostra SOLO l'icona circolare compatta [ 🧭 ] */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingCopilotNotes(activity.copilotNotes || '');
                  setIsCopilotPopoverOpen(true);
                }}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all cursor-pointer shrink-0 active:scale-90 ${
                  hasCopilotNotes
                    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400 shadow-2xs'
                    : 'bg-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                }`}
                title={hasCopilotNotes ? 'Note Co-pilota presenti (clicca per leggere/modificare)' : 'Aggiungi note Co-pilota'}
              >
                🧭
              </button>

              {activity.duration && (
                <span className="text-[11px] text-slate-400 font-medium">⏱ {activity.duration}</span>
              )}
            </div>

            {/* Titolo */}
            <h4 className="text-sm font-bold text-slate-900 leading-snug">
              {activity.title}
            </h4>

            {/* Location → Google Maps (mostrato solo se valorizzato) */}
            {activity.location && mapLink && (
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-amber-700 transition-colors group mt-1 font-medium"
              >
                <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="truncate">{activity.location}</span>
              </a>
            )}

            {/* Note */}
            {activity.notes && (
              <p className="text-xs text-slate-600 mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 leading-relaxed">
                {activity.notes}
              </p>
            )}

            {/* Link esterno */}
            {activity.link && (
              <a
                href={activity.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 mt-2 transition-colors"
              >
                <span>Vedi riferimento online</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>

          {/* Azioni Modifica / Elimina (solo guida e copilota) */}
          {canEdit && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onEdit}
                title="Modifica attività"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onDelete}
                title="Elimina attività"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Barra inferiore QR Code e Biglietti se presenti */}
        {canHavePass && (
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {hasQRCode && (
                <button
                  type="button"
                  onClick={() => setIsQRModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100 transition-all cursor-pointer active:scale-95"
                  title="Mostra QR Code a schermo intero"
                >
                  <span className="text-xs">📱</span>
                  <span>QR Code</span>
                  <span className="text-[10px] text-amber-700">🔍</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsTicketsOpen(true)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 ${
                  attachmentsCount > 0
                    ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
                title="Gestione Biglietti e Pass offline"
              >
                <span className="text-xs">🎟️</span>
                <span>Pass</span>
                {attachmentsCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-purple-600 text-white">
                    {attachmentsCount}
                  </span>
                )}
              </button>
            </div>

            {hasQRCode && (
              <span className="font-mono text-[10px] text-slate-400 font-bold truncate max-w-[130px]">
                {activity.qrCode}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Modal Biglietti & File Attività */}
      <AttivitaTicketsModal
        isOpen={isTicketsOpen}
        onClose={() => setIsTicketsOpen(false)}
        activity={activity}
        onUpdateActivity={onUpdate}
      />

      {/* Modal QR Code Ingrandito */}
      {activity.qrCode && (
        <QRCodeModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          code={activity.qrCode}
          title={activity.title}
          subtitle="Pass / Biglietto Attività"
        />
      )}

      {/* Popover / Modale Note del Co-pilota (Stile iOS con modifica diretta) */}
      {isCopilotPopoverOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setIsCopilotPopoverOpen(false);
          }}
        >
          <div 
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-emerald-200/80 animate-scale-up space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm font-bold">
                  🧭
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">
                    Note Co-pilota • {activity.title}
                  </h3>
                  <p className="text-[10px] text-emerald-700 font-semibold truncate max-w-[190px]">
                    Promemoria e raccomandazioni
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCopilotPopoverOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Area di testo per lettura / modifica immediata */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600">
                {canEdit ? 'Note & Suggerimenti di viaggio:' : 'Note consultabili:'}
              </label>
              {canEdit ? (
                <textarea
                  rows={4}
                  value={editingCopilotNotes}
                  onChange={(e) => setEditingCopilotNotes(e.target.value)}
                  placeholder="Inserisci note, consigli parcheggio, orari migliori, promemoria per la guida..."
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 p-3 text-xs text-slate-800 leading-relaxed outline-none transition-all resize-none"
                />
              ) : (
                <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-100 text-xs text-slate-700 leading-relaxed font-medium min-h-[80px]">
                  {activity.copilotNotes?.trim() ? (
                    activity.copilotNotes
                  ) : (
                    <p className="text-slate-400 italic">
                      Nessuna raccomandazione inserita.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCopilotPopoverOpen(false)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Chiudi
              </button>
              {canEdit && (
                <button
                  type="button"
                  disabled={isSavingCopilot}
                  onClick={async () => {
                    try {
                      setIsSavingCopilot(true);
                      const updated: Attivita = {
                        ...activity,
                        copilotNotes: editingCopilotNotes.trim(),
                        copilota: Boolean(editingCopilotNotes.trim()) || activity.copilota,
                        updatedAt: Date.now()
                      };
                      await storageService.saveActivity(updated);
                      if (onUpdate) onUpdate(updated);
                      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
                        detail: { entityType: 'activity', action: 'update', data: updated }
                      }));
                      setIsCopilotPopoverOpen(false);
                    } catch (err) {
                      console.error('Errore salvataggio nota copilota:', err);
                    } finally {
                      setIsSavingCopilot(false);
                    }
                  }}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSavingCopilot ? 'Salvataggio...' : 'Salva Nota'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
