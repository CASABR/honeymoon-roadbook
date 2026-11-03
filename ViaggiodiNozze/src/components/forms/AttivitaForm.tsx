import React, { useState, useEffect, useRef } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { getCoordinatesFromAddress, extractMapsUrlFromText, isGoogleMapsUrl } from '../../utils/mapsHelper';
import { storageService } from '../../storage/storageService';
import type { Attivita, TransportAttachment, Coordinate, TipologiaPercorsoTrekking, FasciaLuceFotografica, Tappa, OpeningHoursInfo, TimeStatus } from '../../types';
import { processFileForAttachment, formatFileSize, openAttachmentInNewTab, checkStorageAvailability, isSupportedImageFile } from '../../utils/fileAttachment';
import PlaceAutocompleteInput from '../common/PlaceAutocompleteInput';
import DropZone from '../common/DropZone';
import type { PlaceSuggestion } from '../../services/photonService';
import { isPhotoSpotActivity, isTrekkingActivity, isPasseggiataActivity, PHOTO_LIGHT_LABELS, TREKKING_ROUTE_LABELS } from '../../utils/activityType';
import TimeZoneInput from '../common/TimeZoneInput';
import TappaForm from './TappaForm';
import TimePickerInput from '../common/TimePickerInput';
import OpeningHoursFields from '../common/OpeningHoursFields';

interface AttivitaFormProps {
  days?: any[];
  selectedDayId?: string;
  defaultTime?: string;
  initialData?: Attivita | null;
  onSave: (data: Omit<Attivita, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function LegacyPhotoStopForm({ initialData, defaultTime, onSave, onCancel, onDelete }: AttivitaFormProps) {
  const activity = initialData as Attivita;
  const legacyTappa: Tappa = {
    id: activity.id,
    titolo: activity.title,
    sottocategoria: 'Sosta fotografica',
    data: activity.date,
    date: activity.date,
    dayId: activity.dayId,
    orario: activity.time || activity.orarioInizio || activity.orarioRitrovo,
    time: activity.time || activity.orarioInizio || activity.orarioRitrovo,
    coordinate: activity.coordinate,
    indirizzo: activity.address || activity.location,
    mapsUrl: activity.link || activity.address || activity.location,
    nota: activity.notes,
    noteCopilota: activity.noteCopilota,
    copilota: activity.copilota,
    completed: activity.completed,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        Sosta fotografica legacy: viene modificata con il formato Tappa senza duplicare o migrare il record.
      </div>
      <TappaForm
        initialData={legacyTappa}
        defaultTime={defaultTime}
        onCancel={onCancel}
        onDelete={onDelete}
        onSave={(tappa) => onSave({
          ...activity,
          id: activity.id,
          dayId: tappa.dayId || activity.dayId,
          date: tappa.data || tappa.date || activity.date,
          title: tappa.titolo,
          time: tappa.orario || tappa.time,
          orarioInizio: tappa.orario || tappa.time,
          orarioRitrovo: tappa.orario || tappa.time,
          location: tappa.indirizzo || tappa.mapsUrl || tappa.titolo,
          address: tappa.indirizzo,
          coordinate: tappa.coordinate,
          notes: tappa.nota,
          noteCopilota: tappa.noteCopilota,
          copilota: tappa.copilota,
          completed: tappa.completed,
          sottocategoria: 'Spot fotografico',
          category: activity.category || 'natura',
          status: activity.status || 'da_valutare'
        })}
      />
    </div>
  );
}

export default function AttivitaForm(props: AttivitaFormProps) {
  if (props.initialData && isPhotoSpotActivity(props.initialData)) {
    return <LegacyPhotoStopForm {...props} />;
  }
  return <StandardAttivitaForm {...props} />;
}

function StandardAttivitaForm({ selectedDayId, defaultTime, initialData, onSave, onCancel, onDelete }: AttivitaFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);

  const SOTTOCATEGORIE: Attivita['sottocategoria'][] = ['Passeggiata', 'Trekking', 'Tour Guidato', 'Museo', 'Adrenalina', 'Altro'];

  const [sottocategoria, setSottocategoria] = useState<Attivita['sottocategoria'] | ''>('');
  const [title, setTitle] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [orarioRitrovo, setOrarioRitrovo] = useState('');
  const [orarioInizio, setOrarioInizio] = useState('');
  const [timeStatus, setTimeStatus] = useState<TimeStatus>(initialData?.timeStatus || 'confermato');
  const [timeZone, setTimeZone] = useState('');
  const [duration, setDuration] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [elevationGainM, setElevationGainM] = useState('');
  const [hikingHours, setHikingHours] = useState('');
  const [hikingMinutes, setHikingMinutes] = useState('');
  const [routeType, setRouteType] = useState<TipologiaPercorsoTrekking | ''>('');
  const [currency, setCurrency] = useState('EUR');
  const [difficulty, setDifficulty] = useState('');
  const [lightWindow, setLightWindow] = useState<FasciaLuceFotografica>('qualsiasi');
  const [photoSubject, setPhotoSubject] = useState('');
  const [address, setAddress] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [originLocation, setOriginLocation] = useState('');
  const [destinationLocation, setDestinationLocation] = useState('');
  const [isRoute, setIsRoute] = useState(false);
  const [childTappe, setChildTappe] = useState<Tappa[]>([]);
  const [availableTappeForDay, setAvailableTappeForDay] = useState<Tappa[]>([]);
  const [selectedTappaToLink, setSelectedTappaToLink] = useState('');
  const [coordinate, setCoordinate] = useState<Coordinate | undefined>(() => initialData?.coordinate);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  
  const [cost, setCost] = useState('');
  const [acconto, setAcconto] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'saldato' | 'da_saldare'>('saldato');
  const [link, setLink] = useState(''); 
  const [qrCode, setQrCode] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Attivita['status']>('prenotato');
  const [openingHours, setOpeningHours] = useState<OpeningHoursInfo | undefined>(() => initialData?.openingHours);

  // Gestione Allegati (PDF / QR Code / Immagini)
  const [attachments, setAttachments] = useState<TransportAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    checkStorageAvailability().then(res => {
      if (res.isLowSpace && res.message) {
        setStorageWarning(res.message);
      }
    }).catch(() => {});
  }, []);

  const [error, setError] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const initializedIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const currentId = initialData?.id || '__new__';
    if (initializedIdRef.current === currentId) {
      return;
    }
    initializedIdRef.current = currentId;

    if (initialData) {
      const mappedSub = initialData.sottocategoria === 'Escursione' ? 'Trekking' : (initialData.sottocategoria || '');
      setSottocategoria(mappedSub);
      setTitle(initialData.title);
      const dateVal = initialData.date || (initialData.dayId.startsWith('day_') ? initialData.dayId.replace('day_', '') : '');
      setCustomDate(dateVal);
      setOrarioRitrovo(initialData.orarioRitrovo || '');
      setOrarioInizio(initialData.orarioInizio || initialData.time || '');
      setTimeStatus(initialData.timeStatus || 'confermato');
      setTimeZone(initialData.timeZone || '');
      setDuration(initialData.duration || '');
      setDistanceKm(initialData.distanceKm?.toString() || '');
      setElevationGainM(initialData.elevationGainM?.toString() || '');
      const walkingMinutes = initialData.hikingDurationMinutes || 0;
      setHikingHours(walkingMinutes ? Math.floor(walkingMinutes / 60).toString() : '');
      setHikingMinutes(walkingMinutes ? (walkingMinutes % 60).toString() : '');
      setRouteType(initialData.routeType || '');
      setCurrency(initialData.currency || 'EUR');
      setDifficulty(initialData.difficulty || '');
      setLightWindow(initialData.lightWindow || 'qualsiasi');
      setPhotoSubject(initialData.photoSubject || '');
      setAddress(initialData.address || initialData.location || '');
      setGoogleMapsUrl(initialData.googleMapsUrl || (isGoogleMapsUrl(initialData.link) ? (initialData.link || '') : ''));
      setOriginLocation(initialData.originLocation || '');
      setDestinationLocation(initialData.destinationLocation || '');
      setIsRoute(Boolean(initialData.isRoute));
      setCoordinate(initialData.coordinate);
      setLatitude(initialData.coordinate?.lat?.toString() || '');
      setLongitude(initialData.coordinate?.lng?.toString() || '');
      
      setCost(initialData.cost || '');
      setAcconto(initialData.acconto || '');
      setPaymentStatus(initialData.paymentStatus || 'saldato');
      setLink(initialData.link || '');
      setQrCode(initialData.qrCode || '');
      setNotes(initialData.notes || '');
      setStatus(initialData.status || 'prenotato');
      setOpeningHours(initialData.openingHours);
      setAttachments(initialData.attachments || []);

      if (initialData.id) {
        storageService.getTappe().then(allTappe => {
          setChildTappe(allTappe.filter(t => t.passeggiataId === initialData.id));
          setAvailableTappeForDay(allTappe.filter(t => (t.data === dateVal || t.date === dateVal) && (!t.passeggiataId || t.passeggiataId === initialData.id)));
        }).catch(() => {});
      }
    } else {
      if (selectedDayId && selectedDayId.startsWith('day_')) {
        setCustomDate(selectedDayId.replace('day_', ''));
      } else if (selectedDayId && selectedDayId !== 'tutte') {
        setCustomDate(selectedDayId);
      } else {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setCustomDate(`${yyyy}-${mm}-${dd}`);
      }
      setEndDate('');
      setSottocategoria('');
      setTitle('');
      setOrarioRitrovo('');
      setOrarioInizio(defaultTime || '');
      setTimeStatus('confermato');
      setTimeZone('');
      setDuration('');
      setDistanceKm('');
      setElevationGainM('');
      setHikingHours('');
      setHikingMinutes('');
      setRouteType('');
      setCurrency('EUR');
      setDifficulty('');
      setLightWindow('qualsiasi');
      setPhotoSubject('');
      setAddress('');
      setGoogleMapsUrl('');
      setOriginLocation('');
      setDestinationLocation('');
      setIsRoute(false);
      setChildTappe([]);
      setAvailableTappeForDay([]);
      setCoordinate(undefined);
      setLatitude('');
      setLongitude('');
      setCost('');
      setAcconto('');
      setPaymentStatus('da_saldare');
      setLink('');
      setQrCode('');
      setNotes('');
      setStatus('prenotato');
      setOpeningHours(undefined);
      setAttachments([]);
    }
  }, [defaultTime, initialData, selectedDayId]);



  const handleFilesBatch = async (filesArray: File[], purpose?: TransportAttachment['purpose']) => {
    if (!filesArray || filesArray.length === 0) return;

    setAttachmentError('');
    setIsUploadingAttachment(true);

    try {
      const newAttachments: TransportAttachment[] = [...attachments];

      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        const processed = await processFileForAttachment(file);
        newAttachments.push(purpose ? { ...processed, purpose } : processed);
      }

      setAttachments(newAttachments);
    } catch (err: unknown) {
      console.error('Errore durante il caricamento del file:', err);
      const msg = err instanceof Error ? err.message : 'Errore durante il caricamento del file.';
      setAttachmentError(msg);
    } finally {
      setIsUploadingAttachment(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePhotoFilesBatch = async (filesArray: File[]) => {
    await handleFilesBatch(filesArray.filter(isSupportedImageFile), 'photo');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await handleFilesBatch(Array.from(files));
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleSelectPlace = (place: PlaceSuggestion) => {
    setTitle(place.title);
    if (place.address) {
      setAddress(place.address);
    }
    if (place.coordinate) {
      setCoordinate(place.coordinate);
      setLatitude(place.coordinate.lat.toString());
      setLongitude(place.coordinate.lng.toString());
    }
    if (place.rawLocalItem) {
      const raw = place.rawLocalItem;
      if (raw.notes && !notes) setNotes(raw.notes);
      if (raw.sottocategoria && !sottocategoria) setSottocategoria(raw.sottocategoria);
      if (raw.time && !orarioInizio) setOrarioInizio(raw.time);
      if (raw.cost && !cost) setCost(raw.cost);
    }
  };

  const handleOpenPdf = (dataUrl: string, fileName: string) => {
    openAttachmentInNewTab(dataUrl, fileName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const photoSpot = isPhotoSpot;
    if (!customDate || !title.trim() || (photoSpot && (!address.trim() || !photoSubject.trim()))) {
      setError(photoSpot ? 'Titolo, luogo, data e soggetto sono obbligatori.' : 'Titolo e data sono obbligatori.');
      return;
    }

    const hasManualCoordinates = latitude.trim() !== '' || longitude.trim() !== '';
    const parsedLatitude = Number(latitude.replace(',', '.'));
    const parsedLongitude = Number(longitude.replace(',', '.'));
    if (photoSpot && hasManualCoordinates && (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude) || parsedLatitude < -90 || parsedLatitude > 90 || parsedLongitude < -180 || parsedLongitude > 180)) {
      setError('Inserisci coordinate valide oppure lascia entrambi i campi vuoti.');
      return;
    }

    setError('');

    setIsGeocoding(true);
    let finalCoord = initialData?.coordinate;

    if (address && address.trim()) {
      try {
        const coord = await getCoordinatesFromAddress(address);
        if (coord) finalCoord = coord;
      } catch {}
    }

    setIsGeocoding(false);

    const manualCoordinate = photoSpot && hasManualCoordinates
      ? { lat: parsedLatitude, lng: parsedLongitude }
      : undefined;
    const finalCoordToSave = manualCoordinate || coordinate || finalCoord;

    const parsedDistance = distanceKm ? Number(distanceKm.replace(',', '.')) : undefined;
    const parsedElevation = elevationGainM ? Number(elevationGainM) : undefined;
    const totalHikingMinutes = (Number(hikingHours) || 0) * 60 + (Number(hikingMinutes) || 0);
    const trekking = isTrekking;

    const effectiveTime = (orarioInizio || orarioRitrovo || initialData?.time || '').trim() || undefined;
    const finalRitrovo = (orarioRitrovo || orarioInizio || '').trim() || undefined;
    const finalInizio = (orarioInizio || orarioRitrovo || '').trim() || undefined;

    onSave({
      id: initialData?.id,
      dayId: `day_${customDate}`,
      date: customDate,
      endDate: endDate.trim() || undefined,
      title: title.trim(),
      sottocategoria: trekking ? 'Trekking' : (photoSpot ? 'Spot fotografico' : (isPasseggiata ? 'Passeggiata' : (sottocategoria || undefined))),
      category: trekking || photoSpot || isPasseggiata ? 'natura' : (initialData?.category || 'visita'),
      orarioRitrovo: finalRitrovo,
      time: effectiveTime, // primary timeline time
      timeStatus: effectiveTime ? timeStatus : undefined,
      orarioInizio: finalInizio,
      timeZone: timeZone.trim() || undefined,
      duration: duration || undefined,
      distanceKm: trekking && parsedDistance && parsedDistance > 0 ? parsedDistance : initialData?.distanceKm,
      elevationGainM: trekking && parsedElevation && parsedElevation > 0 ? parsedElevation : initialData?.elevationGainM,
      hikingDurationMinutes: trekking && totalHikingMinutes > 0 ? totalHikingMinutes : initialData?.hikingDurationMinutes,
      routeType: trekking && routeType ? routeType : initialData?.routeType,
      routePreview: trekking ? initialData?.routePreview : undefined,
      currency: trekking && cost.trim() ? currency : initialData?.currency,
      difficulty: trekking && difficulty.trim() ? difficulty.trim() : initialData?.difficulty,
      lightWindow: photoSpot ? lightWindow : initialData?.lightWindow,
      photoSubject: photoSpot && photoSubject.trim() ? photoSubject.trim() : initialData?.photoSubject,
      address: address.trim() || undefined,
      googleMapsUrl: googleMapsUrl.trim() || undefined,
      originLocation: isRoute ? (originLocation.trim() || undefined) : undefined,
      destinationLocation: isRoute ? (destinationLocation.trim() || undefined) : undefined,
      isRoute: Boolean(isRoute),
      location: address.trim() || title.trim(),
      coordinate: finalCoordToSave,
      cost: cost.trim() || undefined,
      acconto: acconto.trim() || undefined,
      paymentStatus,
      link: link.trim() || undefined,
      qrCode: qrCode.trim() || undefined,
      notes: notes.trim() || undefined,
      status: paymentStatus === 'saldato' ? 'prenotato' : status,
      attachments: attachments.length > 0 ? attachments : undefined,
      copilota: initialData?.copilota,
      noteCopilota: initialData?.noteCopilota,
      platform: initialData?.platform,
      openingHours
    });
  };

  const calculateSaldo = () => {
    const c = parseFloat(cost.replace(',', '.')) || 0;
    const a = parseFloat(acconto.replace(',', '.')) || 0;
    return c - a;
  };
  const saldo = calculateSaldo();
  const isTrekking = sottocategoria
    ? sottocategoria === 'Trekking'
    : Boolean(initialData && isTrekkingActivity(initialData));
  const isPhotoSpot = sottocategoria
    ? sottocategoria === 'Spot fotografico'
    : Boolean(initialData && isPhotoSpotActivity(initialData));
  const isPasseggiata = sottocategoria
    ? sottocategoria === 'Passeggiata'
    : Boolean(initialData && isPasseggiataActivity(initialData));

  const handleUnlinkChild = async (tappaId: string) => {
    await storageService.updateTappa(tappaId, { passeggiataId: undefined });
    setChildTappe(prev => prev.filter(t => t.id !== tappaId));
    window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'tappa', entityId: tappaId } }));
  };

  const handleLinkChild = async (tappaId: string) => {
    if (!initialData?.id || !tappaId) return;
    await storageService.updateTappa(tappaId, { passeggiataId: initialData.id });
    const allTappe = await storageService.getTappe();
    setChildTappe(allTappe.filter(t => t.passeggiataId === initialData.id));
    setSelectedTappaToLink('');
    window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'tappa', entityId: tappaId } }));
  };

  const photoAttachments = attachments.filter((attachment) => attachment.type === 'image' && attachment.purpose === 'photo');

  const renderPhotoField = (titleText: string, subtitleText: string) => (
    <div className="space-y-3">
      <div>
        <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">Foto</span>
        <DropZone
          variant={photoAttachments.length > 0 ? 'compact' : 'hero'}
          accept="image/*"
          multiple
          onFilesSelected={handlePhotoFilesBatch}
          isUploading={isUploadingAttachment}
          title={titleText}
          subtitle={subtitleText}
        />
      </div>
      {photoAttachments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photoAttachments.map((attachment) => (
            <div key={attachment.id} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <img src={attachment.dataUrl} alt={attachment.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemoveAttachment(attachment.id)}
                className="absolute right-1.5 top-1.5 h-7 w-7 rounded-full bg-slate-950/75 text-xs font-bold text-white backdrop-blur-sm"
                aria-label={`Rimuovi ${attachment.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-4">
      {isLockedByOther && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl font-bold flex gap-2 items-center animate-fade-in">
          <span className="text-base animate-pulse">⚠️</span>
          <span>Attenzione: il dispositivo "{lockedBy}" sta modificando questo elemento. Le modifiche potrebbero sovrascriversi.</span>
        </div>
      )}

      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          {error}
        </div>
      )}
      


      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Sottocategoria
        </label>
        <div className="flex flex-wrap gap-2">
          {SOTTOCATEGORIE.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSottocategoria(cat === sottocategoria ? '' : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                cat === sottocategoria
                  ? 'bg-[#FF6B5F] text-white border-[#FF6B5F]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <PlaceAutocompleteInput
        value={title}
        onChange={setTitle}
        onSelectPlace={handleSelectPlace}
        label={isTrekking ? 'Titolo del trekking' : isPhotoSpot ? 'Titolo dello spot' : 'Titolo Attività'}
        placeholder={isTrekking ? 'es. Tongariro Alpine Crossing' : isPhotoSpot ? 'es. Belvedere sul lago' : 'es. Safari in Jeep, Hobbiton...'}
        required
      />

      {isTrekking && (
        <div className="hounigo-panel rounded-2xl p-4 space-y-4 dark:bg-slate-800 dark:border-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
              <span className="block uppercase tracking-wider mb-1.5">Data *</span>
              <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} required className="w-full h-11 px-3 hounigo-card-subtle rounded-xl text-sm" />
            </label>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">Ora di partenza</span>
                {orarioInizio && (
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setTimeStatus('confermato')}
                      className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${timeStatus === 'confermato' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                    >✓ Confermato</button>
                    <button
                      type="button"
                      onClick={() => setTimeStatus('indicativo')}
                      className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${timeStatus === 'indicativo' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                    >~ Indicativo</button>
                  </div>
                )}
              </div>
              <TimePickerInput value={orarioInizio} onChange={setOrarioInizio} ariaLabel="Ora di partenza trekking" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300"><span className="block mb-1">Distanza km</span><input type="number" min="0" step="0.1" inputMode="decimal" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="19,4" className="w-full h-10 px-3 hounigo-card-subtle rounded-xl text-sm" /></label>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300"><span className="block mb-1">Dislivello + m</span><input type="number" min="0" step="1" inputMode="numeric" value={elevationGainM} onChange={(e) => setElevationGainM(e.target.value)} placeholder="765" className="w-full h-10 px-3 hounigo-card-subtle rounded-xl text-sm" /></label>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300"><span className="block mb-1">Cammino ore</span><input type="number" min="0" step="1" inputMode="numeric" value={hikingHours} onChange={(e) => setHikingHours(e.target.value)} placeholder="7" className="w-full h-10 px-3 hounigo-card-subtle rounded-xl text-sm" /></label>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300"><span className="block mb-1">Minuti</span><input type="number" min="0" max="59" step="1" inputMode="numeric" value={hikingMinutes} onChange={(e) => setHikingMinutes(e.target.value)} placeholder="30" className="w-full h-10 px-3 hounigo-card-subtle rounded-xl text-sm" /></label>
          </div>
          <div>
            <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">Tipologia percorso</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.entries(TREKKING_ROUTE_LABELS) as [TipologiaPercorsoTrekking, string][]).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setRouteType(routeType === value ? '' : value)} className={`min-h-10 px-3 rounded-xl border text-xs font-semibold ${routeType === value ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'hounigo-card-subtle text-slate-700 dark:text-slate-200'}`}>{label}</button>
              ))}
            </div>
          </div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200"><span className="block uppercase tracking-wider mb-1.5">Punto di partenza</span><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Parcheggio, trailhead o indirizzo" className="w-full h-11 px-3 hounigo-card-subtle rounded-xl text-sm" /></label>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300"><span className="block mb-1">Prezzo</span><input type="number" min="0" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Facoltativo" className="w-full h-10 px-3 hounigo-card-subtle rounded-xl text-sm" /></label>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300"><span className="block mb-1">Valuta</span><input type="text" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="w-full h-10 px-3 hounigo-card-subtle rounded-xl text-sm uppercase" /></label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300"><span className="block mb-1">Link percorso o traccia</span><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className="w-full h-10 px-3 hounigo-card-subtle rounded-xl text-sm" /></label>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300"><span className="block mb-1">Difficoltà</span><input type="text" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} placeholder="Facile, media, impegnativa…" className="w-full h-10 px-3 hounigo-card-subtle rounded-xl text-sm" /></label>
          </div>
          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300"><span className="block mb-1">Note</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Indicazioni utili, attrezzatura, meteo…" className="w-full p-3 hounigo-card-subtle rounded-xl text-sm resize-none" /></label>
          {renderPhotoField('Foto facoltativa', 'Resta negli allegati e non sostituisce una traccia GPS del percorso.')}
        </div>
      )}

      {isPhotoSpot && (
        <div className="hounigo-panel rounded-2xl p-4 space-y-4 dark:bg-slate-800 dark:border-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
              <span className="block uppercase tracking-wider mb-1.5">Data *</span>
              <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} required className="w-full h-11 px-3 hounigo-card-subtle rounded-xl text-sm" />
            </label>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
              <span className="block uppercase tracking-wider mb-1.5">Luogo *</span>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="Belvedere, spiaggia o indirizzo" className="w-full h-11 px-3 hounigo-card-subtle rounded-xl text-sm" />
            </label>
          </div>
          <div>
            <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">Fascia luce</span>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(PHOTO_LIGHT_LABELS) as [FasciaLuceFotografica, string][]).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setLightWindow(value)} className={`min-h-9 px-3 rounded-full border text-xs font-semibold ${lightWindow === value ? 'bg-[#FF6B5F] text-white border-[#FF6B5F]' : 'hounigo-card-subtle text-slate-700 dark:text-slate-200'}`}>{label}</button>
              ))}
            </div>
          </div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
            <span className="block uppercase tracking-wider mb-1.5">Soggetto *</span>
            <input type="text" value={photoSubject} onChange={(e) => setPhotoSubject(e.target.value)} required placeholder="Paesaggio, skyline, aurora, ritratto…" className="w-full h-11 px-3 hounigo-card-subtle rounded-xl text-sm" />
          </label>
          <div>
            <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">Coordinate facoltative</span>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" inputMode="decimal" value={latitude} onChange={(e) => { setLatitude(e.target.value); setCoordinate(undefined); }} placeholder="Latitudine" className="w-full h-10 px-3 hounigo-card-subtle rounded-xl text-sm" aria-label="Latitudine" />
              <input type="text" inputMode="decimal" value={longitude} onChange={(e) => { setLongitude(e.target.value); setCoordinate(undefined); }} placeholder="Longitudine" className="w-full h-10 px-3 hounigo-card-subtle rounded-xl text-sm" aria-label="Longitudine" />
            </div>
          </div>
          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300"><span className="block mb-1">Note</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Accesso, composizione, attrezzatura o meteo…" className="w-full p-3 hounigo-card-subtle rounded-xl text-sm resize-none" /></label>
          {renderPhotoField('Aggiungi foto dello spot', 'La prima foto diventa la copertina della card.')}
        </div>
      )}

      {!isTrekking && !isPhotoSpot && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Data Inizio *
          </label>
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] transition-colors"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Data Fine (Opzionale)
          </label>
          <input
            type="date"
            value={endDate}
            min={customDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] transition-colors"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Orari Evento</span>
          {(orarioRitrovo || orarioInizio) && (
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setTimeStatus('confermato')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${timeStatus === 'confermato' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
              >✓ Confermato</button>
              <button
                type="button"
                onClick={() => setTimeStatus('indicativo')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${timeStatus === 'indicativo' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
              >~ Indicativo</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Ore Ritrovo
          </label>
          <TimePickerInput value={orarioRitrovo} onChange={setOrarioRitrovo} ariaLabel="Ora ritrovo" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Ore Inizio
          </label>
          <TimePickerInput value={orarioInizio} onChange={setOrarioInizio} ariaLabel="Ora inizio" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Durata (es. 2h)
          </label>
          <input
            type="text"
            placeholder="es. 2h 15m"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
          />
        </div>
      </div>

      {/* Indirizzo e Link Maps separati */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Punto di Ritrovo / Indirizzo leggibile
          </label>
          <input
            type="text"
            placeholder="es. Molo 4, Marina Grande o Piazza Duomo"
            value={address}
            onChange={(e) => {
              const extracted = extractMapsUrlFromText(e.target.value);
              if (extracted.mapsUrl) {
                setAddress(extracted.cleanText);
                setGoogleMapsUrl(extracted.mapsUrl);
                if (extracted.isRoute) {
                  setIsRoute(true);
                  if (extracted.origin) setOriginLocation(extracted.origin);
                  if (extracted.destination) setDestinationLocation(extracted.destination);
                }
              } else {
                setAddress(e.target.value);
              }
            }}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] placeholder:text-slate-400"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Link Google Maps (separato)
          </label>
          <input
            type="url"
            placeholder="es. https://maps.app.goo.gl/... o https://www.google.com/maps/..."
            value={googleMapsUrl}
            onChange={(e) => setGoogleMapsUrl(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Dettagli specifici per Passeggiata e Tappe subordinate */}
      {isPasseggiata && (
        <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider flex items-center gap-1.5">
              <span>🚶</span> Percorso Passeggiata
            </span>
            <label className="inline-flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={isRoute}
                onChange={(e) => setIsRoute(e.target.checked)}
                className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Percorso a piedi con indicazioni stradali (Directions)</span>
            </label>
          </div>

          {isRoute && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider mb-1">
                  Origine / Partenza
                </label>
                <input
                  type="text"
                  placeholder="es. Bridge of Remembrance"
                  value={originLocation}
                  onChange={(e) => setOriginLocation(e.target.value)}
                  className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-xl text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#FF6B5F]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider mb-1">
                  Destinazione / Arrivo
                </label>
                <input
                  type="text"
                  placeholder="es. New Regent Street"
                  value={destinationLocation}
                  onChange={(e) => setDestinationLocation(e.target.value)}
                  className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-xl text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#FF6B5F]"
                />
              </div>
            </div>
          )}

          {initialData?.id && (
            <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider">
                  Tappe subordinate collegate ({childTappe.length})
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  Ordinamento cronologico
                </span>
              </div>

              {childTappe.length > 0 ? (
                <div className="space-y-1.5">
                  {childTappe.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/60 rounded-xl text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">
                          {t.orario || (t as any).time || '--:--'}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{t.titolo}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnlinkChild(t.id)}
                        className="px-2 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                        title="Scollega da questa passeggiata (la tappa non verrà cancellata)"
                      >
                        Scollega
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Nessuna tappa subordinata collegata. Puoi associare tappe di questo giorno dal selettore qui sotto o dalla schermata della singola tappa.
                </p>
              )}

              {availableTappeForDay.filter(t => !t.passeggiataId).length > 0 && (
                <div className="flex gap-2 pt-1">
                  <select
                    value={selectedTappaToLink}
                    onChange={(e) => setSelectedTappaToLink(e.target.value)}
                    className="flex-1 h-9 px-2.5 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs"
                  >
                    <option value="">+ Collega una tappa del giorno a questa passeggiata...</option>
                    {availableTappeForDay.filter(t => !t.passeggiataId).map(t => (
                      <option key={t.id} value={t.id}>
                        {t.orario ? `${t.orario} · ` : ''}{t.titolo}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedTappaToLink}
                    onClick={() => handleLinkChild(selectedTappaToLink)}
                    className="px-3 h-9 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    Collega
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          Dettaglio Economico
        </label>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Costo Totale (€)</label>
            <input
              type="text"
              placeholder="es. 180"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Acconto Versato (€)</label>
            <input
              type="text"
              placeholder="es. 50"
              value={acconto}
              onChange={(e) => setAcconto(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-600">
            Saldo Rimanente: <span className={`font-bold ${saldo > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{saldo > 0 ? saldo.toFixed(2) : '0.00'} €</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="saldato-toggle" className="text-xs font-bold text-slate-700 cursor-pointer">Saldato</label>
            <input
              id="saldato-toggle"
              type="checkbox"
              checked={paymentStatus === 'saldato'}
              onChange={(e) => {
            const checked = e.target.checked;
            setPaymentStatus(checked ? 'saldato' : 'da_saldare');
            if (checked && cost) {
                setAcconto(cost);
            } else {
                setAcconto('0');
            }
            setStatus(checked ? 'prenotato' : 'da_valutare'); // 'prenotato' in Attivita means confirmed basically. Or 'completato' if it exists.
        }}
              className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Pass / Voucher URL
          </label>
          <input
            type="text"
            placeholder="Link o codice"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            QR Code / PNR
          </label>
          <input
            type="text"
            placeholder="Codice a barre testuale"
            value={qrCode}
            onChange={(e) => setQrCode(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
          />
        </div>
      </div>

      {/* Sezione Allegati Documenti / PDF / QR Code Originali */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              📎 Biglietto PDF &amp; File QR Code
            </label>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Carica il documento originale ricevuto dall'organizzatore (PDF o immagine con QR). Disponibile 100% offline.
            </p>
          </div>
          <DropZone
            variant="button"
            onFilesSelected={handleFilesBatch}
            isUploading={isUploadingAttachment}
            title="+ Allega File"
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold border-none"
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,application/pdf"
            multiple
            className="hidden"
          />
        </div>

        {storageWarning && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{storageWarning}</span>
            </span>
            <button
              type="button"
              onClick={() => setStorageWarning('')}
              className="text-amber-700 font-bold ml-2 hover:opacity-80"
            >
              ✕
            </button>
          </div>
        )}

        {attachmentError && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>🚫</span>
              <span>{attachmentError}</span>
            </span>
            <button
              type="button"
              onClick={() => setAttachmentError('')}
              className="text-rose-600 font-bold ml-2 hover:opacity-80"
            >
              ✕
            </button>
          </div>
        )}

        {attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                    className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 text-base shrink-0 cursor-pointer hover:bg-amber-100 transition-colors"
                    title="Tocca per aprire"
                  >
                    {att.type === 'pdf' ? '📄' : '🖼️'}
                  </div>
                  <div className="min-w-0">
                    <p
                      onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                      className="text-xs font-bold text-slate-900 truncate cursor-pointer hover:text-amber-700"
                      title={att.name}
                    >
                      {att.name}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatFileSize(att.size)} • <span className="text-emerald-600 font-medium">Offline</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                    title="Apri documento"
                  >
                    Apri ↗
                  </button>
                  <a
                    href={att.dataUrl}
                    download={att.name}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold transition-colors cursor-pointer"
                    title="Scarica file originale"
                  >
                    Scarica ↓
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="w-7 h-7 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center font-bold text-xs cursor-pointer"
                    title="Rimuovi allegato"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            <DropZone
              variant="compact"
              onFilesSelected={handleFilesBatch}
              isUploading={isUploadingAttachment}
              title="Trascina qui altri biglietti o QR code"
              subtitle="oppure clicca per selezionare dalla cartella"
            />
          </div>
        ) : (
          <DropZone
            variant="hero"
            onFilesSelected={handleFilesBatch}
            isUploading={isUploadingAttachment}
            title="Trascina qui il tuo Biglietto, Pass o QR Code"
            subtitle="Rilascia direttamente dal desktop oppure clicca per sfogliare la cartella (PDF o immagini)."
          />
        )}
      </div>

      </>}

      <OpeningHoursFields value={openingHours} onChange={setOpeningHours} date={customDate} time={orarioInizio || orarioRitrovo} />

      <TimeZoneInput value={timeZone} onChange={setTimeZone} label="Fuso orario dell'attività" />

      {!isTrekking && !isPhotoSpot && <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Note Libere / Cosa portare
        </label>
        <textarea
          rows={3}
          placeholder="es. Abbigliamento termico, snack, protezione solare..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] placeholder:text-slate-400 resize-none"
        />
      </div>}

      <div className="flex flex-col gap-3 pt-4 mt-2 border-t border-slate-100">
        <button
          type="submit"
          disabled={isGeocoding}
          className={`w-full h-12 rounded-xl text-sm font-bold bg-[#FF6B5F] hover:bg-[#e85c50] active:scale-95 text-white shadow-lg transition-all ${isGeocoding ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {isGeocoding ? 'Salvataggio in corso...' : initialData ? 'Aggiorna Attività' : 'Salva Modifiche'}
        </button>
        
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors py-1"
          >
            Annulla
          </button>
        )}

        {initialData && onDelete && (
          <div className="text-center">
            {!showConfirmDelete ? (
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                className="text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors py-2"
              >
                Elimina attività
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 py-1">
                <span className="text-xs font-medium text-slate-600">Sei sicuro?</span>
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700"
                >
                  Sì, elimina
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-3 py-1 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300"
                >
                  Annulla
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
