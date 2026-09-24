import { useState, useEffect } from 'react';
import type { Trasporto } from '../types';
import { storageService } from '../storage/storageService';
import TrasportoCard from '../components/cards/TrasportoCard';
import TrasportoForm from '../components/forms/TrasportoForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';

type FilterType = 'tutti' | 'volo' | 'traghetto' | 'auto_camper' | 'transfer';

export default function TrasportiView() {
  const [transports, setTransports] = useState<Trasporto[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('tutti');

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
      dropoffDate: data.dropoffDate,
      dropoffTime: data.dropoffTime,
      dropoffLocation: data.dropoffLocation,
      carrier: data.carrier,
      bookingCode: data.bookingCode,
      ticketUrl: data.ticketUrl,
      cost: data.cost,
      layover: data.layover,
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

  const handleReloadSeedData = async () => {
    if (confirm('Vuoi ripristinare le tratte certificate del viaggio di nozze con orari, scali e prezzi in €?')) {
      await storageService.seedTransports(true);
      await loadData();
    }
  };

  // Filtraggio tratte
  const filteredTransports = transports.filter((t) => {
    if (activeFilter === 'tutti') return true;
    if (activeFilter === 'volo') return t.type === 'volo';
    if (activeFilter === 'traghetto') return t.type === 'traghetto';
    if (activeFilter === 'auto_camper') return t.type === 'auto' || t.type === 'camper';
    if (activeFilter === 'transfer') return t.type === 'transfer';
    return true;
  });

  // Contatori per badge delle chips
  const counts = {
    tutti: transports.length,
    volo: transports.filter((t) => t.type === 'volo').length,
    traghetto: transports.filter((t) => t.type === 'traghetto').length,
    auto_camper: transports.filter((t) => t.type === 'auto' || t.type === 'camper').length,
    transfer: transports.filter((t) => t.type === 'transfer').length
  };

  const filterChips: { id: FilterType; label: string; icon: string; count: number }[] = [
    { id: 'tutti', label: 'Tutti', icon: '🌐', count: counts.tutti },
    { id: 'volo', label: 'Voli', icon: '✈️', count: counts.volo },
    { id: 'traghetto', label: 'Traghetti', icon: '⛴️', count: counts.traghetto },
    { id: 'auto_camper', label: 'Auto & Camper', icon: '🚐', count: counts.auto_camper },
    { id: 'transfer', label: 'Transfer', icon: '🚕', count: counts.transfer }
  ];

  // Raggruppamento giorno per giorno (Intestazione Data)
  const groupedTransports = filteredTransports.reduce<Record<string, Trasporto[]>>((acc, transport) => {
    const dateKey = transport.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(transport);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedTransports).sort((a, b) => a.localeCompare(b));

  const formatGroupDateHeader = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      const monthNames: Record<string, string> = {
        '01': 'Gennaio', '02': 'Febbraio', '03': 'Marzo', '04': 'Aprile',
        '05': 'Maggio', '06': 'Giugno', '07': 'Luglio', '08': 'Agosto',
        '09': 'Settembre', '10': 'Ottobre', '11': 'Novembre', '12': 'Dicembre'
      };
      const month = monthNames[m] || m;
      return `${d} ${month} ${y}`;
    } catch {
      return dateStr;
    }
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
      {/* Header Mobile-First */}
      <header className="flex items-center justify-between mb-3.5 flex-wrap gap-2.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
            Trasporti
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {transports.length === 0
              ? 'Nessuna tratta inserita'
              : `${transports.length} ${transports.length === 1 ? 'tratta registrata' : 'tratte registrate'} (confermate)`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={handleReloadSeedData}
            title="Carica o ripristina le tratte certificate del viaggio di nozze"
            className="inline-flex items-center gap-1 min-h-[36px] px-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-sky-400 font-medium text-xs rounded-xl border border-slate-700/80 transition-all cursor-pointer"
          >
            <span>🔄 Ripristina</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1 min-h-[36px] px-3 bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-semibold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Nuovo</span>
          </button>
        </div>
      </header>

      {/* Chips Filter Horizontal Bar */}
      {transports.length > 0 && (
        <div className="-mx-1 mb-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 px-1 scrollbar-none snap-x">
            {filterChips.map((chip) => {
              const isActive = activeFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveFilter(chip.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all snap-start cursor-pointer border ${
                    isActive
                      ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 shadow-md shadow-sky-500/10'
                      : 'bg-slate-800/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span>{chip.icon}</span>
                  <span>{chip.label}</span>
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
                      isActive ? 'bg-sky-500 text-slate-950 font-bold' : 'bg-slate-700/80 text-slate-300'
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {transports.length === 0 ? (
        <EmptyState
          title="Nessun trasporto inserito"
          description="Carica le tratte certificate del viaggio di nozze oppure inserisci nuovi voli, traghetti, camper e transfer."
          actionLabel="Carica Tratte Certificate"
          accentVariant="sky"
          onAction={handleReloadSeedData}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          }
        />
      ) : filteredTransports.length === 0 ? (
        <div className="text-center py-10 px-4 rounded-2xl bg-slate-900/40 border border-slate-800">
          <p className="text-sm text-slate-400">Nessuna tratta per la categoria selezionata.</p>
          <button
            type="button"
            onClick={() => setActiveFilter('tutti')}
            className="mt-3 text-xs font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
          >
            Mostra tutti i trasporti
          </button>
        </div>
      ) : (
        /* Elenco Raggruppato Giorno per Giorno */
        <div className="space-y-6">
          {sortedDates.map((dateKey) => {
            const dayItems = groupedTransports[dateKey];
            return (
              <div key={dateKey} className="space-y-3">
                {/* Intestazione Data */}
                <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-md py-2 flex items-center justify-between border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🗓️</span>
                    <h2 className="text-sm font-bold text-sky-400 tracking-wide uppercase">
                      {formatGroupDateHeader(dateKey)}
                    </h2>
                  </div>
                  <span className="text-[11px] font-mono font-medium text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-800">
                    {dayItems.length} {dayItems.length === 1 ? 'spostamento' : 'spostamenti'}
                  </span>
                </div>

                {/* Card del Giorno */}
                <div className="space-y-3">
                  {dayItems.map((transport) => (
                    <TrasportoCard
                      key={transport.id}
                      transport={transport}
                      onEdit={() => handleOpenEdit(transport)}
                      onDelete={() => setDeletingTransport(transport)}
                      onUpdate={(updated) => {
                        setTransports((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
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


