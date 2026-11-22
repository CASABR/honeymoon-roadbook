import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Shopping } from '../../types';
import { storageService } from '../../storage/storageService';
import ShoppingForm, { type ShoppingFormHandle } from '../../components/forms/ShoppingForm';
import { persistExistingShoppingEdit, type ShoppingSavePayload } from '../../utils/shoppingSave';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import TimeCollisionModal, { type TimeCollision } from '../../components/modals/TimeCollisionModal';
import {
  extractTimeInterval,
  areIntervalsOverlapping,
  getCollisionPairKey,
  getPairSignature,
  isCollisionDismissedOrResolved,
  persistCollisionDecision
} from '../../utils/overlapDetection';
import type { TimelineItem } from '../../types';

import DayPickerStrip from '../../components/common/DayPickerStrip';
import SwipeToDelete from '../../components/common/SwipeToDelete';
import ShoppingCard from '../../components/cards/ShoppingCard';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { getTripDateRange, type TripDayItem } from '../../utils/tripDates';
import DesktopEconomySummary from '../../components/common/DesktopEconomySummary';

interface ShoppingViewProps {
  onBack?: () => void;
}

export default function ShoppingView({ onBack }: ShoppingViewProps) {
  const { canEdit } = useDeviceRole();
  const [tripDays, setTripDays] = useState<TripDayItem[]>([]);
  const [shoppingList, setShoppingList] = useState<Shopping[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');
  const [loading, setLoading] = useState(true);

  // Modali Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShopping, setEditingShopping] = useState<Shopping | null>(null);
  const shoppingFormActionsRef = useRef<ShoppingFormHandle | null>(null);

  // Dialog eliminazione
  const [deleteTarget, setDeleteTarget] = useState<Shopping | null>(null);

  // Modale collisione / duplicati
  const [activeCollision, setActiveCollision] = useState<TimeCollision | null>(null);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [loaded, range] = await Promise.all([
        storageService.getShopping(),
        getTripDateRange()
      ]);
      setShoppingList(loaded);
      setTripDays(range.tripDays);

      // Auto-selezione data intelligente
      const todayStr = new Date().toISOString().split('T')[0];
      const isInTrip = range.tripDays.some((d) => d.dateStr === todayStr);

      setSelectedDate((prev) => {
        if (prev !== 'tutte') return prev;
        if (isInTrip) return todayStr;
        return 'tutte';
      });
    } catch (err) {
      console.error('Errore nel caricamento dello shopping:', err);
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
      if (customEvent.detail?.entityType === 'shopping' && customEvent.detail?.entityId && customEvent.detail?.patch) {
        setShoppingList(prev => prev.map(s => s.id === customEvent.detail.entityId ? { ...s, ...customEvent.detail.patch } : s));
        return;
      }
      loadData(true);
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    return () => window.removeEventListener('roadbook_data_mutated', handleDataMutated);
  }, [loadData]);

  // Rilevamento automatico di shopping duplicati/sovrapposti in ordine cronologico
  useEffect(() => {
    if (shoppingList.length < 2) {
      setActiveCollision(null);
      return;
    }

    // Ordina cronologicamente
    const sorted = [...shoppingList].sort((a, b) => {
      const dateA = a.data || '';
      const dateB = b.data || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.orario || '00:00';
      const timeB = b.orario || '00:00';
      return timeA.localeCompare(timeB);
    });

    let nextCollision: TimeCollision | null = null;
    for (let i = 0; i < sorted.length; i++) {
      const sA = sorted[i];
      const intA = extractTimeInterval(sA, 'shopping');

      for (let j = i + 1; j < sorted.length; j++) {
        const sB = sorted[j];
        if (sA.id === sB.id) continue;

        const intB = extractTimeInterval(sB, 'shopping');

        if (areIntervalsOverlapping(intA, intB)) {
          const pairKey = getCollisionPairKey(sA.id, sB.id, 'shopping');
          const sig = getPairSignature(intA.signature, intB.signature);
          const isDismissed = isCollisionDismissedOrResolved(sA.id, sB.id, sig, 'shopping');

          if (!isDismissed) {
            const toTimelineItem = (s: Shopping): TimelineItem => ({
              id: s.id,
              type: 'shopping',
              time: s.orario || 'Orario non specificato',
              title: s.nome,
              location: s.indirizzo || 'Indirizzo non specificato',
              categoryOrType: s.sottocategoria || 'Shopping',
              completed: s.completed,
              originalData: s
            });

            const displayTime = sA.orario === sB.orario
              ? `${intA.date}${sA.orario ? ' alle ' + sA.orario : ''}`
              : `${intA.date} (${sA.orario || 'N/D'} vs ${sB.orario || 'N/D'})`;

            nextCollision = {
              id: pairKey,
              time: displayTime,
              itemA: toTimelineItem(sA),
              itemB: toTimelineItem(sB)
            };
            break;
          }
        }
      }
      if (nextCollision) break;
    }

    setActiveCollision(nextCollision);
  }, [shoppingList]);

  const handleOpenAdd = () => {
    setEditingShopping(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: Shopping) => {
    setEditingShopping(item);
    setIsModalOpen(true);
  };

  const isExistingShoppingEdit = Boolean(
    editingShopping?.id && shoppingList.some((item) => item.id === editingShopping.id)
  );

  const closeShoppingModalImmediate = () => {
    setIsModalOpen(false);
    setEditingShopping(null);
  };

  const handleAttemptCloseShoppingModal = async () => {
    const canClose = await shoppingFormActionsRef.current?.requestClose();
    if (canClose === false) return;
    closeShoppingModalImmediate();
  };

  const handleAutoSaveShopping = async (data: ShoppingSavePayload): Promise<Shopping> => {
    const saved = await persistExistingShoppingEdit(editingShopping, data);
    setShoppingList((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    setEditingShopping(saved);
    await loadData(true);
    return saved;
  };

  const handleSave = async (data: Omit<Shopping, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    if (data.id) {
      await storageService.updateShopping(data.id, data);
    } else {
      await storageService.addShopping(data);
    }
    closeShoppingModalImmediate();
    await loadData(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await storageService.deleteShopping(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  };

  const filteredShopping = useMemo(() => {
    if (selectedDate === 'tutte') return shoppingList;
    return shoppingList.filter(s => s.data === selectedDate);
  }, [shoppingList, selectedDate]);

  const detectShopCountry = (s: Shopping): string => {
    const text = `${s.nome || ''} ${s.indirizzo || ''} ${s.nota || ''} ${s.noteCopilota || ''}`.toLowerCase();
    if (/(sydney|melbourne|kangaroo island|adelaide|cairns|brisbane|apollo bay|port campbell|grampians|phillip island|australia|\bau\b|gerringong|werri|jervis|nsw|huskisson)/.test(text)) return '🇦🇺 Australia';
    if (/(auckland|rotorua|queenstown|christchurch|wellington|lake tekapo|franz josef|punakaiki|kaikoura|coromandel|waitomo|nuova zelanda|\bnz\b|hobbiton|te puia|milford)/.test(text)) return '🇳🇿 Nuova Zelanda';
    if (/(manila|coron|el nido|boracay|cebu|bohol|panglao|siargao|filippine|\bph\b)/.test(text)) return '🇵🇭 Filippine';
    if (/(italia|roma|milano|italy|\bit\b)/.test(text)) return '🇮🇹 Italia';
    return '🌍 Altro';
  };

  const macroOrder = ['🇮🇹 Italia', '🇳🇿 Nuova Zelanda', '🇦🇺 Australia', '🇵🇭 Filippine', '🌍 Altro'];

  const groupedShoppingByCountry = useMemo(() => {
    const countryMap: Record<string, Record<string, Shopping[]>> = {};

    filteredShopping.forEach(s => {
      const c = detectShopCountry(s);
      const d = s.data || 'Senza Data';
      if (!countryMap[c]) countryMap[c] = {};
      if (!countryMap[c][d]) countryMap[c][d] = [];
      countryMap[c][d].push(s);
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
  }, [filteredShopping]);

  const formatMicroHeaderDate = (dateString: string) => {
    if (dateString === 'Senza Data') return 'SENZA DATA';
    try {
      const [y, m, d] = dateString.split('-');
      if (y && m && d) {
        return `${d}-${m}-${y}`;
      }
      return dateString;
    } catch {
      return dateString;
    }
  };

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
              <span>🛍️</span> Shopping
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Negozi, mercatini tipici, souvenir e centri commerciali
            </p>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-rose-500 hover:bg-rose-400 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>+ Nuovo Shopping</span>
          </button>
        )}
      </header>

      {/* Riepilogo Economico Solo Desktop */}
      <DesktopEconomySummary items={shoppingList} categoryName="Shopping" accentColor="emerald" />

      {/* Selettore DayPickerStrip standardizzato a scorrimento orizzontale */}
      <DayPickerStrip
        days={tripDays}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        totalCount={shoppingList.length}
        itemCounts={shoppingList.reduce<Record<string, number>>((acc, s) => {
          if (s.data) {
            acc[s.data] = (acc[s.data] || 0) + 1;
          }
          return acc;
        }, {})}
      />

      {/* Contenuto principale */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[250px]">
          <div className="w-7 h-7 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredShopping.length === 0 ? (
        selectedDate !== 'tutte' ? (
          <div className="p-8 rounded-3xl bg-white border border-slate-200/80 text-center shadow-sm flex flex-col items-center justify-center gap-3">
            <span className="text-3xl">🛍️</span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Nessun acquisto programmato per questo giorno
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Nessun negozio o sosta shopping salvata per la data {selectedDate}.
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-400 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-500/20 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>+ Nuovo Shopping per questa data</span>
              </button>
            )}
          </div>
        ) : (
          <EmptyState
            title="Nessun negozio o mercato registrato"
            description="Aggiungi mercati locali, negozi di souvenir tipici o boutique da visitare durante il viaggio."
            actionLabel={canEdit ? "+ Nuovo Shopping" : undefined}
            accentVariant="rose"
            onAction={canEdit ? handleOpenAdd : undefined}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            }
          />
        )
      ) : (
        <div className="space-y-8">
          {groupedShoppingByCountry.map(({ country, dates }) => (
            <div key={country} className="space-y-4">
              <div className="sticky app-sticky-subheader z-10 py-1.5 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  {country}
                </h2>
                <span className="text-[11px] font-bold text-slate-400">
                  {dates.reduce((acc, d) => acc + d.items.length, 0)} {dates.reduce((acc, d) => acc + d.items.length, 0) === 1 ? 'negozio' : 'negozi'}
                </span>
              </div>

              <div className="space-y-5">
                {dates.map(({ date, items: sGroup }) => (
                  <div key={date} className="space-y-3">
                    {selectedDate === 'tutte' && (
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-1 mb-2">
                        {formatMicroHeaderDate(date)}
                      </h3>
                    )}

                    <div className="space-y-2.5">
                      {sGroup.map((s) => (
                        <SwipeToDelete key={s.id} disabled={!canEdit} onDelete={() => setDeleteTarget(s)}>
                          <ShoppingCard
                            shopping={s}
                            onEdit={() => handleOpenEdit(s)}
                            onDelete={() => setDeleteTarget(s)}
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

      {/* Modale Form Shopping */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleAttemptCloseShoppingModal}
        title={editingShopping ? 'Modifica Shopping' : 'Nuovo Shopping'}
        accentVariant="rose"
      >
        <ShoppingForm
          initialData={editingShopping}
          onSave={handleSave}
          onAutoSave={isExistingShoppingEdit ? handleAutoSaveShopping : undefined}
          onAutoSaveCompleteClose={closeShoppingModalImmediate}
          onDiscardInvalidClose={closeShoppingModalImmediate}
          formActionsRef={shoppingFormActionsRef}
          onCancel={handleAttemptCloseShoppingModal}
        />
      </Modal>

      {/* Dialog Conferma Eliminazione */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Conferma eliminazione"
        message={`Sei sicuro di voler eliminare "${deleteTarget?.nome || ''}"?`}
        confirmLabel="Elimina definitivamente"
        cancelLabel="Annulla"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Popup Comparativo Shopping Duplicati / Sovrapposti */}
      <TimeCollisionModal
        collision={isModalOpen ? null : activeCollision}
        onKeepBoth={() => {
          if (activeCollision) {
            const rawA = activeCollision.itemA.originalData || activeCollision.itemA;
            const rawB = activeCollision.itemB.originalData || activeCollision.itemB;
            const intA = extractTimeInterval(rawA, 'shopping');
            const intB = extractTimeInterval(rawB, 'shopping');
            const sig = getPairSignature(intA.signature, intB.signature);
            persistCollisionDecision(activeCollision.itemA.id, activeCollision.itemB.id, 'keep', sig, 'shopping');
          }
          setActiveCollision(null);
        }}
        onDeleteItem={async (itemId) => {
          try {
            await storageService.deleteShopping(itemId);
            setShoppingList(prev => prev.filter(s => s.id !== itemId));
            if (activeCollision) {
              const rawA = activeCollision.itemA.originalData || activeCollision.itemA;
              const rawB = activeCollision.itemB.originalData || activeCollision.itemB;
              const intA = extractTimeInterval(rawA, 'shopping');
              const intB = extractTimeInterval(rawB, 'shopping');
              const sig = getPairSignature(intA.signature, intB.signature);
              persistCollisionDecision(activeCollision.itemA.id, activeCollision.itemB.id, 'resolved', sig, 'shopping');
            }
          } catch (e) {
            console.error('Errore durante eliminazione shopping duplicato:', e);
          } finally {
            setActiveCollision(null);
          }
        }}
        onDismiss={() => {
          if (activeCollision) {
            const rawA = activeCollision.itemA.originalData || activeCollision.itemA;
            const rawB = activeCollision.itemB.originalData || activeCollision.itemB;
            const intA = extractTimeInterval(rawA, 'shopping');
            const intB = extractTimeInterval(rawB, 'shopping');
            const sig = getPairSignature(intA.signature, intB.signature);
            persistCollisionDecision(activeCollision.itemA.id, activeCollision.itemB.id, 'dismissed', sig, 'shopping');
          }
          setActiveCollision(null);
        }}
      />
    </div>
  );
}
