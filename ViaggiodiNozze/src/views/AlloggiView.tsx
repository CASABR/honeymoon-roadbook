import { useState, useEffect } from 'react';
import type { Alloggio } from '../types';
import { storageService } from '../storage/storageService';
import AlloggioForm from '../components/forms/AlloggioForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import DayPickerStrip from '../components/common/DayPickerStrip';

import { useDeviceRole } from '../utils/useDeviceRole';
import { getTripDateRange, type TripDayItem } from '../utils/tripDates';

export default function AlloggiView() {
  const { canEdit } = useDeviceRole();
  const [tripDays, setTripDays] = useState<TripDayItem[]>([]);
  const [accommodations, setAccommodations] = useState<Alloggio[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccommodation, setEditingAccommodation] = useState<Alloggio | null>(null);
  const [deletingAccommodation, setDeletingAccommodation] = useState<Alloggio | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout caricamento dati (1.5s)')), 1500)
      );

      const dataPromise = Promise.all([
        storageService.getAccommodations(),
        getTripDateRange()
      ]);

      const [items, range] = await Promise.race([dataPromise, timeoutPromise]) as [Alloggio[], any];

      setAccommodations(items || []);
      if (range) setTripDays(range.tripDays);
      setSelectedDate('tutte');
    } catch (err) {
      console.error('Errore caricamento alloggi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleDataMutated = () => {
      loadData();
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    return () => window.removeEventListener('roadbook_data_mutated', handleDataMutated);
  }, []);

  const handleOpenAdd = () => {
    setEditingAccommodation(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (acc: Alloggio) => {
    setEditingAccommodation(acc);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Omit<Alloggio, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const accToSave: Alloggio = {
      id: data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'acc_' + Date.now()),
      name: data.name,
      location: data.location,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      address: data.address,
      status: data.status,
      bookingCode: data.bookingCode,
      bookingUrl: data.bookingUrl,
      phone: data.phone,
      notes: data.notes,
      createdAt: editingAccommodation?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveAccommodation(accToSave);
    setIsModalOpen(false);
    setEditingAccommodation(null);
    await loadData();
  };

  const handleConfirmDelete = async () => {
    if (!deletingAccommodation) return;
    await storageService.deleteAccommodation(deletingAccommodation.id);
    setDeletingAccommodation(null);
    await loadData();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px]">
        <div className="w-7 h-7 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <section className="flex flex-col flex-1 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Alloggi
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {accommodations.length === 0
              ? 'Nessuna struttura inserita'
              : accommodations.length + ' ' + (accommodations.length === 1 ? 'struttura registrata' : 'strutture registrate')}
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Aggiungi Alloggio</span>
          </button>
        )}
      </header>

      {/* Selettore DayPickerStrip a scorrimento orizzontale */}
      <DayPickerStrip
        days={tripDays}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        totalCount={accommodations.length}
        itemCounts={accommodations.reduce<Record<string, number>>((acc, a) => {
          if (a.checkIn) {
            acc[a.checkIn] = (acc[a.checkIn] || 0) + 1;
          }
          return acc;
        }, {})}
      />

      {/* Empty State Globale */}
      {accommodations.length === 0 ? (
        <EmptyState
          title="Nessun alloggio inserito"
          description="Aggiungi hotel, ryokan, appartamenti o strutture del tuo viaggio di nozze."
          actionLabel={canEdit ? "Aggiungi Primo Alloggio" : undefined}
          accentVariant="purple"
          onAction={canEdit ? handleOpenAdd : undefined}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0v-5a2 2 0 012-2h2a2 2 0 012 2v5m-6 0h6" />
            </svg>
          }
        />
      ) : (() => {
        const filteredAccommodations = accommodations.filter((acc) => {
          if (selectedDate === 'tutte') return true;
          // Mostra se la data selezionata cade tra checkIn (incluso) e checkOut (escluso/incluso per soggiorno)
          if (acc.checkIn && acc.checkOut) {
            return selectedDate >= acc.checkIn && selectedDate <= acc.checkOut;
          }
          return acc.checkIn === selectedDate;
        });

        if (filteredAccommodations.length === 0) {
          return (
            <div className="p-8 rounded-3xl bg-white border border-slate-200/80 text-center shadow-sm flex flex-col items-center justify-center gap-3">
              <span className="text-3xl">🏨</span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Nessun elemento programmato per questo giorno
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Nessun alloggio o pernottamento registrato per la data {selectedDate}.
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>+ Aggiungi Alloggio per questa data</span>
                </button>
              )}
            </div>
          );
        }

        return (
          <div className="space-y-3.5">
            {filteredAccommodations.map((acc) => (
              <div
                key={acc.id}
                onClick={() => handleOpenEdit(acc)}
                className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col gap-2.5 cursor-pointer active:scale-[0.99]"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs bg-indigo-50 text-indigo-700 border border-indigo-100">
                      🏨
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Alloggio
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingAccommodation(acc);
                        }}
                        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                        title="Elimina"
                      >
                        🗑️
                      </button>
                    )}
                    <button
                      type="button"
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all cursor-pointer shrink-0 active:scale-90 ${
                        Boolean(acc.copilota)
                          ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400 shadow-2xs'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      🧭
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(acc);
                      }}
                      className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                      title="Dettagli e Modifica"
                    >
                      ℹ️
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
                    {acc.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Check-in: {acc.checkIn} {acc.checkOut ? `• Check-out: ${acc.checkOut}` : ''}
                  </p>
                  {acc.location && (
                    <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">
                      📍 {acc.location}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Modal Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAccommodation ? 'Modifica Alloggio' : 'Nuovo Alloggio'}
        accentVariant="purple"
      >
        <AlloggioForm
          initialData={editingAccommodation}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      {/* Dialog Conferma Eliminazione */}
      <ConfirmDialog
        isOpen={Boolean(deletingAccommodation)}
        title="Elimina alloggio"
        message={"Sei sicuro di voler eliminare la struttura " + (deletingAccommodation?.name || '') + "? I dati inseriti verranno rimossi."}
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingAccommodation(null)}
      />
    </section>
  );
}
