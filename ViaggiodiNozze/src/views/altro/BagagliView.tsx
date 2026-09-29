import { useState, useEffect, useCallback } from 'react';
import type { Bagaglio, Trasporto, TipoBagaglio, PasseggeroBagaglio } from '../../types';
import { storageService } from '../../storage/storageService';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { useDeviceRole } from '../../utils/useDeviceRole';

interface BagagliViewProps {
  onBack?: () => void;
}

interface BagaglioPreset {
  label: string;
  tipo: TipoBagaglio;
  pesoKg: number;
  descrizione: string;
}

const PRESETS: BagaglioPreset[] = [
  { label: '🧳 Stiva 23 kg', tipo: 'stiva', pesoKg: 23, descrizione: 'Bagaglio da Stiva (max 23 kg)' },
  { label: '🧳 Stiva 30 kg', tipo: 'stiva', pesoKg: 30, descrizione: 'Bagaglio da Stiva (max 30 kg)' },
  { label: '🎒 Mano 8 kg', tipo: 'mano', pesoKg: 8, descrizione: 'Trolley da Cabina / Mano (max 8 kg)' },
  { label: '🎒 Mano 10 kg', tipo: 'mano', pesoKg: 10, descrizione: 'Trolley da Cabina / Mano (max 10 kg)' },
  { label: '👜 Borsa / Zaino piccolo', tipo: 'borsa', pesoKg: 5, descrizione: 'Borsa Personale sotto il sedile' }
];

export default function BagagliView({ onBack }: BagagliViewProps) {
  const { canEdit } = useDeviceRole();
  const [bagagli, setBagagli] = useState<Bagaglio[]>([]);
  const [voloTransports, setVoloTransports] = useState<Trasporto[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBagaglio, setEditingBagaglio] = useState<Bagaglio | null>(null);

  // Form state
  const [voloId, setVoloId] = useState<string>('');
  const [tipo, setTipo] = useState<TipoBagaglio>('stiva');
  const [pesoKg, setPesoKg] = useState<number>(23);
  const [descrizione, setDescrizione] = useState<string>('Bagaglio da Stiva 23 kg');
  const [note, setNote] = useState<string>('');
  const [passeggero, setPasseggero] = useState<PasseggeroBagaglio>('entrambi');

  // Dialog eliminazione
  const [deleteTarget, setDeleteTarget] = useState<Bagaglio | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [items, allTransports] = await Promise.all([
        storageService.getBagagli(),
        storageService.getTransports()
      ]);

      // Filtra solo i trasferimenti di tipo volo
      const flights = allTransports.filter(t => t.type === 'volo');
      setVoloTransports(flights);

      // Se non ci sono bagagli ma ci sono voli, crea dei bagagli seed di default
      if (items.length === 0) {
        const seedItems: Bagaglio[] = [
          {
            id: 'bag_01',
            voloId: flights[0]?.id || '',
            voloTitle: flights[0] ? `✈️ ${flights[0].carrier || 'Volo Intercontinentale'} (${flights[0].departureLocation} ➔ ${flights[0].arrivalLocation})` : '✈️ Volo Intercontinentale',
            tipo: 'stiva',
            pesoKg: 23,
            descrizione: 'Valigia Grande Stiva (23 kg)',
            note: 'Franchigia Air China 2 colli inclusa. Etichetta bagaglio sposo.',
            passeggero: 'sposo',
            verificato: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
          },
          {
            id: 'bag_02',
            voloId: flights[0]?.id || '',
            voloTitle: flights[0] ? `✈️ ${flights[0].carrier || 'Volo Intercontinentale'} (${flights[0].departureLocation} ➔ ${flights[0].arrivalLocation})` : '✈️ Volo Intercontinentale',
            tipo: 'stiva',
            pesoKg: 23,
            descrizione: 'Valigia Grande Stiva (23 kg)',
            note: 'Etichetta bagaglio sposa con lucchetto TSA.',
            passeggero: 'sposa',
            verificato: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          },
          {
            id: 'bag_03',
            voloId: flights[0]?.id || '',
            voloTitle: flights[0] ? `✈️ ${flights[0].carrier || 'Volo Intercontinentale'} (${flights[0].departureLocation} ➔ ${flights[0].arrivalLocation})` : '✈️ Volo Intercontinentale',
            tipo: 'mano',
            pesoKg: 8,
            descrizione: 'Trolley Cabina Mano (8 kg)',
            note: 'Liquidi max 100ml in sacchetto trasparente 1L.',
            passeggero: 'entrambi',
            verificato: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ];
        for (const b of seedItems) {
          await storageService.saveBagaglio(b);
        }
        setBagagli(seedItems);
      } else {
        setBagagli(items);
      }
    } catch (err) {
      console.error('Errore caricamento bagagli:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleDataMutated = () => {
      loadData();
    };
    window.addEventListener('roadbook_data_mutated', handleDataMutated);
    return () => window.removeEventListener('roadbook_data_mutated', handleDataMutated);
  }, [loadData]);

  const handleOpenAdd = () => {
    setEditingBagaglio(null);
    setVoloId(voloTransports[0]?.id || '');
    setTipo('stiva');
    setPesoKg(23);
    setDescrizione('Bagaglio da Stiva 23 kg');
    setNote('');
    setPasseggero('entrambi');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: Bagaglio) => {
    setEditingBagaglio(b);
    setVoloId(b.voloId || voloTransports[0]?.id || '');
    setTipo(b.tipo);
    setPesoKg(b.pesoKg);
    setDescrizione(b.descrizione);
    setNote(b.note || '');
    setPasseggero(b.passeggero);
    setIsModalOpen(true);
  };

  const handleSelectPreset = (p: BagaglioPreset) => {
    setTipo(p.tipo);
    setPesoKg(p.pesoKg);
    setDescrizione(p.descrizione);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedFlight = voloTransports.find(v => v.id === voloId);
    const voloTitle = selectedFlight
      ? `✈️ ${selectedFlight.carrier || 'Volo'} (${selectedFlight.departureLocation} ➔ ${selectedFlight.arrivalLocation})`
      : '✈️ Volo Generico Generico';

    const itemToSave: Bagaglio = {
      id: editingBagaglio?.id || `bag_${Date.now()}`,
      voloId: voloId || undefined,
      voloTitle,
      tipo,
      pesoKg: Number(pesoKg) || 0,
      descrizione: descrizione.trim() || 'Bagaglio',
      note: note.trim() || undefined,
      passeggero,
      verificato: editingBagaglio?.verificato || false,
      createdAt: editingBagaglio?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    await storageService.saveBagaglio(itemToSave);
    setIsModalOpen(false);
    await loadData();
  };

  const handleToggleVerificato = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await storageService.toggleBagaglioVerificato(id);
    await loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await storageService.deleteBagaglio(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  };

  const getPasseggeroLabel = (p: PasseggeroBagaglio) => {
    if (p === 'sposo') return '🤵 Sposo';
    if (p === 'sposa') return '👰 Sposa';
    return '💍 Entrambi';
  };

  const getPasseggeroStyle = (p: PasseggeroBagaglio) => {
    if (p === 'sposo') return 'bg-sky-50 text-sky-800 border-sky-200';
    if (p === 'sposa') return 'bg-rose-50 text-rose-800 border-rose-200';
    return 'bg-purple-50 text-purple-800 border-purple-200';
  };

  const getTipoIcon = (t: TipoBagaglio) => {
    if (t === 'stiva') return '🧳';
    if (t === 'mano') return '🎒';
    return '👜';
  };

  return (
    <div className="space-y-4 pt-1 animate-fade-in pb-16">
      {/* HEADER */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="Torna ad Altro"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>🧳</span>
              <span>Lista Bagagli Voli</span>
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Gestione franchigia peso e verifica valigie per volo
            </p>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <span>+</span>
            <span>Aggiungi Bagaglio</span>
          </button>
        )}
      </div>

      {/* STATS RAPIDE FRANCHIGIA */}
      <div className="grid grid-cols-3 gap-2 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl p-3.5 shadow-sm">
        <div className="text-center">
          <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 block">Bagagli Totali</span>
          <span className="text-base font-extrabold text-white">{bagagli.length}</span>
        </div>
        <div className="text-center border-x border-white/10">
          <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 block">Stiva (Kg Tot)</span>
          <span className="text-base font-extrabold text-indigo-300">
            {bagagli.filter(b => b.tipo === 'stiva').reduce((acc, b) => acc + b.pesoKg, 0)} kg
          </span>
        </div>
        <div className="text-center">
          <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 block">Verificati</span>
          <span className="text-base font-extrabold text-emerald-400">
            {bagagli.filter(b => b.verificato).length} / {bagagli.length}
          </span>
        </div>
      </div>

      {/* LISTA CARD BAGAGLI STILE BOARDING / TAG AEREO */}
      {loading ? (
        <div className="p-8 text-center text-slate-400 text-xs font-medium">Caricamento bagagli in corso...</div>
      ) : bagagli.length === 0 ? (
        <EmptyState
          icon="🧳"
          title="Nessun bagaglio inserito"
          description="Aggiungi i tuoi bagagli per associarli ai voli e verificare la franchigia peso."
          actionLabel="+ Aggiungi Bagaglio"
          onAction={handleOpenAdd}
        />
      ) : (
        <div className="space-y-3">
          {bagagli.map((b) => (
            <div
              key={b.id}
              onClick={() => canEdit && handleOpenEdit(b)}
              className={`relative bg-white rounded-3xl p-4 border transition-all cursor-pointer shadow-xs hover:shadow-sm ${
                b.verificato ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200/90'
              }`}
            >
              {/* Header Card Bagaglio */}
              <div className="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-8 h-8 rounded-2xl bg-indigo-50 border border-indigo-100 text-slate-800 flex items-center justify-center text-base shrink-0">
                    {getTipoIcon(b.tipo)}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold text-slate-900 truncate leading-snug">
                      {b.descrizione}
                    </h3>
                    <p className="text-[11px] text-indigo-700 font-semibold truncate">
                      {b.voloTitle || '✈️ Volo associato'}
                    </p>
                  </div>
                </div>

                {/* Badge Peso In Evidenza */}
                <div className="shrink-0 flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white text-xs font-black font-mono shadow-2xs">
                    {b.pesoKg} KG
                  </span>

                  {/* Checkbox Spunta Verificato */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleVerificato(b.id, e)}
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs transition-all cursor-pointer border ${
                      b.verificato
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-400 border-slate-200'
                    }`}
                    title={b.verificato ? 'Bagaglio verificato/pronto' : 'Segna come verificato'}
                  >
                    ✓
                  </button>
                </div>
              </div>

              {/* Dettagli e Assegnazione Passeggero */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPasseggeroStyle(b.passeggero)}`}>
                    {getPasseggeroLabel(b.passeggero)}
                  </span>
                  {b.note && (
                    <span className="text-[11px] text-slate-500 font-medium truncate max-w-[200px]">
                      💬 {b.note}
                    </span>
                  )}
                </div>

                {canEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(b);
                    }}
                    className="text-[11px] text-rose-500 hover:text-rose-700 font-semibold cursor-pointer p-1"
                  >
                    Elimina
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODALE FORM BAGAGLIO */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingBagaglio ? 'Modifica Bagaglio Volo' : 'Aggiungi Bagaglio per Volo'}
        >
          <form onSubmit={handleSave} className="space-y-4">
            {/* 1. SELETTORE VOLO */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                1. Seleziona Volo dell'Itinerario
              </label>
              <select
                value={voloId}
                onChange={(e) => setVoloId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {voloTransports.length === 0 ? (
                  <option value="">✈️ Volo Generico Viaggio</option>
                ) : (
                  voloTransports.map(v => (
                    <option key={v.id} value={v.id}>
                      ✈️ {v.carrier || 'Volo'} ({v.departureLocation} ➔ {v.arrivalLocation}) • {v.date}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 2. PRESET RAPIDI PESO */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                2. Preset Rapidi Franchigia
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      pesoKg === p.pesoKg && tipo === p.tipo
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* CAMPI PERSONALIZZABILI PESO E DESCRIZIONE */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1 col-span-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Peso (Kg)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={pesoKg}
                  onChange={(e) => setPesoKg(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                />
              </div>

              <div className="space-y-1 col-span-2">
                <label className="text-xs font-bold text-slate-700 block">
                  Descrizione Bagaglio
                </label>
                <input
                  type="text"
                  value={descrizione}
                  onChange={(e) => setDescrizione(e.target.value)}
                  placeholder="es. Valigia Stiva 23 kg, Trolley Mano"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* 3. ASSEGNAZIONE PASSEGGERO */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                3. Assegnazione Passeggero
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['sposo', 'sposa', 'entrambi'] as PasseggeroBagaglio[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPasseggero(p)}
                    className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border text-center ${
                      passeggero === p
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {getPasseggeroLabel(p)}
                  </button>
                ))}
              </div>
            </div>

            {/* NOTE E RESTRITTIVI LIQUIDI */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Note / Contenuto / Restrizioni
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="es. Liquid limit 100ml, etichetta rossa TSA, abiti da trekking..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            {/* PULSANTI SALVA / ANNULLA */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all cursor-pointer active:scale-95"
              >
                Salva Bagaglio
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* CONFIRM DIALOG ELIMINAZIONE */}
      {deleteTarget && (
        <ConfirmDialog
          isOpen={!!deleteTarget}
          title="Elimina Bagaglio"
          message={`Sei sicuro di voler eliminare "${deleteTarget.descrizione}"?`}
          confirmLabel="Elimina"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
