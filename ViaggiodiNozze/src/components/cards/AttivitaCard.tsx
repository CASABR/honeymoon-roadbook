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
        className="cursor-pointer rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-3 relative active:scale-[0.99] bg-white border border-slate-200"
      >
        {/* TOP */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20 text-[10px] font-bold tracking-wide uppercase">
              <span className="text-sm">{icon}</span> Attività
            </span>
            {(ritrovo || inizio || activity.duration) && (
              <div className="flex flex-col ml-1">
                {(ritrovo || inizio) && (
                  <span className="text-[10px] font-semibold text-slate-500">
                    {ritrovo ? `Ore ${ritrovo}` : `Inizio ${inizio}`}
                  </span>
                )}
                {activity.duration && (
                  <span className="text-[10px] font-medium text-slate-400">
                    Durata: {activity.duration}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {true && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
                className={`flex items-center justify-center w-7 h-7 rounded-full border transition-colors shadow-sm ${
                  hasCopilotNotes
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500 opacity-60 hover:opacity-100'
                }`}
                title="Apri note Copilota"
              >
                <span className="text-sm">🧭</span>
              </button>
            )}
            
          </div>
        </div>

        {/* BODY */}
        <div>
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className={`text-base font-extrabold text-slate-900 leading-snug ${activity.completed ? 'opacity-90' : ''}`}>
              {activity.title}
            </h3>
          </div>
          {activity.location && (
            <p className="text-xs text-slate-500 font-medium truncate mt-1 flex items-center gap-1">
              <span>📍</span>
              <span className="truncate">{activity.location}</span>
            </p>
          )}
          
        </div>

        {/* BOTTOM */}
        <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
                {(!activity.cost || isNaN(parseFloat(String(activity.cost).replace(/[^0-9,.-]/g, '').replace(',', '.'))) || parseFloat(String(activity.cost).replace(/[^0-9,.-]/g, '').replace(',', '.')) === 0) ? (
                  <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                    Gratuito
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-gray-800 bg-slate-50 dark:bg-slate-800 dark:text-slate-200 px-2 py-1 rounded-md">
                    {String(activity.cost)}
                  </span>
                )}
                
                {activity.cost && String(activity.cost) !== '0' && (
                  <span 
                    onClick={handleTogglePayment}
                    className={`cursor-pointer hover:opacity-80 active:scale-95 transition-all text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs hover:shadow-sm ${
                      (activity.paymentStatus === 'saldato' || activity.status === 'prenotato')
                        ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400" 
                        : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400"
                    }`}
                  >
                    {(activity.paymentStatus === 'saldato' || activity.status === 'prenotato') ? '✓ Saldato' : '⏳ Da saldare'}
                  </span>
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
