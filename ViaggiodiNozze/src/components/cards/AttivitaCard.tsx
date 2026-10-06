import React, { useState } from 'react';
import type { Attivita } from '../../types';
import Badge from '../common/Badge';
import { resolveMapUrl } from '../../utils/mapsHelper';
import AttivitaTicketsModal from '../modals/AttivitaTicketsModal';
import QRCodeModal from '../modals/QRCodeModal';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { storageService } from '../../storage/storageService';
import { liveService } from '../../services/liveService';
import { getTripConfig } from '../../utils/tripConfig';

interface AttivitaCardProps {
  activity: Attivita;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate?: (updated: Attivita) => void;
}

export default function AttivitaCard({ activity, onEdit, onUpdate }: AttivitaCardProps) {
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

  const statusConfig: Record<string, { emoji: string; label: string; cls: string }> = {
    prenotato:    { emoji: '🟢', label: 'Prenotato',    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    da_valutare:  { emoji: '🟡', label: 'Da valutare',  cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    non_bloccato: { emoji: '🟠', label: 'Non bloccato', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
    libero:       { emoji: '⚪', label: 'Libero',        cls: 'bg-slate-50 text-[#64748B] dark:text-slate-400 border-slate-200' },
    // Compat legacy
    pianificata:  { emoji: '🔵', label: 'Pianificato',  cls: 'bg-sky-50 text-sky-800 border-sky-200' },
    completata:   { emoji: '✅', label: 'Completato',   cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    annullata:    { emoji: '🔴', label: 'Annullato',    cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  };

  const stBadge = statusConfig[activity.status] || statusConfig.non_bloccato;

  const mapLink = activity.location ? resolveMapUrl(activity.location) : '';
  const attachmentsCount = activity.attachments?.length || 0;
  const hasQRCode = Boolean(activity.qrCode);
  const canHavePass = hasQRCode || attachmentsCount > 0;

  const [isCopilotPopoverOpen, setIsCopilotPopoverOpen] = useState(false);
  const [editingCopilotNotes, setEditingCopilotNotes] = useState(activity.noteCopilota || '');
  const [isSavingCopilot, setIsSavingCopilot] = useState(false);
  const hasCopilotNotes = Boolean(activity.noteCopilota?.trim());

  const handleToggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...activity, completed: !activity.completed };
    try {
      await storageService.saveActivity(updated as any);
      if (onUpdate) onUpdate(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleShareLive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const config = getTripConfig();
      if (!config?.id) throw new Error('Viaggio non configurato');
      await liveService.publishToLive(
        config.id,
        {
          title: activity.title,
          text: activity.notes || activity.noteCopilota || '',
          locationName: activity.location || ''
        }
      );
      alert('Pubblicato nel Live con successo! 📡');
    } catch (err) {
      alert('Errore durante la pubblicazione nel Live. Riprova.');
    }
  };

  return (
    <>
      <div onClick={onEdit} className="cursor-pointer rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-3 relative active:scale-[0.99] bg-[#FFFFFF] dark:bg-[#1E293B] border-[#ECEAE5] dark:border-slate-700">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex-1 min-w-0">
            {/* Badges riga */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {(() => {
                const ritrovo = activity.orarioRitrovo || activity.time;
                const inizio = activity.orarioInizio;
                if (!ritrovo && !inizio) {
                  return (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-[11px] font-bold text-[#64748B] dark:text-slate-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 transition">
                      ⏱️ Imposta orario
                    </button>
                  );
                }
                return (
                  <span className="text-sm font-bold text-[#172033] dark:text-white bg-[#F0F7FF] dark:bg-[#1E293B] px-2.5 py-0.5 rounded-md border border-[#D8E8FC] dark:border-slate-700">
                    {ritrovo ? `Ore ${ritrovo}` : `Ore ${inizio}`}
                    {ritrovo && inizio && ritrovo !== inizio && <span className="text-xs text-[#64748B] dark:text-slate-400 dark:text-slate-400 font-medium ml-1.5">(Inizio {inizio})</span>}
                  </span>
                );
              })()}
              <Badge label={categoryLabels[activity.category] || activity.category} variant="slate" />
              {/* Badge stato prenotazione */}
              {stBadge.label !== 'Completato' && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${stBadge.cls}`}>
                  <span>{stBadge.emoji}</span>
                  <span>{stBadge.label}</span>
                </span>
              )}
              {/* Badge piattaforma se presente */}
              {activity.platform && (
                <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                  🎫 {activity.platform}
                </span>
              )}
              
              {/* Pillola Co-pilota: Badge esteso verde se ha note, icona compatta grigia altrimenti */}
              {hasCopilotNotes ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation();
                    setEditingCopilotNotes(activity.noteCopilota || '');
                    setIsCopilotPopoverOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 transition-all cursor-pointer shrink-0 active:scale-90 shadow-2xs"
                  title="Note Co-pilota presenti (clicca per leggere/modificare)"
                >
                  <span>🧭</span>
                  <span>Co-pilota</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation();
                    setEditingCopilotNotes('');
                    setIsCopilotPopoverOpen(true);
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs bg-slate-100 text-slate-400 hover:text-[#64748B] dark:text-slate-400 hover:bg-slate-200 transition-all cursor-pointer shrink-0 active:scale-90"
                  title="Aggiungi note Co-pilota"
                >
                  🧭
                </button>
              )}

              {activity.duration && (
                <span className="text-[11px] text-slate-400 font-medium">⏱ {activity.duration}</span>
              )}
            </div>

            {/* Titolo con Checkbox Circolare */}
            <div className="flex items-start gap-2.5 mt-2 mb-1">
              <button
                type="button"
                onClick={handleToggleComplete}
                className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center cursor-pointer transition-all mt-0.5 ${
                  activity.completed
                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                    : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400'
                }`}
                aria-label={activity.completed ? 'Segna come da fare' : 'Segna come completato'}
              >
                {activity.completed && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <h4 className={`text-sm font-bold text-[#172033] dark:text-slate-50 leading-snug pt-1 ${activity.completed ? 'opacity-75' : ''}`}>
                {activity.title}
              </h4>
            </div>

            {/* Location → Google Maps (mostrato solo se valorizzato) */}
            {activity.location && mapLink && (
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#64748B] dark:text-slate-400 hover:text-amber-700 transition-colors group mt-1 font-medium"
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
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 leading-relaxed">
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
          
        </div>

        {/* Barra inferiore: Prezzo, Piattaforma e Biglietto */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          {/* Prezzo e Piattaforma */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(!activity.cost || isNaN(parseFloat(activity.cost)) || parseFloat(activity.cost) === 0) ? (
              <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                Gratuito
              </span>
            ) : (
              <span className="text-[11px] font-bold text-[#172033] dark:text-slate-50 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                {parseFloat(activity.cost).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
              </span>
            )}
            {activity.platform && (
              <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                🎫 {activity.platform}
              </span>
            )}
          </div>

          {/* Pulsanti destra */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {canEdit && (
              <button
                type="button"
                onClick={handleShareLive}
                title="Condividi nel Live"
                className="px-2 py-1.5 h-8 rounded-lg flex items-center justify-center text-[#64748B] dark:text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer text-xs bg-white border border-slate-200 hover:border-emerald-200 shadow-xs"
              >
                📡 <span className="hidden sm:inline ml-1 font-bold">Live</span>
              </button>
            )}
            {canHavePass && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation();
                  if (hasQRCode) {
                    setIsQRModalOpen(true);
                  } else if (attachmentsCount > 0) {
                    setIsTicketsOpen(true);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors shadow-2xs active:scale-95"
                title="Apri QR Code o Biglietto"
              >
                <span className="text-[10px]">🎟️</span>
                <span>Pass/QR</span>
              </button>
            )}

            {activity.location && mapLink && (
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors shadow-2xs"
              >
                <span className="text-[10px]">📍</span> 
                <span>Maps</span>
              </a>
            )}

            <button
              type="button"
              onClick={(e) => { e.stopPropagation();
                onEdit(); // Actually, this acts as "Dettagli", which is currently onEdit. Or we could just use onEdit for this
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors shadow-2xs active:scale-95"
            >
              <span className="text-[10px]">ℹ️</span>
              <span>Dettagli</span>
            </button>
          </div>
        </div>
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
          onClick={(e) => { e.stopPropagation();
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
                  <h3 className="text-sm font-bold text-[#172033] dark:text-slate-50 leading-tight">
                    Note Co-pilota • {activity.title}
                  </h3>
                  <p className="text-[10px] text-emerald-700 font-semibold truncate max-w-[190px]">
                    Promemoria e raccomandazioni
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsCopilotPopoverOpen(false); }}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-[#64748B] dark:text-slate-400 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Area di testo per lettura / modifica immediata */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#64748B] dark:text-slate-400">
                {canEdit ? 'Note & Suggerimenti di viaggio:' : 'Note consultabili:'}
              </label>
              {canEdit ? (
                <textarea
                  rows={4}
                  value={editingCopilotNotes}
                  onChange={(e) => setEditingCopilotNotes(e.target.value)}
                  placeholder="Inserisci note, consigli parcheggio, orari migliori, promemoria per la guida..."
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 p-3 text-xs text-[#172033] dark:text-slate-50 leading-relaxed outline-none transition-all resize-none"
                />
              ) : (
                <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-100 text-xs text-slate-700 leading-relaxed font-medium min-h-[80px]">
                  {activity.noteCopilota?.trim() ? (
                    activity.noteCopilota
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
                onClick={(e) => { e.stopPropagation(); setIsCopilotPopoverOpen(false); }}
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
                        noteCopilota: editingCopilotNotes.trim(),
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
