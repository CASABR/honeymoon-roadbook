import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { BookingCategory } from '../../services/unifiedBookingService';
import { BOOKING_CATEGORY_META } from '../../services/unifiedBookingService';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { processFileForAttachment, formatFileSize } from '../../utils/fileAttachment';
import type { TransportAttachment, Attivita, Tappa, Alloggio, Ristorante, Trasporto } from '../../types';
import { formatDateIT } from '../../utils/tripDates';

interface UnifiedBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialCategory?: BookingCategory;
}

export interface RoadbookSuggestion {
  id: string;
  sourceType: 'attivita' | 'tappa' | 'alloggio' | 'ristorante' | 'trasporto';
  title: string;
  subtitle?: string;
  date?: string;
  time?: string;
  location?: string;
  cost?: string;
  notes?: string;
  categoryOrSubcategory?: string;
}

export default function UnifiedBookingModal({
  isOpen,
  onClose,
  onSaved,
  initialCategory = 'volo'
}: UnifiedBookingModalProps) {
  const [category, setCategory] = useState<BookingCategory>(initialCategory);

  // Campi Comuni
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [cost, setCost] = useState('');
  const [bookingCode, setBookingCode] = useState('');
  const [notes, setNotes] = useState('');
  const [noteCopilota, setNoteCopilota] = useState('');

  // Campi Specifici: Voli & Treni & Trasporti
  const [departureLocation, setDepartureLocation] = useState('');
  const [arrivalLocation, setArrivalLocation] = useState('');
  const [departureIata, setDepartureIata] = useState('');
  const [arrivalIata, setArrivalIata] = useState('');
  const [carrier, setCarrier] = useState('');
  const [posti, setPosti] = useState('');

  // Campi Specifici: Alloggi
  const [hotelAddress, setHotelAddress] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [sottocategoriaAlloggio, setSottocategoriaAlloggio] = useState<'Hotel' | 'B&B' | 'Appartamento' | 'Campeggio/Piazzola' | 'Altro'>('Hotel');

  // Campi Specifici: Attività / Tour
  const [attivitaProvider, setAttivitaProvider] = useState('');
  const [attivitaSottocategoria, setAttivitaSottocategoria] = useState<'Escursione' | 'Tour Guidato' | 'Museo' | 'Adrenalina' | 'Altro'>('Tour Guidato');

  // Campi Specifici: Ristorante
  const [ristoranteIndirizzo, setRistoranteIndirizzo] = useState('');
  const [ristorantePasto, setRistorantePasto] = useState<'Colazione' | 'Pranzo' | 'Cena' | 'Aperitivo' | 'Street Food' | 'Altro'>('Cena');

  // Allegati
  const [attachments, setAttachments] = useState<TransportAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [packageIncluded, setPackageIncluded] = useState(false);

  // Autocomplete elementi del viaggio attivo
  const [roadbookItems, setRoadbookItems] = useState<RoadbookSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteContainerRef = useRef<HTMLDivElement>(null);

  // Caricamento elementi del viaggio attivo per autocomplete
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchTripItems = async () => {
      try {
        const [acts, tps, accs, rists, trs] = await Promise.all([
          storageService.getActivities().catch(() => [] as Attivita[]),
          storageService.getTappe().catch(() => [] as Tappa[]),
          storageService.getAccommodations().catch(() => [] as Alloggio[]),
          storageService.getRistoranti ? storageService.getRistoranti().catch(() => [] as Ristorante[]) : Promise.resolve([] as Ristorante[]),
          storageService.getTransports().catch(() => [] as Trasporto[])
        ]);

        if (!isMounted) return;

        const suggestions: RoadbookSuggestion[] = [];

        // 1. Attività
        acts.forEach(a => {
          if (a.title) {
            suggestions.push({
              id: a.id,
              sourceType: 'attivita',
              title: a.title,
              subtitle: a.sottocategoria || a.category,
              date: a.date,
              time: a.time,
              location: a.location || a.address,
              cost: a.cost,
              notes: a.notes,
              categoryOrSubcategory: a.sottocategoria
            });
          }
        });

        // 2. Tappe Roadbook
        tps.forEach(t => {
          const tTitle = t.titolo;
          if (tTitle) {
            suggestions.push({
              id: t.id,
              sourceType: 'tappa',
              title: tTitle,
              subtitle: t.sottocategoria || 'Tappa Roadbook',
              date: t.data || t.date,
              time: t.orario || t.time,
              location: t.indirizzo || t.mapsUrl,
              notes: t.nota
            });
          }
        });

        // 3. Alloggi
        accs.forEach(h => {
          if (h.name) {
            suggestions.push({
              id: h.id,
              sourceType: 'alloggio',
              title: h.name,
              subtitle: h.sottocategoria || 'Struttura ricettiva',
              date: h.checkIn,
              location: h.location || h.address,
              cost: h.cost,
              notes: h.notes,
              categoryOrSubcategory: h.sottocategoria
            });
          }
        });

        // 4. Ristoranti
        rists.forEach(r => {
          if (r.nome) {
            suggestions.push({
              id: r.id,
              sourceType: 'ristorante',
              title: r.nome,
              subtitle: r.sottocategoria ? `Ristorante (${r.sottocategoria})` : 'Ristorante',
              date: r.data || r.date,
              time: r.orario,
              location: r.indirizzo,
              cost: r.budget,
              notes: r.nota,
              categoryOrSubcategory: r.sottocategoria
            });
          }
        });

        // 5. Trasporti
        trs.forEach(tr => {
          const trTitle = tr.carrier || `${tr.departureLocation} → ${tr.arrivalLocation}`;
          if (trTitle) {
            suggestions.push({
              id: tr.id,
              sourceType: 'trasporto',
              title: trTitle,
              subtitle: `${tr.departureLocation} → ${tr.arrivalLocation}`,
              date: tr.date,
              time: tr.departureTime,
              location: tr.departureLocation,
              cost: tr.cost,
              notes: tr.noteCopilota
            });
          }
        });

        // Deduplica per ID
        const seen = new Set<string>();
        const unique = suggestions.filter(s => {
          const key = `${s.sourceType}_${s.id}_${s.title}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setRoadbookItems(unique);
      } catch (err) {
        console.warn('[UnifiedBookingModal] Errore caricamento suggerimenti roadbook:', err);
      }
    };

    fetchTripItems();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Gestione click esterno per chiudere i suggerimenti
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (autocompleteContainerRef.current && !autocompleteContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtra i suggerimenti pertinenti
  const filteredSuggestions = useMemo(() => {
    if (!roadbookItems.length) return [];
    const q = title.trim().toLowerCase();

    return roadbookItems.filter(item => {
      let isCategoryMatch = false;
      if (category === 'attivita') {
        isCategoryMatch = item.sourceType === 'attivita' || item.sourceType === 'tappa';
      } else if (category === 'alloggio') {
        isCategoryMatch = item.sourceType === 'alloggio' || item.sourceType === 'tappa';
      } else if (category === 'ristorante') {
        isCategoryMatch = item.sourceType === 'ristorante' || item.sourceType === 'tappa';
      } else if (category === 'volo' || category === 'treno' || category === 'traghetto' || category === 'auto_camper') {
        isCategoryMatch = item.sourceType === 'trasporto' || item.sourceType === 'tappa';
      } else {
        isCategoryMatch = true;
      }

      if (!q) {
        return isCategoryMatch;
      }

      const matchText = `${item.title} ${item.subtitle || ''} ${item.location || ''}`.toLowerCase();
      return matchText.includes(q);
    }).slice(0, 7);
  }, [roadbookItems, title, category]);

  const handleSelectSuggestion = (s: RoadbookSuggestion) => {
    setTitle(s.title);

    // Precompila i campi compatibili preservando quelli già inseriti manualmente dall'utente
    if (!date && s.date) setDate(s.date);
    if (!time && s.time) setTime(s.time);
    if (!cost && s.cost) setCost(s.cost.replace('€', '').trim());

    if (s.location) {
      if (category === 'alloggio' && !hotelAddress) {
        setHotelAddress(s.location);
      } else if (category === 'ristorante' && !ristoranteIndirizzo) {
        setRistoranteIndirizzo(s.location);
      } else if ((category === 'volo' || category === 'treno' || category === 'traghetto' || category === 'auto_camper') && !departureLocation) {
        setDepartureLocation(s.location);
      }
    }

    if (s.notes && !notes) {
      setNotes(s.notes);
    }

    if (s.categoryOrSubcategory) {
      if (category === 'attivita' && ['Escursione', 'Tour Guidato', 'Museo', 'Adrenalina', 'Altro'].includes(s.categoryOrSubcategory)) {
        setAttivitaSottocategoria(s.categoryOrSubcategory as any);
      } else if (category === 'alloggio' && ['Hotel', 'B&B', 'Appartamento', 'Campeggio/Piazzola', 'Altro'].includes(s.categoryOrSubcategory)) {
        setSottocategoriaAlloggio(s.categoryOrSubcategory as any);
      } else if (category === 'ristorante' && ['Colazione', 'Pranzo', 'Cena', 'Aperitivo', 'Street Food', 'Altro'].includes(s.categoryOrSubcategory)) {
        setRistorantePasto(s.categoryOrSubcategory as any);
      }
    }

    setShowSuggestions(false);
  };

  // Reset campi quando si apre il modale
  useEffect(() => {
    if (isOpen) {
      setCategory(initialCategory);
      setTitle('');
      setDate('');
      setTime('');
      setCost('');
      setPackageIncluded(false);
      setBookingCode('');
      setNotes('');
      setNoteCopilota('');
      setDepartureLocation('');
      setArrivalLocation('');
      setDepartureIata('');
      setArrivalIata('');
      setCarrier('');
      setPosti('');
      setHotelAddress('');
      setCheckOutDate('');
      setCheckOutTime('');
      setAttachments([]);
      setFormError('');
      setUploadError('');
      setShowSuggestions(false);
    }
  }, [isOpen, initialCategory]);

  // Gestione tasto Escape per chiusura
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError('');
    setIsUploading(true);
    try {
      const added: TransportAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const processed = await processFileForAttachment(files[i]);
        added.push(processed);
      }
      setAttachments(prev => [...prev, ...added]);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'Errore elaborazione file');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      const now = Date.now();
      const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `item_${now}`;
      const formattedCost = cost.trim() ? (cost.includes('€') ? cost.trim() : `${cost.trim()} €`) : undefined;

      if (category === 'volo' || category === 'treno' || category === 'traghetto' || category === 'auto_camper') {
        let typeVal: 'volo' | 'treno' | 'traghetto' | 'auto' | 'camper' | 'transfer' = 'volo';
        if (category === 'treno') typeVal = 'treno';
        else if (category === 'traghetto') typeVal = 'traghetto';
        else if (category === 'auto_camper') typeVal = 'auto';

        const finalCost = packageIncluded ? 'Incluso nel pacchetto' : formattedCost;
        const transportPayload: any = {
          id: uniqueId,
          type: typeVal,
          date: date || new Date().toISOString().split('T')[0],
          departureTime: time || undefined,
          departureLocation: departureLocation.trim() || title.trim() || 'Partenza',
          arrivalLocation: arrivalLocation.trim() || 'Arrivo',
          departureIata: departureIata.trim().toUpperCase() || undefined,
          arrivalIata: arrivalIata.trim().toUpperCase() || undefined,
          carrier: carrier.trim() || title.trim() || undefined,
          bookingCode: bookingCode.trim() || undefined,
          cost: finalCost,
          packageIncluded: packageIncluded || undefined,
          posti: posti.trim() || undefined,
          noteCopilota: noteCopilota.trim() || undefined,
          status: packageIncluded ? 'completato' : 'prenotato',
          attachments,
          createdAt: now,
          updatedAt: now
        };

        await storageService.saveTransport(transportPayload);
        notifyDataChanged('trasporti', 'save', transportPayload);
        window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
          detail: { entityType: 'trasporti', action: 'save', data: transportPayload }
        }));
      } else if (category === 'alloggio') {
        if (!title.trim()) {
          setFormError('Inserisci il nome della struttura');
          setSaving(false);
          return;
        }

        const accommodationPayload: any = {
          id: uniqueId,
          name: title.trim(),
          sottocategoria: sottocategoriaAlloggio,
          location: hotelAddress.trim() || title.trim(),
          address: hotelAddress.trim(),
          checkIn: date || new Date().toISOString().split('T')[0],
          checkInTime: time || undefined,
          checkOut: checkOutDate || date || new Date().toISOString().split('T')[0],
          checkOutTime: checkOutTime || undefined,
          cost: formattedCost,
          bookingCode: bookingCode.trim() || undefined,
          notes: notes.trim() || undefined,
          noteCopilota: noteCopilota.trim() || undefined,
          status: 'prenotato',
          attachments,
          createdAt: now,
          updatedAt: now
        };

        await storageService.saveAccommodation(accommodationPayload);
        notifyDataChanged('alloggi', 'save', accommodationPayload);
        window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
          detail: { entityType: 'alloggi', action: 'save', data: accommodationPayload }
        }));
      } else if (category === 'attivita') {
        if (!title.trim()) {
          setFormError('Inserisci il titolo dell\'attività o tour');
          setSaving(false);
          return;
        }

        const activityPayload: any = {
          id: uniqueId,
          dayId: 'giorno_' + (date || '1'),
          date: date || new Date().toISOString().split('T')[0],
          endDate: checkOutDate || undefined,
          time: time || undefined,
          title: title.trim(),
          location: title.trim(),
          category: 'visita',
          sottocategoria: attivitaSottocategoria,
          platform: attivitaProvider.trim() || undefined,
          cost: formattedCost,
          qrCode: bookingCode.trim() || undefined,
          notes: notes.trim() || undefined,
          noteCopilota: noteCopilota.trim() || undefined,
          status: 'prenotato',
          attachments,
          createdAt: now,
          updatedAt: now
        };

        await storageService.saveActivity(activityPayload);
        notifyDataChanged('attivita', 'save', activityPayload);
        window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
          detail: { entityType: 'attivita', action: 'save', data: activityPayload }
        }));
      } else if (category === 'ristorante') {
        if (!title.trim()) {
          setFormError('Inserisci il nome del ristorante');
          setSaving(false);
          return;
        }

        const restaurantPayload: any = {
          id: uniqueId,
          nome: title.trim(),
          sottocategoria: ristorantePasto,
          data: date || new Date().toISOString().split('T')[0],
          orario: time || undefined,
          budget: formattedCost,
          indirizzo: ristoranteIndirizzo.trim() || undefined,
          nota: notes.trim() || undefined,
          noteCopilota: noteCopilota.trim() || undefined,
          status: 'prenotato',
          attachments,
          createdAt: now,
          updatedAt: now
        };

        await storageService.saveRistorante(restaurantPayload);
        notifyDataChanged('ristoranti', 'save', restaurantPayload);
        window.dispatchEvent(new CustomEvent('roadbook_data_mutated', {
          detail: { entityType: 'ristoranti', action: 'save', data: restaurantPayload }
        }));
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Errore salvataggio prenotazione:', err);
      setFormError(err.message || 'Si è verificato un errore durante il salvataggio.');
    } finally {
      setSaving(false);
    }
  };

  const currentMeta = BOOKING_CATEGORY_META[category];

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-[#FAF7F2] dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{currentMeta.icon}</span>
            <div>
              <h2 className="text-lg font-black text-[#172033] dark:text-white tracking-tight">
                Nuova Prenotazione
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Aggiungi al roadbook con supporto offline e sincronizzazione cloud
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Categorie Selector Tabs */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-200/60 dark:border-slate-800 overflow-x-auto no-scrollbar flex items-center gap-1.5 bg-white/40 dark:bg-slate-900/40">
          {(Object.keys(BOOKING_CATEGORY_META) as BookingCategory[]).map(catKey => {
            const meta = BOOKING_CATEGORY_META[catKey];
            const isSelected = category === catKey;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setCategory(catKey)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                  isSelected
                    ? 'bg-[#172033] text-white border-[#172033] dark:bg-white dark:text-[#172033] dark:border-white shadow-xs'
                    : 'bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-white'
                }`}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {formError && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold animate-fade-in flex items-center gap-2">
              <span>⚠️</span>
              <span>{formError}</span>
            </div>
          )}

          {/* Sezione 1: Titolo e Dati Principali */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-white dark:bg-slate-800/80 p-4.5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-2xs">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                {category === 'volo' || category === 'treno' || category === 'traghetto'
                  ? 'Compagnia / Nome Viaggio *'
                  : category === 'alloggio'
                  ? 'Nome Struttura / Hotel *'
                  : category === 'attivita'
                  ? 'Titolo Attività o Biglietto *'
                  : category === 'ristorante'
                  ? 'Nome Ristorante / Locale *'
                  : 'Titolo / Denominazione *'}
              </label>
              <div ref={autocompleteContainerRef} className="relative">
                <input
                  type="text"
                  required
                  value={title}
                  onFocus={() => setShowSuggestions(true)}
                  onChange={e => {
                    setTitle(e.target.value);
                    setShowSuggestions(true);
                  }}
                  placeholder={
                    category === 'volo'
                      ? 'Es. Volo Emirates EK98 / Air China CA950'
                      : category === 'alloggio'
                      ? 'Es. Hotel Grand Chancellor / Airbnb'
                      : category === 'attivita'
                      ? 'Es. Biglietto Hobbiton Movie Set Tour'
                      : category === 'ristorante'
                      ? 'Es. Ristorante / Trattoria tipica'
                      : 'Es. Nome prenotazione'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B5F]/40"
                />

                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-56 overflow-y-auto p-1.5 divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="px-3 py-1 flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      <span>Attività & tappe del viaggio ({filteredSuggestions.length})</span>
                      <button
                        type="button"
                        onClick={() => setShowSuggestions(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    {filteredSuggestions.map(item => (
                      <button
                        key={`${item.sourceType}_${item.id}`}
                        type="button"
                        onClick={() => handleSelectSuggestion(item)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-start justify-between gap-2 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">
                              {item.sourceType === 'attivita' ? '🎟️' : item.sourceType === 'tappa' ? '📍' : item.sourceType === 'alloggio' ? '🏨' : item.sourceType === 'ristorante' ? '🍽️' : '✈️'}
                            </span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                              {item.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">
                              {item.sourceType === 'attivita' ? 'Attività' : item.sourceType === 'tappa' ? 'Tappa' : item.sourceType === 'alloggio' ? 'Alloggio' : item.sourceType === 'ristorante' ? 'Ristorante' : 'Trasporto'}
                            </span>
                          </div>
                          {(item.location || item.subtitle) && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 pl-5">
                              {item.location || item.subtitle}
                            </div>
                          )}
                        </div>
                        {item.date && (
                          <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap pt-0.5">
                            {formatDateIT(item.date)}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Dettagli per Trasporti (Partenza / Arrivo) */}
            {(category === 'volo' || category === 'treno' || category === 'traghetto' || category === 'auto_camper') && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Luogo Partenza *
                  </label>
                  <input
                    type="text"
                    required
                    value={departureLocation}
                    onChange={e => setDepartureLocation(e.target.value)}
                    placeholder="Es. Roma FCO, Auckland, Stazione Centrale"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Luogo Arrivo *
                  </label>
                  <input
                    type="text"
                    required
                    value={arrivalLocation}
                    onChange={e => setArrivalLocation(e.target.value)}
                    placeholder="Es. Pechino PEK, Sydney, Rotorua"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                  />
                </div>
                {category === 'volo' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Codice IATA Partenza</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={departureIata}
                        onChange={e => setDepartureIata(e.target.value)}
                        placeholder="FCO"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 uppercase font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Codice IATA Arrivo</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={arrivalIata}
                        onChange={e => setArrivalIata(e.target.value)}
                        placeholder="PEK"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 uppercase font-mono"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Compagnia / Operatore</label>
                  <input
                    type="text"
                    value={carrier}
                    onChange={e => setCarrier(e.target.value)}
                    placeholder="Es. Emirates, Trenitalia, Hertz..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Posti / Dettagli</label>
                  <input
                    type="text"
                    value={posti}
                    onChange={e => setPosti(e.target.value)}
                    placeholder="Es. Posti 12A, 12B"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900"
                  />
                </div>
              </>
            )}

            {/* Dettagli per Alloggi */}
            {category === 'alloggio' && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Tipologia Struttura
                  </label>
                  <select
                    value={sottocategoriaAlloggio}
                    onChange={e => setSottocategoriaAlloggio(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                  >
                    <option value="Hotel">Hotel</option>
                    <option value="Appartamento">Appartamento / Airbnb</option>
                    <option value="B&B">Bed & Breakfast</option>
                    <option value="Campeggio/Piazzola">Campeggio / Camper</option>
                    <option value="Altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Indirizzo o Città
                  </label>
                  <input
                    type="text"
                    value={hotelAddress}
                    onChange={e => setHotelAddress(e.target.value)}
                    placeholder="Es. 129 Hobson St, Auckland"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-semibold"
                  />
                </div>
              </>
            )}

            {/* Dettagli per Attività */}
            {category === 'attivita' && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Tipologia Attività
                  </label>
                  <select
                    value={attivitaSottocategoria}
                    onChange={e => setAttivitaSottocategoria(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-semibold"
                  >
                    <option value="Tour Guidato">Tour Guidato</option>
                    <option value="Escursione">Escursione / Trekking</option>
                    <option value="Museo">Museo / Attrazione</option>
                    <option value="Adrenalina">Adrenalina / Sport</option>
                    <option value="Altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Fornitore / Piattaforma
                  </label>
                  <input
                    type="text"
                    value={attivitaProvider}
                    onChange={e => setAttivitaProvider(e.target.value)}
                    placeholder="Es. GetYourGuide, Headout, Diretto"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-semibold"
                  />
                </div>
              </>
            )}

            {/* Dettagli per Ristoranti */}
            {category === 'ristorante' && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Pasto
                  </label>
                  <select
                    value={ristorantePasto}
                    onChange={e => setRistorantePasto(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-semibold"
                  >
                    <option value="Cena">Cena</option>
                    <option value="Pranzo">Pranzo</option>
                    <option value="Colazione">Colazione</option>
                    <option value="Aperitivo">Aperitivo</option>
                    <option value="Street Food">Street Food</option>
                    <option value="Altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Indirizzo o Quartiere
                  </label>
                  <input
                    type="text"
                    value={ristoranteIndirizzo}
                    onChange={e => setRistoranteIndirizzo(e.target.value)}
                    placeholder="Es. Navigli, Milano / Waterfront, Sydney"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-semibold"
                  />
                </div>
              </>
            )}

            {/* Date e Orari */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                {category === 'alloggio' ? 'Data Check-in *' : 'Data Inizio / Partenza *'}
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                {category === 'alloggio' ? 'Orario Check-in' : 'Orario'}
              </label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-semibold"
              />
            </div>

            {/* Fine per Alloggio, Noleggio o Attività */}
            {(category === 'alloggio' || category === 'auto_camper' || category === 'attivita') && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                    {category === 'alloggio' ? 'Data Check-out' : category === 'auto_camper' ? 'Data Riconsegna' : 'Data Termine (Opzionale)'}
                  </label>
                  <input
                    type="date"
                    value={checkOutDate}
                    onChange={e => setCheckOutDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-semibold"
                  />
                </div>
                {category !== 'attivita' && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      {category === 'alloggio' ? 'Orario Check-out' : 'Orario Riconsegna'}
                    </label>
                    <input
                      type="time"
                      value={checkOutTime}
                      onChange={e => setCheckOutTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-semibold"
                    />
                  </div>
                )}
              </>
            )}

            {/* Costo e Codice Prenotazione */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                Codice Prenotazione / PNR
              </label>
              <input
                type="text"
                value={bookingCode}
                onChange={e => setBookingCode(e.target.value)}
                placeholder="Es. W8QZ7Y, BK-904812"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-mono font-bold"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Costo Totale (€)
                </label>
                {(category === 'volo' || category === 'treno' || category === 'traghetto' || category === 'auto_camper') && (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-sky-600 dark:text-sky-400">
                    <input
                      type="checkbox"
                      checked={packageIncluded}
                      onChange={e => {
                        const checked = e.target.checked;
                        setPackageIncluded(checked);
                        if (checked) setCost('Incluso');
                        else setCost('');
                      }}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                    />
                    <span>Incluso nel pacchetto</span>
                  </label>
                )}
              </div>
              <input
                type="text"
                disabled={packageIncluded}
                value={packageIncluded ? 'Incluso nel pacchetto' : cost}
                onChange={e => setCost(e.target.value)}
                placeholder="Es. 150.00"
                className={`w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-semibold ${packageIncluded ? 'opacity-60 bg-slate-100 cursor-not-allowed' : ''}`}
              />
            </div>
          </div>

          {/* Sezione 2: Documenti e File Allegati */}
          <div className="bg-white dark:bg-slate-800/80 p-4.5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-[#172033] dark:text-white text-xs">
                  📎 Voucher &amp; Documenti Collegati
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Salvati offline nel browser e sincronizzati con il Cloud
                </p>
              </div>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-[#172033] dark:text-white font-bold text-[11px] cursor-pointer transition-colors">
                <span>+ Allega File</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </div>

            {uploadError && (
              <p className="text-rose-600 text-[11px] font-bold">{uploadError}</p>
            )}

            {isUploading && (
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px] font-semibold">Compressione e salvataggio file...</span>
              </div>
            )}

            {attachments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {attachments.map(att => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{att.type === 'pdf' ? '📄' : '🖼️'}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">{att.name}</p>
                        <p className="text-[9px] text-slate-400">{formatFileSize(att.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-rose-600 hover:text-rose-700 text-xs font-bold p-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                <span className="text-slate-400 text-[11px]">Nessun file o biglietto allegato. Puoi aggiungerlo ora o in seguito.</span>
              </div>
            )}
          </div>

          {/* Sezione 3: Note e Copilota */}
          <div className="bg-white dark:bg-slate-800/80 p-4.5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-2xs space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                Note Generali
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Istruzioni check-in, cancellazione, franchigia noleggio..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 font-medium"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <span>🤫</span>
                <span>Note Riservate Copilota / Guida</span>
              </label>
              <textarea
                rows={2}
                value={noteCopilota}
                onChange={e => setNoteCopilota(e.target.value)}
                placeholder="Sorprese, suggerimenti segreti o dettagli per il partner..."
                className="w-full px-3 py-2 rounded-xl border border-amber-200/70 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/20 text-slate-900 dark:text-white font-medium"
              />
            </div>
          </div>

          {/* Footer Bottoni */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer text-xs"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl font-bold bg-[#FF6B5F] hover:bg-[#ff5547] text-white shadow-md shadow-[#FF6B5F]/20 active:scale-95 transition-all cursor-pointer text-xs disabled:opacity-50"
            >
              {saving ? 'Salvataggio in corso...' : 'Salva Prenotazione'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
