import { useState, useEffect } from 'react';
import type { Alloggio } from '../types';
import { storageService } from '../storage/storageService';
import AlloggioCard from '../components/cards/AlloggioCard';
import AlloggioForm from '../components/forms/AlloggioForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import DayPickerStrip from '../components/common/DayPickerStrip';

export default function AlloggiView() {
  const [accommodations, setAccommodations] = useState<Alloggio[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | 'tutte'>('tutte');
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccommodation, setEditingAccommodation] = useState<Alloggio | null>(null);
  const [deletingAccommodation, setDeletingAccommodation] = useState<Alloggio | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const items = await storageService.getAccommodations();
      setAccommodations(items);
    } catch (err) {
      console.error('Errore caricamento alloggi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Aggiungi Alloggio</span>
        </button>
      </header>

      {/* Selettore DayPickerStrip a scorrimento orizzontale */}
      <DayPickerStrip
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
          actionLabel="Aggiungi Primo Alloggio"
          accentVariant="purple"
          onAction={handleOpenAdd}
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
              <button
                type="button"
                onClick={handleOpenAdd}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-purple-600/20 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>+ Aggiungi Alloggio per questa data</span>
              </button>
            </div>
          );
        }

        return (
          <div className="space-y-3.5">
            {filteredAccommodations.map((acc) => (
              <AlloggioCard
                key={acc.id}
                accommodation={acc}
                onEdit={() => handleOpenEdit(acc)}
                onDelete={() => setDeletingAccommodation(acc)}
              />
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
