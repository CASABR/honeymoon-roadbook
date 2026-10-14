import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { UnifiedBookingItem } from '../../services/unifiedBookingService';
import {
  BOOKING_CATEGORY_META,
  updateBookingAttachments,
  deleteBookingItem
} from '../../services/unifiedBookingService';
import { processFileForAttachment, formatFileSize } from '../../utils/fileAttachment';
import type { TransportAttachment } from '../../types';
import LightboxCarousel from '../common/LightboxCarousel';

interface UnifiedBookingDetailModalProps {
  booking: UnifiedBookingItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  canEdit?: boolean;
}

export default function UnifiedBookingDetailModal({
  booking,
  isOpen,
  onClose,
  onUpdated,
  canEdit = true
}: UnifiedBookingDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'allegati' | 'note'>('info');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState<number | null>(null);

  // Reset tab e stati quando cambia booking o apertura
  useEffect(() => {
    if (isOpen) {
      setActiveTab('info');
      setConfirmDelete(false);
      setUploadError('');
      setActiveAttachmentIndex(null);
    }
  }, [isOpen, booking]);

  // Gestione tasto Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeAttachmentIndex !== null) {
          setActiveAttachmentIndex(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeAttachmentIndex, onClose]);

  if (!isOpen || !booking) return null;

  const meta = BOOKING_CATEGORY_META[booking.category] || {
    label: 'Prenotazione',
    icon: '📑',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    badgeBorder: 'border-slate-200'
  };

  const attachments = booking.attachments || [];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError('');
    setIsUploading(true);

    try {
      const added: TransportAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const processed = await processFileForAttachment(files[i]);
        added.push(processed);
      }
      const updatedList = [...attachments, ...added];
      await updateBookingAttachments(booking, updatedList);
      onUpdated();
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'Errore durante il caricamento del file');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = async (id: string) => {
    if (!confirm('Rimuovere questo allegato dalla prenotazione?')) return;
    try {
      const updatedList = attachments.filter(a => a.id !== id);
      await updateBookingAttachments(booking, updatedList);
      onUpdated();
    } catch (err: any) {
      console.error(err);
      alert('Impossibile rimuovere l\'allegato');
    }
  };

  const handleDeleteBooking = async () => {
    setIsDeleting(true);
    try {
      await deleteBookingItem(booking);
      onUpdated();
      onClose();
    } catch (err: any) {
      console.error(err);
      alert('Impossibile eliminare la prenotazione');
    } finally {
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-[#FAF7F2] dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Modale */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md">
          <div className="flex items-start gap-3 min-w-0 flex-1 pr-3">
            <span className="text-3xl p-2 rounded-2xl bg-slate-100 dark:bg-slate-800 shrink-0">
              {meta.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}>
                  {meta.label}
                </span>
                {booking.status && booking.status.toLowerCase() !== 'completato' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {booking.status}
                  </span>
                )}
                {booking.hasAttachments && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                    📎 {booking.attachmentsCount} {booking.attachmentsCount === 1 ? 'Voucher' : 'Voucher'}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-black text-[#172033] dark:text-white tracking-tight leading-tight truncate">
                {booking.title}
              </h2>
              {booking.subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                  {booking.subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 pb-1 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-2 bg-white/40 dark:bg-slate-900/40 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
              activeTab === 'info'
                ? 'bg-[#172033] text-white dark:bg-white dark:text-[#172033]'
                : 'text-slate-600 dark:text-slate-400 hover:bg-white/60'
            }`}
          >
            Dettagli &amp; Orari
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('allegati')}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'allegati'
                ? 'bg-[#172033] text-white dark:bg-white dark:text-[#172033]'
                : 'text-slate-600 dark:text-slate-400 hover:bg-white/60'
            }`}
          >
            <span>Voucher &amp; Biglietti</span>
            <span className="px-1.5 py-0.2 rounded-md bg-slate-200/60 text-[10px]">
              {attachments.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('note')}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
              activeTab === 'note'
                ? 'bg-[#172033] text-white dark:bg-white dark:text-[#172033]'
                : 'text-slate-600 dark:text-slate-400 hover:bg-white/60'
            }`}
          >
            Note &amp; Copilota
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Griglia Date e Orari */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-800 shadow-2xs">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Data &amp; Orario Inizio
                  </span>
                  <div className="text-sm font-black text-[#172033] dark:text-white">
                    {booking.date ? `🗓️ ${booking.date}` : 'Data non specificata'}
                  </div>
                  {booking.time && (
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                      ⏰ Ore {booking.time}
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-800 shadow-2xs">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Fine / Rientro / Check-out
                  </span>
                  <div className="text-sm font-black text-[#172033] dark:text-white">
                    {booking.endDate ? `🗓️ ${booking.endDate}` : '—'}
                  </div>
                  {booking.endTime && (
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                      ⏰ Ore {booking.endTime}
                    </div>
                  )}
                </div>
              </div>

              {/* Codice Prenotazione & PNR */}
              {booking.bookingCode && (
                <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Codice Prenotazione / PNR
                    </span>
                    <span className="text-base font-black tracking-wider font-mono text-[#172033] dark:text-white">
                      {booking.bookingCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(booking.bookingCode || '');
                      alert('Codice copiato negli appunti!');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 font-bold text-slate-700 dark:text-slate-200 text-xs shadow-2xs hover:bg-slate-50 cursor-pointer"
                  >
                    Copia
                  </button>
                </div>
              )}

              {/* Luogo & Indirizzo */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-800 shadow-2xs">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Località &amp; Indirizzo
                </span>
                <p className="text-xs font-bold text-[#172033] dark:text-white">
                  📍 {booking.location || 'Località non indicata'}
                </p>
                {booking.locationDetails && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {booking.locationDetails}
                  </p>
                )}
                {booking.location && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2.5 text-[11px] font-bold text-[#FF6B5F] hover:underline"
                  >
                    <span>Apri su Google Maps</span>
                    <span>↗</span>
                  </a>
                )}
              </div>

              {/* Stato Pagamento & Spese */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-800 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                    Stato Spesa
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black font-mono text-[#172033] dark:text-white">
                      {booking.cost && booking.cost > 0 ? `€ ${booking.cost.toFixed(2)}` : 'Incluso / Gratuito'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      booking.isPaid
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {booking.isPaid ? '🟢 Saldato' : '⏳ Da saldare'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'allegati' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-[#172033] dark:text-white text-xs">
                    File &amp; Documenti Digitali
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Disponibili offline per controlli in aeroporto o check-in hotel
                  </p>
                </div>
                {canEdit && (
                  <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#172033] hover:bg-slate-800 text-white font-bold text-xs cursor-pointer shadow-xs transition-colors">
                    <span>+ Carica File</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                )}
              </div>

              {uploadError && (
                <p className="text-rose-600 text-xs font-bold">{uploadError}</p>
              )}

              {isUploading && (
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span className="font-semibold text-xs">Elaborazione e salvataggio file in corso...</span>
                </div>
              )}

              {attachments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {attachments.map((att, idx) => (
                    <div
                      key={att.id}
                      className="p-3 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 shadow-2xs flex flex-col justify-between gap-2 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
                    >
                      <div 
                        className="flex items-start gap-2.5 cursor-pointer"
                        onClick={() => setActiveAttachmentIndex(idx)}
                        title="Clicca per visualizzare a schermo intero"
                      >
                        <span className="text-2xl p-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 shrink-0">
                          {att.type === 'pdf' ? '📄' : '🖼️'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 dark:text-white text-xs truncate">
                            {att.name}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {formatFileSize(att.size)} • Tocca per visualizzare
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                        <button
                          type="button"
                          onClick={() => setActiveAttachmentIndex(idx)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                        >
                          <span>Sfoglia</span>
                          <span>🔍</span>
                        </button>
                        <a
                          href={att.dataUrl}
                          download={att.name}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold cursor-pointer"
                        >
                          Scarica
                        </a>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(att.id)}
                            className="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 text-[11px] font-bold cursor-pointer"
                          >
                            Elimina
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-white/40 dark:bg-slate-800/40">
                  <span className="text-3xl block mb-2">📎</span>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nessun documento o voucher allegato
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                    Carica biglietti PDF, conferme di prenotazione o screenshot con codice QR per averli sempre a portata di mano.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'note' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-800 shadow-2xs">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Note di Viaggio
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {booking.notes || 'Nessuna nota inserita per questa prenotazione.'}
                </p>
              </div>

              {booking.noteCopilota && (
                <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-400 font-extrabold text-[11px] uppercase tracking-wider mb-1">
                    <span>🤫</span>
                    <span>Note Riservate Copilota</span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {booking.noteCopilota}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200/70 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 flex items-center justify-between">
          <div>
            {canEdit && (
              !confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-rose-600 hover:text-rose-700 font-bold text-xs cursor-pointer py-1.5"
                >
                  Elimina Prenotazione
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-rose-700 text-xs font-bold">Sei sicuro?</span>
                  <button
                    type="button"
                    onClick={handleDeleteBooking}
                    disabled={isDeleting}
                    className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
                  >
                    {isDeleting ? 'Elimino...' : 'Sì, elimina'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    Annulla
                  </button>
                </div>
              )
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[#172033] hover:bg-slate-800 text-white font-bold text-xs shadow-sm cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>

      {/* Carosello Sfogliabile Completo per Immagini e PDF */}
      <LightboxCarousel
        isOpen={activeAttachmentIndex !== null}
        onClose={() => setActiveAttachmentIndex(null)}
        items={attachments}
        initialIndex={activeAttachmentIndex ?? 0}
        title={booking.title || 'Voucher & Documenti'}
      />
    </div>,
    document.body
  );
}
