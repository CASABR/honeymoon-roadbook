import type { Tappa } from '../../types';
import { useState, useEffect } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { formatDateIT } from '../../utils/tripDates';
import OpeningHoursBadge from '../common/OpeningHoursBadge';

interface TappaCardProps {
  tappa: Tappa;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Tappa) => void;
  variant?: 'compact' | 'full';
}

export default function TappaCard({ tappa, onEdit, onDetail, onUpdate, variant = 'full' }: TappaCardProps) {
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
  const usefulNote = (tappa.nota || (tappa as any).notes || '').trim();
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

        {usefulNote && (
          <p className="hounigo-ds-note line-clamp-2">
            {usefulNote}
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
            >
              <span>{tappa.sottocategoria === 'Sosta fotografica' ? 'Orario libero' : '+ Orario'}</span>
            </button>
          )}

          {hasCopilotNotes && copilotNotes.trim() !== usefulNote && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className="hounigo-ds-action-btn"
              title="Note operative"
            >
              <span>Note</span>
            </button>
          )}

          {mapTarget && (
            <a
              href={resolveMapUrl(mapTarget)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title="Apri su Google Maps"
            >
              <span>Maps ↗</span>
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
