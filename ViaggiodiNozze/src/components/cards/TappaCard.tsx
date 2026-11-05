import { Handshake } from 'lucide-react';
import type { Tappa } from '../../types';
import { useState, useEffect, useRef } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService } from '../../storage/storageService';
import { resolveMapUrl, hasReliableGeoDestination, getMapsActionLabel } from '../../utils/mapsHelper';
import GoogleMapsIcon from '../icons/GoogleMapsIcon';
import { formatDateIT } from '../../utils/tripDates';
import OpeningHoursBadge from '../common/OpeningHoursBadge';
import { PHOTO_LIGHT_LABELS } from '../../utils/activityType';
import { processFileForAttachment } from '../../utils/fileAttachment';

interface TappaCardProps {
  tappa: Tappa;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onDuplicate?: () => void;
  onUpdate?: (updated: Tappa) => void;
  variant?: 'compact' | 'full';
  sequenceInfo?: { inSequence: boolean; sequenceIndex: number; sequenceTotal: number };
}

export default function TappaCard({ tappa, onEdit, onDetail, onDuplicate, onUpdate, variant = 'full', sequenceInfo }: TappaCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const initialCopilot = (tappa as any).noteCopilota || (tappa as any).nota || (tappa as any).notes || '';
  const [copilotNotes, setCopilotNotes] = useState<string>(initialCopilot);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPhoto(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const processed = await processFileForAttachment(file);
      const photoAtt: any = { ...processed, purpose: 'photo' };
      const currentAtts = (tappa.attachments || []).filter(a => a.type !== 'image');
      const updated = {
        ...tappa,
        attachments: [...currentAtts, photoAtt],
        updatedAt: Date.now()
      };
      await storageService.saveTappa(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'tappe', data: updated } }));
    } catch (err) {
      console.error('Errore caricamento foto tappa drag-and-drop:', err);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const processed = await processFileForAttachment(file);
      const photoAtt: any = { ...processed, purpose: 'photo' };
      const currentAtts = (tappa.attachments || []).filter(a => a.type !== 'image');
      const updated = {
        ...tappa,
        attachments: [...currentAtts, photoAtt],
        updatedAt: Date.now()
      };
      await storageService.saveTappa(updated);
      if (typeof onUpdate === 'function') onUpdate(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'tappe', data: updated } }));
    } catch (err) {
      console.error('Errore selezione foto tappa:', err);
    }
  };

  useEffect(() => {
    const nextNotes = (tappa as any).noteCopilota || (tappa as any).nota || (tappa as any).notes || '';
    setCopilotNotes(nextNotes);
  }, [tappa]);

  const hasCopilotNotes = Boolean(copilotNotes.trim());
  const orario = tappa.orario || (tappa as any).time;
  const isCompact = variant === 'compact';

  const mapTarget = tappa.mapsUrl || tappa.indirizzo || tappa.titolo;
  const hasSubcategory = Boolean(tappa.sottocategoria && tappa.sottocategoria.trim() && tappa.sottocategoria !== 'Tappa');
  const isConfirmed = tappa.timeStatus === 'confermato';

  const headerTimeSummary = orario
    ? `Ore ${orario}${tappa.timeStatus === 'indicativo' ? ' · indicativo' : ''}`
    : (!isCompact && tappa.data ? formatDateIT(tappa.data) : '');

  return (
    <div
      onClick={onDetail || onEdit}
      className="hounigo-ds-card hounigo-ds-cat-tappa cursor-pointer"
    >
      {/* 1. HEADER: TARGA CATEGORIA ROSA E CARTELLINO ORARIO CONFERMATO/INDICATIVO */}
      <div className="hounigo-ds-card-header hounigo-ds-header-tappa">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider min-w-0 truncate">
            <span aria-hidden="true" className="text-xs">📍</span>
            <span>Tappa</span>
            {hasSubcategory && (
              <>
                <span className="opacity-45">·</span>
                <span className="font-bold tracking-wide truncate">
                  {tappa.sottocategoria}
                </span>
            {sequenceInfo?.inSequence && (
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 shrink-0 ml-1.5">
                Tappa {sequenceInfo.sequenceIndex}/{sequenceInfo.sequenceTotal}
              </span>
            )}
              </>
            )}
          </div>

          {headerTimeSummary && (
            <span
              className={`hounigo-ds-time-stamp ${isConfirmed ? 'text-[#FF6B5F] font-black border-[#FF6B5F]/40 bg-rose-50/60 dark:bg-rose-950/40' : ''}`}
              title={isConfirmed ? 'Orario confermato' : 'Orario indicativo'}
            >
              {isConfirmed && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FF6B5F] mr-1" aria-hidden="true" />}
              {headerTimeSummary}
            </span>
          )}
        </div>
      </div>

      {/* 2. BODY: TITOLO, TRACCIATO LUOGO ED EVENTUALI ORARI/NOTE */}
      <div className="hounigo-ds-card-body">
        <h3 className="font-extrabold text-base sm:text-[17px] leading-snug tracking-tight text-slate-900 dark:text-white break-words">
          {tappa.titolo}
        </h3>

        {tappa.indirizzo && (
          <div className="hounigo-ds-route-track">
            <div className="hounigo-ds-route-stop hounigo-ds-route-stop-end">
              <span className="hounigo-ds-route-kicker">Luogo</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">
                {tappa.indirizzo}
              </span>
            </div>
          </div>
        )}

        {tappa.openingHours && tappa.openingHours.verifiedAt && tappa.openingHours.status !== 'unverified' && (
          <OpeningHoursBadge info={tappa.openingHours} date={tappa.data || tappa.date} time={orario} />
        )}

        {tappa.bookingCode && (
          <div className="hounigo-ds-spec-grid">
            <div className="hounigo-ds-spec-cell">
              <span className="hounigo-ds-spec-label">Codice ingresso</span>
              <span className="hounigo-ds-spec-value font-mono">{tappa.bookingCode}</span>
            </div>
          </div>
        )}

        {/* Spot fotografico: anteprima foto e finestra di luce con supporto drag-and-drop */}
        {(tappa.sottocategoria === 'Spot fotografico' || tappa.sottocategoria === 'Sosta fotografica') && (
          <div className="space-y-2 mt-2.5">
            {(() => {
              const photoImage = tappa.attachments?.find(a => a.type === 'image');
              return (
                <div
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingPhoto(true); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingPhoto(false); }}
                  onDrop={handlePhotoDrop}
                  onClick={(e) => { e.stopPropagation(); photoInputRef.current?.click(); }}
                  className={`relative rounded-xl overflow-hidden cursor-pointer transition ${
                    photoImage
                      ? 'h-32 sm:h-36 border border-slate-200 dark:border-slate-800'
                      : `p-3 border border-dashed text-center flex items-center justify-center gap-2 ${
                          isDraggingPhoto
                            ? 'border-[#FF6B5F] bg-rose-50/60 dark:bg-rose-950/40 text-[#FF6B5F]'
                            : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 text-slate-500 dark:text-slate-400'
                        }`
                  }`}
                  title="Trascina una foto o tocca per caricarla"
                >
                  {photoImage ? (
                    <>
                      <img
                        src={photoImage.dataUrl}
                        alt={tappa.titolo}
                        className="h-full w-full object-cover"
                      />
                      {isDraggingPhoto && (
                        <div className="absolute inset-0 bg-[#172033]/70 flex items-center justify-center text-white text-xs font-bold">
                          Rilascia per sostituire la foto
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-base">📸</span>
                      <span className="text-xs font-semibold">
                        {isDraggingPhoto ? 'Rilascia la foto qui' : 'Trascina una foto o tocca per caricare'}
                      </span>
                    </>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </div>
              );
            })()}
            {tappa.lightWindow && tappa.lightWindow !== 'qualsiasi' && (
              <div className="hounigo-ds-spec-grid">
                <div className="hounigo-ds-spec-cell">
                  <span className="hounigo-ds-spec-label">Finestra luce</span>
                  <span className="hounigo-ds-spec-value font-bold text-[#FF6B5F]">
                    {PHOTO_LIGHT_LABELS[tappa.lightWindow] || tappa.lightWindow}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {hasCopilotNotes && tappa.mostraNoteInCard && (
          <p className="hounigo-ds-note line-clamp-2">
            {copilotNotes.trim()}
          </p>
        )}
      </div>

      {/* 3. FOOTER: TAGLIANDO AZIONI EFFETTIVAMENTE DISPONIBILI */}
      <div className="hounigo-ds-card-footer">
        <div className="hounigo-ds-actions-group">
          {!orario && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="hounigo-ds-action-btn"
              title="Inserisci orario per questa tappa"
              aria-label="Inserisci orario"
            >
              <span aria-hidden="true">+ ⏰</span>
              <span className="hounigo-ds-btn-text">Orario</span>
            </button>
          )}

          {hasCopilotNotes && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className={`hounigo-ds-action-btn ${hasCopilotNotes ? 'hounigo-ds-action-btn-active-green' : ''}`}
              title="Note per il Copilota"
              aria-label="Note Copilota"
            >
              <Handshake className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hounigo-ds-btn-text">Copilota</span>
            </button>
          )}

          {onDuplicate && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="hounigo-ds-action-btn"
              title="Duplica questa tappa"
              aria-label="Duplica questa tappa"
            >
              <span aria-hidden="true">📄</span>
              <span className="hounigo-ds-btn-text">Duplica</span>
            </button>
          )}
          {mapTarget && (
            <a
              href={resolveMapUrl(mapTarget)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title={hasReliableGeoDestination(tappa) ? "Avvia navigazione verso la destinazione" : "Cerca il luogo per nome su Google Maps"}
              aria-label="Apri su Google Maps"
            >
              <GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="hounigo-ds-btn-text">{getMapsActionLabel(hasReliableGeoDestination(tappa))}</span>
              <span className="hounigo-ds-btn-arrow text-[10px] opacity-70">↗</span>
            </a>
          )}
        </div>
      </div>

      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={tappa.titolo || 'Dettaglio'}
        noteCopilota={copilotNotes}
        mostraNoteInCard={tappa.mostraNoteInCard}
        canEdit={true}
        onSave={async (notes, showOnCard) => {
          try {
            const clean = notes.trim();
            setCopilotNotes(clean);
            const updated = {
              ...tappa,
              noteCopilota: clean,
              mostraNoteInCard: Boolean(showOnCard),
              updatedAt: Date.now()
            } as any;
            await storageService.saveTappa(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'tappe', data: updated } }));
            setIsCopilotOpen(false);
          } catch (e) { console.error(e); }
        }}
      />
    </div>
  );
}
