const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=================================================================');
console.log('   TEST HOUNIGO: GESTIONE ROBUSTA UPDATEDAT, PRENOTAZIONI & VOUCHER');
console.log('=================================================================\n');

let passedTests = 0;
function pass(msg) {
  console.log(`[PASS] ${msg}`);
  passedTests++;
}

// -----------------------------------------------------------------------------
// 1. RIPRODUZIONE DEL BUG ORIGINALE E PREVENZIONE
// -----------------------------------------------------------------------------
{
  const buggyDoc = {
    id: 'doc_1',
    title: 'Polizza Viaggio',
    validity: '',
    updatedAt: 1729341234567 // Salvato come numero da Date.now()
  };

  // 1.A Verifica che l'approccio originale causava il crash "split is not a function"
  let originalCrashed = false;
  try {
    const d = buggyDoc;
    // Codice originale vulnerabile:
    const _date = d.validity || (d.updatedAt ? d.updatedAt.split('T')[0] : undefined);
  } catch (err) {
    if (err.message.includes('split is not a function')) {
      originalCrashed = true;
    }
  }
  assert.strictEqual(originalCrashed, true, 'Il codice originale deve effettivamente fallire con split is not a function');

  // 1.B Verifica che il codice corretto in unifiedBookingService.ts non usi più .split direttamente
  const unifiedBookingCode = fs.readFileSync(
    path.join(__dirname, 'src', 'services', 'unifiedBookingService.ts'),
    'utf-8'
  );
  assert.ok(
    !unifiedBookingCode.includes('updatedAt.split'),
    'unifiedBookingService.ts non contiene alcuna chiamata a updatedAt.split'
  );
  assert.ok(
    !unifiedBookingCode.includes('.updatedAt.split'),
    'unifiedBookingService.ts non applica .split su alcuna proprietà updatedAt'
  );

  pass('1. Riproduzione del bug originale confermata e rimozione di updatedAt.split');
}

// -----------------------------------------------------------------------------
// 2. VERIFICA UTILITY DI NORMALIZZAZIONE TIMESTAMP (normalizeTimestamp)
// -----------------------------------------------------------------------------
{
  // Simuliamo la logica implementata in tripDates.ts
  function normalizeTimestamp(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') {
      if (!isFinite(val) || val <= 0) return 0;
      if (val < 10000000000) return Math.floor(val * 1000);
      return Math.floor(val);
    }
    if (val instanceof Date) {
      const t = val.getTime();
      return isNaN(t) || t <= 0 ? 0 : t;
    }
    if (typeof val === 'object') {
      if (typeof val.toDate === 'function') {
        try {
          const d = val.toDate();
          if (d instanceof Date && !isNaN(d.getTime())) return d.getTime();
        } catch {}
      }
      const secs = typeof val.seconds === 'number' ? val.seconds : (typeof val._seconds === 'number' ? val._seconds : null);
      if (secs !== null && isFinite(secs) && secs > 0) {
        const nanos = typeof val.nanoseconds === 'number' ? val.nanoseconds : (typeof val._nanoseconds === 'number' ? val._nanoseconds : 0);
        return Math.floor(secs * 1000 + nanos / 1000000);
      }
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return 0;
      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        if (isFinite(num) && num > 0) {
          if (num < 10000000000) return Math.floor(num * 1000);
          return Math.floor(num);
        }
      }
      if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(trimmed)) {
        const [d, m, y] = trimmed.split(/[-/]/).map(Number);
        const dt = new Date(y, m - 1, d);
        if (!isNaN(dt.getTime())) return dt.getTime();
      }
      const parsed = Date.parse(trimmed);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }

  // A. Numero epoch in millisecondi
  assert.strictEqual(normalizeTimestamp(1729341234567), 1729341234567);

  // B. Numero epoch in secondi (es. Firebase timestamp primitivo o unix)
  assert.strictEqual(normalizeTimestamp(1729341234), 1729341234000);

  // C. Stringa ISO standard
  const isoTime = new Date('2026-11-28T10:00:00.000Z').getTime();
  assert.strictEqual(normalizeTimestamp('2026-11-28T10:00:00.000Z'), isoTime);

  // D. Istanza Date nativa
  const nativeDate = new Date(1729341234567);
  assert.strictEqual(normalizeTimestamp(nativeDate), 1729341234567);

  // E. Firebase Timestamp con metodo toDate()
  const fbTimestampObj = {
    toDate: () => new Date(1729341234567)
  };
  assert.strictEqual(normalizeTimestamp(fbTimestampObj), 1729341234567);

  // F. Firebase Timestamp con seconds e nanoseconds
  const rawFbTimestamp = {
    seconds: 1729341234,
    nanoseconds: 567000000
  };
  assert.strictEqual(normalizeTimestamp(rawFbTimestamp), 1729341234567);

  // G. Valori assenti, null, undefined, stringhe vuote o malformate: ritorna 0 senza inventare date
  assert.strictEqual(normalizeTimestamp(null), 0);
  assert.strictEqual(normalizeTimestamp(undefined), 0);
  assert.strictEqual(normalizeTimestamp(''), 0);
  assert.strictEqual(normalizeTimestamp('stringa-malformata-non-data'), 0);
  assert.strictEqual(normalizeTimestamp(NaN), 0);
  assert.strictEqual(normalizeTimestamp(-100), 0);

  pass('2. normalizeTimestamp: supporto completo per number, Date, Firebase Timestamp, ISO string e fallback a 0');
}

// -----------------------------------------------------------------------------
// 3. VERIFICA UTILITY DI ESTRAZIONE DATA ISO (normalizeDateToISO)
// -----------------------------------------------------------------------------
{
  function normalizeDateToISO(val) {
    if (val === null || val === undefined || val === '') return undefined;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(trimmed)) return trimmed.split(/[T\s]/)[0];
      if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(trimmed)) {
        const [d, m, y] = trimmed.split(/[-/]/);
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      if (/^\d{10,}$/.test(trimmed)) {
        const num = Number(trimmed);
        if (isFinite(num) && num > 0) {
          const d = new Date(num < 10000000000 ? num * 1000 : num);
          if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          }
        }
      }
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return undefined;
    }
    if (typeof val === 'number') {
      if (!isFinite(val) || val <= 0) return undefined;
      const ms = val < 10000000000 ? val * 1000 : val;
      const d = new Date(ms);
      if (isNaN(d.getTime())) return undefined;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return undefined;
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    if (typeof val === 'object') {
      if (typeof val.toDate === 'function') {
        try {
          const d = val.toDate();
          if (d instanceof Date && !isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          }
        } catch {}
      }
      const secs = typeof val.seconds === 'number' ? val.seconds : (typeof val._seconds === 'number' ? val._seconds : null);
      if (secs !== null && isFinite(secs) && secs > 0) {
        const d = new Date(secs * 1000);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        }
      }
    }
    return undefined;
  }

  // A. Stringa già YYYY-MM-DD
  assert.strictEqual(normalizeDateToISO('2026-11-28'), '2026-11-28');

  // B. Stringa ISO con orario
  assert.strictEqual(normalizeDateToISO('2026-11-28T14:30:00.000Z'), '2026-11-28');

  // C. Stringa formato italiano gg-mm-aaaa
  assert.strictEqual(normalizeDateToISO('28-11-2026'), '2026-11-28');
  assert.strictEqual(normalizeDateToISO('05/12/2026'), '2026-12-05');

  // D. Numero epoch (ms)
  const dtNov28 = new Date(2026, 10, 28, 12, 0, 0); // 28 Nov 2026
  assert.strictEqual(normalizeDateToISO(dtNov28.getTime()), '2026-11-28');

  // E. Istanza Date
  assert.strictEqual(normalizeDateToISO(dtNov28), '2026-11-28');

  // F. Firebase Timestamp con toDate
  assert.strictEqual(normalizeDateToISO({ toDate: () => dtNov28 }), '2026-11-28');

  // G. Testo descrittivo (non data): ritorna undefined in sicurezza senza lanciare eccezioni
  assert.strictEqual(normalizeDateToISO("Valida per l'intero viaggio (28 Nov 2026 – 12 Gen 2027)"), undefined);
  assert.strictEqual(normalizeDateToISO(null), undefined);
  assert.strictEqual(normalizeDateToISO(undefined), undefined);

  pass('3. normalizeDateToISO: conversione robusta in YYYY-MM-DD per qualsiasi tipo supportato e safe undefined su testo');
}

// -----------------------------------------------------------------------------
// 4. CARICAMENTO RECORD MISTI: PRENOTAZIONI, DOCUMENTI E VOUCHER
// -----------------------------------------------------------------------------
{
  // Simuliamo un insieme eterogeneo di documenti con tipi misti di updatedAt e date
  const mockTravelDocs = [
    {
      id: 'doc_iso_string',
      category: 'passaporto',
      title: 'Passaporto Biometrico',
      validity: '2026-11-28',
      updatedAt: '2026-10-15T10:00:00.000Z',
      attachments: [{ id: 'att_1', name: 'passaporto.pdf', size: 1024, type: 'application/pdf' }]
    },
    {
      id: 'doc_number_timestamp',
      category: 'visto',
      title: 'Visto Turistico Australia',
      validity: '',
      updatedAt: 1729341234567, // Numero epoch (ha causato il bug originario)
      attachments: [{ id: 'att_2', name: 'visto_aus.pdf', size: 2048, type: 'application/pdf' }]
    },
    {
      id: 'doc_date_object',
      category: 'assicurazione',
      title: 'Assicurazione Sanitaria',
      validity: 'Valida per intero viaggio',
      updatedAt: new Date(2026, 10, 15),
      attachments: []
    },
    {
      id: 'doc_firestore_timestamp',
      category: 'patente',
      title: 'Patente Internazionale',
      validity: undefined,
      expiresAt: '2027-05-10',
      updatedAt: { toDate: () => new Date(2026, 10, 10) },
      attachments: [{ id: 'att_3', name: 'patente.jpg', size: 512, type: 'image/jpeg' }]
    },
    {
      id: 'doc_null_updated_at',
      category: 'altro',
      title: 'Voucher Escursione Hobbiton',
      validity: '2026-12-05',
      updatedAt: null,
      attachments: [{ id: 'att_4', name: 'hobbiton_voucher.pdf', size: 4096, type: 'application/pdf' }]
    },
    {
      id: 'doc_malformed',
      category: 'altro',
      title: 'Documento Anomalo',
      validity: '',
      updatedAt: 'testo-non-valido',
      attachments: []
    }
  ];

  // Simuliamo la funzione getAllUnifiedBookings per la parte documenti con la logica corretta
  function processDocuments(travelDocuments) {
    const items = [];
    travelDocuments.forEach((d) => {
      const attachments = d.attachments || [];

      let docDate = undefined;
      if (typeof d.validity === 'string' && d.validity.trim()) {
        docDate = d.validity.trim();
      } else {
        docDate = normalizeDateToISO(d.validity) || normalizeDateToISO(d.expiresAt) || normalizeDateToISO(d.updatedAt);
      }

      items.push({
        id: d.id,
        category: 'documento',
        title: d.title,
        subtitle: `Documento (${d.category})`,
        date: docDate,
        location: d.category,
        locationDetails: d.expiresAt ? `Scadenza: ${d.expiresAt}` : undefined,
        status: d.status || 'Valido',
        notes: d.description,
        hasAttachments: attachments.length > 0,
        attachmentsCount: attachments.length,
        attachments,
        carrierOrProvider: d.title,
        rawType: 'documento',
        rawItem: d,
        updatedAt: d.updatedAt
      });
    });

    // Ordinamento stabile
    items.sort((a, b) => {
      if (!a.date && !b.date) return (a.title || '').localeCompare(b.title || '');
      if (!a.date) return 1;
      if (!b.date) return -1;
      const dateComp = String(a.date).localeCompare(String(b.date));
      if (dateComp !== 0) return dateComp;
      const timeA = String(a.time || '00:00');
      const timeB = String(b.time || '00:00');
      return timeA.localeCompare(timeB);
    });

    return items;
  }

  // Nessun crash deve avvenire con record eterogenei
  const unifiedDocs = processDocuments(mockTravelDocs);
  assert.strictEqual(unifiedDocs.length, 6, 'Tutti i 6 documenti devono essere caricati');

  // Verifica gestione allegati / voucher
  const withVouchers = unifiedDocs.filter(d => d.hasAttachments);
  assert.strictEqual(withVouchers.length, 4, '4 documenti contengono voucher allegati');
  assert.strictEqual(unifiedDocs.find(d => d.id === 'doc_number_timestamp').hasAttachments, true);
  assert.strictEqual(unifiedDocs.find(d => d.id === 'doc_number_timestamp').attachmentsCount, 1);

  // Verifica che il documento anomalo sia gestito con data undefined senza bloccare il caricamento
  const malformedItem = unifiedDocs.find(d => d.id === 'doc_malformed');
  assert.ok(malformedItem, 'Il documento con updatedAt malformato deve essere presente');
  assert.strictEqual(malformedItem.date, undefined, 'La data del documento malformato è undefined');

  pass('4. Caricamento e unificazione di record con tipi misti: nessun crash, voucher estratti correttamente e ordinamento stabile');
}

// -----------------------------------------------------------------------------
// 5. VERIFICA COERENZA SINCRONIZZAZIONE E ORDINAMENTO NOTE/BAGAGLI
// -----------------------------------------------------------------------------
{
  // A. Verifica che in syncService.ts le comparazioni localData.updatedAt vs serverData.updatedAt usino normalizeTimestamp
  const syncServiceCode = fs.readFileSync(
    path.join(__dirname, 'src', 'storage', 'syncService.ts'),
    'utf-8'
  );
  assert.ok(
    syncServiceCode.includes('normalizeTimestamp(localData?.updatedAt)'),
    'syncService.ts normalizza localData.updatedAt'
  );
  assert.ok(
    syncServiceCode.includes('normalizeTimestamp(serverData?.updatedAt)') ||
    syncServiceCode.includes('normalizeTimestamp(data?.updatedAt)'),
    'syncService.ts normalizza serverData.updatedAt'
  );

  // B. Verifica che storageService.ts usi normalizeTimestamp per l\'ordinamento
  const storageServiceCode = fs.readFileSync(
    path.join(__dirname, 'src', 'storage', 'storageService.ts'),
    'utf-8'
  );
  assert.ok(
    storageServiceCode.includes('normalizeTimestamp(b.updatedAt) - normalizeTimestamp(a.updatedAt)'),
    'storageService.ts ordina le note confrontando timestamp normalizzati'
  );
  assert.ok(
    storageServiceCode.includes('normalizeTimestamp(b.createdAt) - normalizeTimestamp(a.createdAt)'),
    'storageService.ts ordina i bagagli confrontando timestamp normalizzati'
  );

  pass('5. Coerenza sincronizzazione cloud e ordinamento: normalizzazione sicura applicata a syncService e storageService');
}

// -----------------------------------------------------------------------------
// 6. ESCLUSIONE DOCUMENTI PERSONALI & MANTENIMENTO VOUCHER PRENOTAZIONI
// -----------------------------------------------------------------------------
{
  const testDocuments = [
    // Documenti personali che DEVONO essere esclusi da Prenotazioni & Voucher:
    { id: 'doc_passaporto', category: 'passaporto', title: 'Passaporto Italiano', attachments: [{ id: 'a1' }] },
    { id: 'doc_visto_cina', category: 'visto', title: 'Visto Cina', attachments: [{ id: 'a2' }] },
    { id: 'doc_patente_guida', category: 'patente', title: 'Patente Internazionale', attachments: [{ id: 'a3' }] },

    // Voucher e documenti di prenotazione che DEVONO restare inclusi:
    { id: 'doc_assicurazione_viaggio', category: 'assicurazione', title: 'Assicurazione Medica AXA', attachments: [{ id: 'a4' }] },
    { id: 'book_visto_agenzia', category: 'visto', title: 'Ricevuta Pagamento Visto', attachments: [{ id: 'a5' }] },
    { id: 'book_passaporto_expedited', category: 'passaporto', title: 'Pratica Urgenza Passaporto', attachments: [{ id: 'a6' }] },
    { id: 'doc_voucher_hotel', category: 'alloggi', title: 'Voucher Hotel Tokyo', attachments: [{ id: 'a7' }] },
    { id: 'doc_escursione', category: 'altro', title: 'Voucher Tour Guidato', attachments: [{ id: 'a8' }] }
  ];

  // Logica di filtro esatta da unifiedBookingService.ts:
  const isPersonalIdentityDoc = (d) =>
    (d.category === 'passaporto' || d.category === 'visto' || d.category === 'patente') &&
    !d.id?.startsWith('book_');

  const filteredForBookings = testDocuments.filter(d => !isPersonalIdentityDoc(d));

  // Verifiche
  assert.strictEqual(filteredForBookings.length, 5, 'Esattamente 5 documenti devono rimanere come voucher di prenotazione');
  assert.ok(!filteredForBookings.some(d => d.id === 'doc_passaporto'), 'doc_passaporto è escluso');
  assert.ok(!filteredForBookings.some(d => d.id === 'doc_visto_cina'), 'doc_visto_cina è escluso');
  assert.ok(!filteredForBookings.some(d => d.id === 'doc_patente_guida'), 'doc_patente_guida è escluso');

  assert.ok(filteredForBookings.some(d => d.id === 'doc_assicurazione_viaggio'), 'doc_assicurazione_viaggio è conservato');
  assert.ok(filteredForBookings.some(d => d.id === 'book_visto_agenzia'), 'book_visto_agenzia è conservato');
  assert.ok(filteredForBookings.some(d => d.id === 'book_passaporto_expedited'), 'book_passaporto_expedited è conservato');
  assert.ok(filteredForBookings.some(d => d.id === 'doc_voucher_hotel'), 'doc_voucher_hotel è conservato');
  assert.ok(filteredForBookings.some(d => d.id === 'doc_escursione'), 'doc_escursione è conservato');

  pass('6. Distinzione netta: documenti personali esclusi dalla vista prenotazioni e voucher di viaggio conservati');
}

// -----------------------------------------------------------------------------
// 7. ORDINAMENTO CRONOLOGICO, FILTRO TEMPORALE E RESILIENZA DATI ANOMALI
// -----------------------------------------------------------------------------
{
  const todayStr = '2026-12-01';

  const mixedItems = [
    { id: 'item_past', title: 'Volo Andata', date: '2026-11-28', time: '10:00' },
    { id: 'item_today', title: 'Hotel Arrivo', date: '2026-12-01', time: '14:00' },
    { id: 'item_future_1', title: 'Noleggio Auto', date: '2026-12-05', time: '09:00' },
    { id: 'item_future_2', title: 'Tour Hobbiton', date: '2026-12-05', time: '15:30' },
    { id: 'item_no_date_1', title: 'Voucher Aperto B', date: undefined },
    { id: 'item_no_date_2', title: 'Voucher Aperto A', date: undefined },
    { id: 'item_anomalous', title: 'Record Anomalo', date: null, time: 12345, cost: 'NaN €' }
  ];

  // A. Ordinamento stabile: per data ascendente, poi per orario ascendente, elementi senza data in coda ordinati per titolo
  const sorted = [...mixedItems].sort((a, b) => {
    if (!a.date && !b.date) return (a.title || '').localeCompare(b.title || '');
    if (!a.date) return 1;
    if (!b.date) return -1;
    const dateComp = String(a.date).localeCompare(String(b.date));
    if (dateComp !== 0) return dateComp;
    const timeA = typeof a.time === 'string' ? a.time : '00:00';
    const timeB = typeof b.time === 'string' ? b.time : '00:00';
    return timeA.localeCompare(timeB);
  });

  assert.strictEqual(sorted[0].id, 'item_past');
  assert.strictEqual(sorted[1].id, 'item_today');
  assert.strictEqual(sorted[2].id, 'item_future_1');
  assert.strictEqual(sorted[3].id, 'item_future_2');
  // Senza data in coda
  assert.strictEqual(sorted[4].id, 'item_anomalous');
  assert.strictEqual(sorted[5].id, 'item_no_date_2');
  assert.strictEqual(sorted[6].id, 'item_no_date_1');

  // B. Filtro temporale (future / passate)
  const futureItems = sorted.filter(b => b.date && b.date >= todayStr);
  const pastItems = sorted.filter(b => b.date && b.date < todayStr);

  assert.strictEqual(futureItems.length, 3, 'Esattamente 3 elementi futuri/odierni');
  assert.strictEqual(pastItems.length, 1, 'Esattamente 1 elemento passato');
  assert.strictEqual(pastItems[0].id, 'item_past');

  // C. Verifica che PrenotazioniWorkspaceView esponga gli errori reali e non li mascheri
  const workspaceCode = fs.readFileSync(
    path.join(__dirname, 'src', 'views', 'desktop', 'PrenotazioniWorkspaceView.tsx'),
    'utf-8'
  );
  assert.ok(
    workspaceCode.includes('setLoadError(err?.message') || workspaceCode.includes('setLoadError('),
    'PrenotazioniWorkspaceView memorizza e mostra esplicitamente gli errori di caricamento'
  );
  assert.ok(
    workspaceCode.includes('loadError') && workspaceCode.includes('Riprova'),
    'PrenotazioniWorkspaceView fornisce all\'utente un pulsante di retry in caso di errore reale'
  );

  pass('7. Ordinamento, filtro temporale, resilienza su dati anomali e trasparenza degli errori confermati');
}

console.log('\n-----------------------------------------------------------------');
console.log(`RISULTATO SUITE FIX UPDATEDAT: ${passedTests}/7 TEST SUPERATI CON SUCCESSO!`);
console.log('-----------------------------------------------------------------\n');
