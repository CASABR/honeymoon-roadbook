import { useState, useEffect } from 'react';
import type { Trasporto } from '../types';
import { storageService } from '../storage/storageService';
import TrasportoCard from '../components/cards/TrasportoCard';
import TrasportoForm from '../components/forms/TrasportoForm';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmptyState from '../components/EmptyState';

const detectCountry = (t: Trasporto): string => {
  const text = `${t.departureLocation} ${t.arrivalLocation} ${t.layover?.airport || ''} ${t.carrier || ''} ${t.notes || ''}`.toLowerCase();
  if (/(auckland|akl|chc|wellington|christchurch|picton|queenstown|rotorua|snap rentals|cook strait|sealink|nuova zelanda)/.test(text)) return '🇳🇿 Nuova Zelanda';
  if (/(syd|mel|adl|adelaide|kangaroo island|sydney|melbourne|virgin australia|jetstar|australia)/.test(text)) return '🇦🇺 Australia';
  if (/(mnl|mph|eni|usu|ceb|manila|boracay|el nido|tao coron|cebu|filippine|airswift|asia)/.test(text)) return '🇵🇭 Filippine';
  if (/(pek|pvg|roma|fco|mxp|malpensa|air china|china airlines|doha)/.test(text) || (t.type === 'volo' && (text.includes('milano') || text.includes('roma') || text.includes('intercontinentale')))) return '✈️ Intercontinentali';
  return '🌍 Altro';
};

type FilterType = 'tutti' | 'volo' | 'traghetto' | 'auto_camper' | 'transfer';
type CountryFilterType = 'tutti' | '🇳🇿 Nuova Zelanda' | '🇦🇺 Australia' | '🇵🇭 Filippine' | '✈️ Intercontinentali' | '🌍 Altro';

export default function TrasportiView() {
  const [transports, setTransports] = useState<Trasporto[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('tutti');
  const [activeCountryFilter, setActiveCountryFilter] = useState<CountryFilterType>('tutti');

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
      depositPaid: data.depositPaid,
      acconto: data.acconto,
      copilota: data.copilota,
      attachments: data.attachments || [],
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
    const typeMatch = (activeFilter === 'tutti') || 
                      (activeFilter === 'volo' && t.type === 'volo') ||
                      (activeFilter === 'traghetto' && t.type === 'traghetto') ||
                      (activeFilter === 'auto_camper' && (t.type === 'auto' || t.type === 'camper')) ||
                      (activeFilter === 'transfer' && t.type === 'transfer');
    
    const c = detectCountry(t);
    const countryMatch = (activeCountryFilter === 'tutti') || (activeCountryFilter === c);
    
    return typeMatch && countryMatch;
  });

  // Contatori
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

  const countryChips: { id: CountryFilterType; label: string }[] = [
    { id: 'tutti', label: 'Tutti i Paesi' },
    { id: '✈️ Intercontinentali', label: '✈️ Intercont.' },
    { id: '🇳🇿 Nuova Zelanda', label: '🇳🇿 NZ' },
    { id: '🇦🇺 Australia', label: '🇦🇺 AU' },
    { id: '🇵🇭 Filippine', label: '🇵🇭 PH' },
    { id: '🌍 Altro', label: '🌍 Altro' }
  ];

  // Raggruppamento macro-aree -> giorni
  const groupedByCountry = filteredTransports.reduce<Record<string, Record<string, Trasporto[]>>>((acc, transport) => {
    const country = detectCountry(transport);
    const dateKey = transport.date;
    if (!acc[country]) acc[country] = {};
    if (!acc[country][dateKey]) acc[country][dateKey] = [];
    acc[country][dateKey].push(transport);
    return acc;
  }, {});

  // Define macro order
  const macroOrder = ['✈️ Intercontinentali', '🇳🇿 Nuova Zelanda', '🇦🇺 Australia', '🇵🇭 Filippine', '🌍 Altro'];
  const sortedCountries = Object.keys(groupedByCountry).sort((a, b) => {
    const idxA = macroOrder.indexOf(a);
    const idxB = macroOrder.indexOf(b);
    return (idxA > -1 ? idxA : 99) - (idxB > -1 ? idxB : 99);
  });

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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Trasporti
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">
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
            className="inline-flex items-center gap-1 min-h-[36px] px-2.5 bg-white hover:bg-slate-50 active:scale-95 text-sky-700 font-semibold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer shadow-sm"
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

      {/* Chips Filter Horizontal Bar - Types */}
      {transports.length > 0 && (
        <div className="-mx-1 mb-2">
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
                      ? 'bg-sky-500 text-slate-900 border-sky-500 shadow-md shadow-sky-500/20'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <span>{chip.icon}</span>
                  <span>{chip.label}</span>
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
                      isActive ? 'bg-slate-900/10 text-slate-900 font-bold' : 'bg-slate-100 text-slate-600'
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

      {/* Chips Filter Horizontal Bar - Countries */}
      {transports.length > 0 && (
        <div className="-mx-1 mb-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 px-1 scrollbar-none snap-x">
            {countryChips.map((chip) => {
              const isActive = activeCountryFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveCountryFilter(chip.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all snap-start cursor-pointer border ${
                    isActive
                      ? 'bg-slate-800 text-white border-slate-800 shadow-md shadow-slate-800/20'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <span>{chip.label}</span>
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
        <div className="text-center py-10 px-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Nessuna tratta per la categoria/paese selezionata.</p>
          <button
            type="button"
            onClick={() => { setActiveFilter('tutti'); setActiveCountryFilter('tutti'); }}
            className="mt-3 text-xs font-semibold text-sky-600 hover:text-sky-700 cursor-pointer"
          >
            Mostra tutti i trasporti
          </button>
        </div>
      ) : (
        /* Elenco Raggruppato Paese -> Giorno */
        <div className="space-y-8">
          {sortedCountries.map((country) => {
            const countryGroup = groupedByCountry[country];
            const sortedDates = Object.keys(countryGroup).sort((a, b) => a.localeCompare(b));
            
            return (
              <div key={country} className="space-y-4">
                <div className="sticky top-0 z-10 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200">
                  <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    {country}
                  </h2>
                </div>
                
                <div className="space-y-6">
                  {sortedDates.map((dateKey) => {
                    const dayItems = countryGroup[dateKey];
                    return (
                      <div key={dateKey} className="space-y-3">
                        <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wider pl-1 flex items-center gap-2">
                          <span className="w-4 h-px bg-slate-300 rounded-full" />
                          {formatGroupDateHeader(dateKey)}
                          <span className="flex-1 h-px bg-slate-200/60 rounded-full" />
                        </h3>
                        <div className="grid gap-3">
                          {dayItems.map((t) => (
                            <TrasportoCard
                              key={t.id}
                              transport={t}
                              onEdit={() => handleOpenEdit(t)}
                              onDelete={() => setDeletingTransport(t)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODALS */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTransport ? 'Modifica Trasporto' : 'Nuovo Trasporto'}
      >
        <TrasportoForm
          initialData={editingTransport || undefined}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingTransport}
        title="Elimina Trasporto"
        message={`Sei sicuro di voler eliminare la tratta ${deletingTransport?.departureLocation} ➔ ${deletingTransport?.arrivalLocation}? L'azione è irreversibile.`}
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingTransport(null)}
        isDestructive
      />
    </section>
  );
}
