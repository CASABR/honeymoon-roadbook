import { useState } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService } from '../../storage/storageService';
import type { Attivita } from '../../types';
import { resolveMapUrl } from '../../utils/mapsHelper';
import AttivitaTicketsModal from '../modals/AttivitaTicketsModal';
import QRCodeModal from '../modals/QRCodeModal';

interface AttivitaCardProps {
  activity: Attivita;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Attivita) => void;
}

export default function AttivitaCard({ activity, onEdit, onDetail, onUpdate }: AttivitaCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const copilotData = (activity as any).noteCopilota || (activity as any).notes || '';
  const hasCopilotNotes = Boolean(copilotData.trim());
  
  const handleTogglePayment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      
      const isSaldato = activity.paymentStatus === 'saldato' || activity.status === 'prenotato';
      const updated = { ...activity, paymentStatus: isSaldato ? 'da_saldare' : 'saldato', status: isSaldato ? 'da_valutare' : 'prenotato' } as any;
      updated.amountPaid = isSaldato ? "0" : activity.cost;
      updated.updatedAt = Date.now();
      await storageService.saveActivity(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
    
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
    } catch(e) { console.error(e); }
  };
  

  const [isTicketsOpen, setIsTicketsOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);

  const icon = '📌';

  const mapLink = activity.location ? resolveMapUrl(activity.location) : '';
  const attachmentsCount = activity.attachments?.length || 0;
  const hasQRCode = Boolean(activity.qrCode);
  const canHavePass = hasQRCode || attachmentsCount > 0;

  const ritrovo = activity.orarioRitrovo || activity.time;
  const inizio = activity.orarioInizio;

  return (
    <>
      <div 
        onClick={onDetail || onEdit} 
        className="cursor-pointer rounded-2xl border p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 relative active:scale-[0.99] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
      >
        {/* TOP */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20 text-xs font-medium">
              <span className="text-sm">{icon}</span> Attività
            </span>
            {(ritrovo || inizio || activity.duration) && (
              <div className="flex items-center gap-1.5 ml-1">
                {(ritrovo || inizio) && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {ritrovo ? `Ore ${ritrovo}` : `Inizio ${inizio}`}
                  </span>
                )}
                {activity.duration && (
                  <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                    • {activity.duration}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors shadow-2xs ${
                hasCopilotNotes
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500 opacity-60 hover:opacity-100'
              }`}
              title="Note Copilota"
            >
              <span>🧭</span> Co-pilota
            </button>
          </div>
        </div>

        {/* BODY */}
        <div>
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className={`font-semibold text-base text-slate-800 dark:text-slate-100 leading-snug ${activity.completed ? 'opacity-90' : ''}`}>
              {activity.title}
            </h3>
          </div>
          {activity.location && (
            <p className="text-sm text-slate-500 dark:text-slate-400 font-normal truncate mt-1 flex items-center gap-1">
              <span>📍</span>
              <span className="truncate">{activity.location}</span>
            </p>
          )}

          {/* BOX NOTE COPILOTA */}
          {hasCopilotNotes && (
            <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 p-2.5 rounded-lg text-xs leading-relaxed text-amber-900 dark:text-amber-200 mt-2 flex items-start gap-1.5">
              <span className="shrink-0 text-sm">🧭</span>
              <span className="flex-1 break-words">{copilotData}</span>
            </div>
          )}
        </div>

        {/* BOTTOM */}
        <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {(!activity.cost || isNaN(parseFloat(String(activity.cost).replace(/[^0-9,.-]/g, '').replace(',', '.'))) || parseFloat(String(activity.cost).replace(/[^0-9,.-]/g, '').replace(',', '.')) === 0) ? (
              <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                Gratuito
              </span>
            ) : (
              <span className="text-sm font-semibold text-gray-800 bg-slate-50 dark:bg-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-md">
                {String(activity.cost)}
              </span>
            )}
            
            {activity.cost && String(activity.cost) !== '0' && (
              <button 
                type="button"
                onClick={handleTogglePayment}
                className={`cursor-pointer hover:scale-105 active:scale-95 transition-all text-xs font-medium px-2 py-0.5 rounded-full border shadow-2xs ${
                  (activity.paymentStatus === 'saldato' || activity.status === 'prenotato')
                    ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800" 
                    : "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-700"
                }`}
                title="Clicca per invertire stato: Saldato / Da saldare"
              >
                {(activity.paymentStatus === 'saldato' || activity.status === 'prenotato') ? '✓ Saldato' : '⏳ Da saldare'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {canHavePass && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation();
                  if (hasQRCode) setIsQRModalOpen(true);
                  else setIsTicketsOpen(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 text-xs font-medium transition-colors shadow-2xs"
              >
                <span className="text-[10px]">🎫</span> Pass/QR
              </button>
            )}
            {mapLink && (
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 text-xs font-medium transition-colors"
              >
                <span className="text-[10px]">📍</span> 
                <span>Maps</span>
              </a>
            )}
          </div>
        </div>
    </div>
    <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={activity.title || 'Dettaglio'}
        noteCopilota={copilotData}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const updated = { ...activity, noteCopilota: notes.trim(), updatedAt: Date.now() } as any;
            await storageService.saveActivity(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' }}));
            setIsCopilotOpen(false);
          } catch(e) { console.error(e); }
        }}
      />
      <AttivitaTicketsModal
        isOpen={isTicketsOpen}
        onClose={() => setIsTicketsOpen(false)}
        activity={activity}
        onUpdateActivity={onUpdate}
      />
      {activity.qrCode && (
        <QRCodeModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          code={activity.qrCode}
          title={activity.title}
          subtitle="Pass / Biglietto"
        />
      )}
    </>
  );
}
