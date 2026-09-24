import { useState, useEffect } from 'react';
import type { Trasporto } from '../types';
import { storageService } from '../storage/storageService';
import TrasportoCard from '../components/cards/TrasportoCard';
import TrasportoForm from '../components/forms/TrasportoForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';

export default function TrasportiView() {
  const [transports, setTransports] = useState<Trasporto[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransport, setEditingTransport] = useState<Trasporto | null>(null);
  const [deletingTransport, setDeletingTransport] = useState<Trasporto | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const items = await storageService.getTransports();
      setTransports(items);
    } catch (err) {
      console.error('Errore caricamento trasporti:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingTransport(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (transport: Trasporto) => {
    setEditingTransport(transport);
    setIsModalOpen(true);
  };

  const handleSave = async (data: Omit<Trasporto, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const transportToSave: Trasporto = {
      id: data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'trn_' + Date.now()),
      type: data.type,
      date: data.date,
      departureTime: data.departureTime,
      arrivalTime: data.arrivalTime,
      departureLocation: data.departureLocation,
      arrivalLocation: data.arrivalLocation,
      carrier: data.carrier,
      bookingCode: data.bookingCode,
      ticketUrl: data.ticketUrl,
      notes: data.notes,
      status: data.status,
      createdAt: editingTransport?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await storageService.saveTransport(transportToSave);
    setIsModalOpen(false);
    setEditingTransport(null);
    await loadData();
  };

  const handleConfirmDelete = async () => {
    if (!deletingTransport) return;
    await storageService.deleteTransport(deletingTransport.id);
    setDeletingTransport(null);
    await loadData();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px]">
        <div className="w-7 h-7 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <section className="flex flex-col flex-1 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Trasporti & Spostamenti
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {transports.length === 0
              ? 'Nessuna tratta inserita'
              : transports.length + ' ' + (transports.length === 1 ? 'tratta registrata' : 'tratte registrate')}
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-semibold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Aggiungi Trasporto</span>
        </button>
      </header>

      {/* Empty State */}
      {transports.length === 0 ? (
        <EmptyState
          title="Nessun trasporto inserito"
          description="Registra voli, treni, auto a noleggio, traghetti o transfer per organizzare gli spostamenti."
          actionLabel="Aggiungi Primo Trasporto"
          accentVariant="sky"
          onAction={handleOpenAdd}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-3.5">
          {transports.map((transport) => (
            <TrasportoCard
              key={transport.id}
              transport={transport}
              onEdit={() => handleOpenEdit(transport)}
              onDelete={() => setDeletingTransport(transport)}
            />
          ))}
        </div>
      )}

      {/* Modal Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTransport ? 'Modifica Trasporto' : 'Nuovo Trasporto'}
        accentVariant="sky"
      >
        <TrasportoForm
          initialData={editingTransport}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      {/* Dialog Conferma Eliminazione */}
      <ConfirmDialog
        isOpen={Boolean(deletingTransport)}
        title="Elimina trasporto"
        message={"Sei sicuro di voler eliminare la tratta " + (deletingTransport ? deletingTransport.departureLocation + ' → ' + deletingTransport.arrivalLocation : '') + "? I dati inseriti verranno rimossi."}
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingTransport(null)}
      />
    </section>
  );
}
