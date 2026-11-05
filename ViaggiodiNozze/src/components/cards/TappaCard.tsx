import type { Tappa } from '../../types';
import { useState, useEffect } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService } from '../../storage/storageService';
import { resolveMapUrl, hasReliableGeoDestination, getMapsActionLabel } from '../../utils/mapsHelper';
import { formatDateIT } from '../../utils/tripDates';
import OpeningHoursBadge from '../common/OpeningHoursBadge';
import { PHOTO_LIGHT_LABELS } from '../../utils/activityType';

interface TappaCardProps {
  tappa: Tappa;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onDuplicate?: () => void;
  onUpdate?: (updated: Tappa) => void;
  variant?: 'compact' | 'full';
}

export default function TappaCard({ tappa, onEdit, onDetail, onDuplicate, onUpdate, variant = 'full' }: TappaCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const initialCopilot = (tappa as any).noteCopilota || (tappa as any).nota || (tappa as any).notes || '';
  const [copilotNotes, setCopilotNotes] = useState<string>(initialCopilot);

  useEffect(() => {
    const nextNotes = (tappa as any).noteCopilota || (tappa as any).nota || (tappa as any).notes || '';
    setCopilotNotes(nextNotes);
  }, [tappa]);

  const hasCopilotNotes = Boolean(copilotNotes.trim());
  const orario = tappa.orario || (tappa as any).time;
  const isCompact = variant === 'compact';

  const mapTarget = tappa.mapsUrl || tappa.indirizzo || tappa.titolo;
  const hasSubcategory = Boolean(tappa.sottocategoria && tappa.sottocategoria.trim() && tappa.sottocategoria !== 'Tappa');

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
              </>
            )}
          </div>

          {headerTimeSummary && (
            <span className="hounigo-ds-time-stamp">
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

                {/* Spot fotografico: anteprima foto e finestra di luce */}
        {(tappa.sottocategoria === 'Spot fotografico' || tappa.sottocategoria === 'Sosta fotografica') && (
          <div className="space-y-2 mt-2.5">
            {tappa.attachments && tappa.attachments.find(a => a.type === 'image') && (
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                <img
                  src={tappa.attachments.find(a => a.type === 'image')?.dataUrl}
                  alt={tappa.titolo}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
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

        {hasCopilotNotes && (
          <p className="hounigo-ds-note line-clamp-2">
            {copilotNotes.trim()}
          </p>
        )}
      </div>

      {/* 3. FOOTER: TAGLIANDO AZIONI EFFETTIVAMENTE DISPONIBILI */}
      <div className="hounigo-ds-card-footer">
        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {!orario && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="hounigo-ds-action-btn"
              title="Inserisci orario per questa tappa"
              aria-label="Inserisci orario"
            >
              <span aria-hidden="true">+ ⏰</span>
              <span className="hidden sm:inline">Orario</span>
            </button>
          )}

          {hasCopilotNotes && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className="hounigo-ds-action-btn"
              title="Note per il Copilota"
              aria-label="Note per il Copilota"
            >
              <span aria-hidden="true">🧭</span>
              <span className="hidden sm:inline">Note</span>
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
              <span className="hidden sm:inline">Duplica</span>
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
              <span aria-hidden="true">🗺️</span>
              <span className="hidden sm:inline">{getMapsActionLabel(hasReliableGeoDestination(tappa))}</span>
              <span className="text-[10px] opacity-70">↗</span>
            </a>
          )}
        </div>
      </div>

      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={tappa.titolo || 'Dettaglio'}
        noteCopilota={copilotNotes}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const clean = notes.trim();
            setCopilotNotes(clean);
            const updated = { ...tappa, noteCopilota: clean, updatedAt: Date.now() } as any;
            await storageService.saveTappa(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' } }));
            setIsCopilotOpen(false);
          } catch (e) { console.error(e); }
        }}
      />
    </div>
  );
}
