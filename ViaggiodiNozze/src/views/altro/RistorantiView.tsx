import { useState, useEffect, useCallback } from 'react';
import type { Ristorante } from '../../types';
import { storageService } from '../../storage/storageService';
import RistoranteForm from '../../components/forms/RistoranteForm';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import DayPickerStrip from '../../components/common/DayPickerStrip';
import SwipeToDelete from '../../components/common/SwipeToDelete';
import RistoranteCard from '../../components/cards/RistoranteCard';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { getTripDateRange, formatDate, type TripDayItem } from '../../utils/tripDates';
import { enrichRistorante } from '../../services/enrichmentService';
import TimeCollisionModal, { type TimeCollision } from '../../components/modals/TimeCollisionModal';
import type { TimelineItem } from '../../types';

interface RistorantiViewProps {
  onBack?: () => void;
}

export default function RistorantiView({ onBack }: RistorantiViewProps) {
  const { canEdit } = useDeviceRole();
  const [tripDays, setTripDays] = useState<TripDayItem[]>([]);
  const [ristoranti, setRistoranti] = useState<Ristorante[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');
  const [loading, setLoading] = useState(true);

  // Modali Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRistorante, setEditingRistorante] = useState<Ristorante | null>(null);

  // Dialog eliminazione
  const [deleteTarget, setDeleteTarget] = useState<Ristorante | null>(null);

  // Modale collisione / duplicati
  const [activeCollision, setActiveCollision] = useState<TimeCollision | null>(null);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout caricamento dati (1.5s)')), 1500)
      );

      const dataPromise = Promise.all([
        storageService.getRistoranti(),
        getTripDateRange()
      ]);

      const [loadedRistoranti, range] = await Promise.race([dataPromise, timeoutPromise]) as [Ristorante[], any];

      setRistoranti(loadedRistoranti || []);

      // Background Enrichment
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setTimeout(async () => {
          const toEnrich = (loadedRistoranti || []).filter(r => 
            r.nome && (!r.telefono || !r.linkPrenotazione) && !r._enriched
          );
          for (const r of toEnrich) {
            try {
              const enrichedData = await enrichRistorante(r.nome, r.indirizzo || '');
              if (enrichedData.telefono || enrichedData.linkMenu) {
                const updated = { 
                  ...r, 
                  telefono: r.telefono || enrichedData.telefono || '', 
                  linkPrenotazione: r.linkPrenotazione || enrichedData.linkMenu || '',
                  _enriched: true 
                };
                await storageService.updateRistorante(updated.id, updated as any);
                setRistoranti(prev => prev.map(pr => pr.id === updated.id ? updated as any : pr));
              } else {
                // segna come arricchito per non riprovare
                const updated = { ...r, _enriched: true };
                await storageService.updateRistorante(updated.id, updated as any);
              }
            } catch (e) {
              console.error("Errore durante auto-enrichment:", e);
            }
          }
        }, 3000);
      }
      if (range) setTripDays(range.tripDays);
    } catch (err) {
      console.error('Errore nel caricamento dei ristoranti:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    const handleDataMutated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.entityType === 'ristorante' && customEvent.detail?.entityId && customEvent.detail?.patch) {
        setRistoranti(prev => prev.map(r => r.id === customEvent.detail.entityId ? { ...r, ...customEvent.detail.patch } : r));
        return;
      }
      loadData(true);
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    return () => window.removeEventListener('roadbook_data_mutated', handleDataMutated);
  }, [loadData]);

  // Rilevamento automatico di ristoranti duplicati/sovrapposti in ordine cronologico
  useEffect(() => {
    if (ristoranti.length < 2) {
      setActiveCollision(null);
      return;
    }

    const normalizeStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    const isSimilarRestaurant = (r1: Ristorante, r2: Ristorante) => {
      const n1 = normalizeStr(r1.nome);
      const n2 = normalizeStr(r2.nome);
      if (!n1 || !n2) return false;
      if (n1 === n2) return true;
      if (n1.length > 3 && n2.length > 3 && (n1.includes(n2) || n2.includes(n1))) return true;
      return false;
    };

    // Ordina cronologicamente
    const sorted = [...ristoranti].sort((a, b) => {
      const dateA = a.data || '';
      const dateB = b.data || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.orario || '00:00';
      const timeB = b.orario || '00:00';
      return timeA.localeCompare(timeB);
    });

    let nextCollision: TimeCollision | null = null;
    for (let i = 0; i < sorted.length; i++) {
      const rA = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const rB = sorted[j];
        if (rA.data && rB.data && rA.data === rB.data) {
          const sameTime = (rA.orario && rB.orario && rA.orario === rB.orario);
          const similar = isSimilarRestaurant(rA, rB);

          if (sameTime || similar) {
            const collisionKey = `restaurant_collision_${rA.id}_${rB.id}`;
            const isDismissed = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(collisionKey);
            if (!isDismissed) {
              const toTimelineItem = (r: Ristorante): TimelineItem => ({
                id: r.id,
                type: 'ristorante',
                time: r.orario || 'Orario non specificato',
                title: r.nome,
                location: r.indirizzo || 'Indirizzo non specificato',
                categoryOrType: r.sottocategoria || 'Ristorante',
                completed: r.completed,
                originalData: r
              });

              nextCollision = {
                id: collisionKey,
                time: `${rA.data}${rA.orario ? ' alle ' + rA.orario : ''}`,
                itemA: toTimelineItem(rA),
                itemB: toTimelineItem(rB)
              };
              break;
            }
          }
        }
      }
      if (nextCollision) break;
    }

    setActiveCollision(nextCollision);
  }, [ristoranti]);

  const handleOpenAdd = () => {
    setEditingRistorante(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ristorante: Ristorante) => {
    setEditingRistorante(ristorante);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Omit<Ristorante, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    if (data.id) {
      await storageService.updateRistorante(data.id, data);
    } else {
      await storageService.addRistorante(data);
    }
    setIsModalOpen(false);
    setEditingRistorante(null);
    await loadData();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await storageService.deleteRistorante(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  };

  const detectRistCountry = (r: Ristorante): string => {
    const text = `${r.nome || ''} ${r.indirizzo || ''} ${r.nota || ''} ${r.noteCopilota || ''}`.toLowerCase();
    if (/(auckland|rotorua|queenstown|christchurch|wellington|lake tekapo|franz josef|punakaiki|kaikoura|coromandel|waitomo|nuova zelanda|nz)/.test(text)) return '🇳🇿 Nuova Zelanda';
    if (/(sydney|melbourne|kangaroo island|adelaide|cairns|brisbane|apollo bay|port campbell|grampians|phillip island|australia|au)/.test(text)) return '🇦🇺 Australia';
    if (/(manila|coron|el nido|boracay|cebu|bohol|panglao|siargao|filippine|ph)/.test(text)) return '🇵🇭 Filippine';
    if (/(italia|roma|milano|italy)/.test(text)) return '🇮🇹 Italia';
    return '🌍 Altro';
  };

  const macroOrder = ['🇳🇿 Nuova Zelanda', '🇦🇺 Australia', '🇵🇭 Filippine', '🇮🇹 Italia', '🌍 Altro'];

  const groupedRistorantiByCountry = useMemo(() => {
    const countryMap: Record<string, Record<string, Ristorante[]>> = {};

    filteredRistoranti.forEach(r => {
      const c = detectRistCountry(r);
      const d = r.data || 'Senza Data';
      if (!countryMap[c]) countryMap[c] = {};
      if (!countryMap[c][d]) countryMap[c][d] = [];
      countryMap[c][d].push(r);
    });

    const sortedCountries = Object.keys(countryMap).sort((a, b) => {
      const idxA = macroOrder.indexOf(a);
      const idxB = macroOrder.indexOf(b);
      return (idxA > -1 ? idxA : 99) - (idxB > -1 ? idxB : 99);
    });

    return sortedCountries.map(country => {
      const datesObj = countryMap[country];
      const sortedDates = Object.keys(datesObj).sort((a, b) => {
        if (a === 'Senza Data') return 1;
        if (b === 'Senza Data') return -1;
        return a.localeCompare(b);
      });
      return {
        country,
        dates: sortedDates.map(date => ({ date, items: datesObj[date] }))
      };
    });
  }, [filteredRistoranti]);

  return (
    <div className="flex flex-col min-h-full animate-fade-in pb-10">
      {/* Header */}
      <header className="flex items-center justify-between mb-5 px-1">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>🍽️</span> Ristoranti
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Luoghi dove mangiare, cucine tipiche e prenotazioni
            </p>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-[#FF6B5F] hover:bg-[#FFF0ED]0 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>+ Nuovo Ristorante</span>
          </button>
        )}
      </header>

      {/* Selettore DayPickerStrip standardizzato a scorrimento orizzontale */}
      <DayPickerStrip
        days={tripDays}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        totalCount={ristoranti.length}
        itemCounts={ristoranti.reduce<Record<string, number>>((acc, r) => {
          if (r.data) {
            acc[r.data] = (acc[r.data] || 0) + 1;
          }
          return acc;
        }, {})}
      />

      {/* Contenuto principale */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[250px]">
          <div className="w-7 h-7 border-2 border-[#FF6B5F] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredRistoranti.length === 0 ? (
        selectedDate !== 'tutte' ? (
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 text-center shadow-sm flex flex-col items-center justify-center gap-3">
            <span className="text-3xl">🍽️</span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Nessun elemento programmato per questo giorno
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Nessun ristorante o locale salvato per la data {selectedDate}.
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-[#FF6B5F] hover:bg-[#FFF0ED]0 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-500/20 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>+ Nuovo Ristorante per questa data</span>
              </button>
            )}
          </div>
        ) : (
          <EmptyState
            title="Nessun ristorante registrato"
            description="Aggiungi locali consigliati, pub, ristoranti tipici o prenotazioni per il viaggio."
            actionLabel={canEdit ? "+ Nuovo Ristorante" : undefined}
            accentVariant="emerald"
            onAction={canEdit ? handleOpenAdd : undefined}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            }
          />
        )
      ) : (
        <div className="space-y-8">
          {groupedRistorantiByCountry.map(({ country, dates }) => (
            <div key={country} className="space-y-4">
              <div className="sticky top-0 z-10 py-1.5 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  {country}
                </h2>
                <span className="text-[11px] font-bold text-slate-400">
                  {dates.reduce((acc, d) => acc + d.items.length, 0)} {dates.reduce((acc, d) => acc + d.items.length, 0) === 1 ? 'ristorante' : 'ristoranti'}
                </span>
              </div>

              <div className="space-y-5">
                {dates.map(({ date, items: rGroup }) => (
                  <div key={date} className="space-y-3">
                    {selectedDate === 'tutte' && (
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                        {date === 'Senza Data' ? 'Senza Data' : `Data: ${formatDate(date)}`}
                      </h3>
                    )}

                    <div className="space-y-2.5">
                      {rGroup.map((r) => (
                        <SwipeToDelete key={r.id} disabled={!canEdit} onDelete={() => setDeleteTarget(r)}>
                          <RistoranteCard
                            ristorante={r}
                            onEdit={() => handleOpenEdit(r)}
                            onDelete={() => setDeleteTarget(r)}
                          />
                        </SwipeToDelete>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modale Form Ristorante */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRistorante ? 'Modifica Ristorante' : 'Nuovo Ristorante'}
        accentVariant="emerald"
      >
        <RistoranteForm
          initialData={editingRistorante}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      {/* Dialog Conferma Eliminazione */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Conferma eliminazione"
        message={`Sei sicuro di voler eliminare il ristorante "${deleteTarget?.nome || ''}"?`}
        confirmLabel="Elimina definitivamente"
        cancelLabel="Annulla"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Popup Comparativo Ristoranti Duplicati / Sovrapposti */}
      <TimeCollisionModal
        collision={activeCollision}
        onKeepBoth={() => {
          if (activeCollision && typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(activeCollision.id, 'keep');
          }
          setActiveCollision(null);
        }}
        onDeleteItem={async (itemId) => {
          try {
            await storageService.deleteRistorante(itemId);
            setRistoranti(prev => prev.filter(r => r.id !== itemId));
            if (activeCollision && typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(activeCollision.id, 'resolved');
            }
          } catch (e) {
            console.error('Errore durante eliminazione ristorante duplicato:', e);
          } finally {
            setActiveCollision(null);
          }
        }}
        onDismiss={() => {
          if (activeCollision && typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(activeCollision.id, 'dismissed');
          }
          setActiveCollision(null);
        }}
      />
    </div>
  );
}
