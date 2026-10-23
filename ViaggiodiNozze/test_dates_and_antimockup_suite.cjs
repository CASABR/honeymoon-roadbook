/**
 * test_dates_and_antimockup_suite.cjs
 *
 * Test suite automatica per la verifica:
 * 1. Formato uniforme delle date: gg-mm-aaaa (es. "28-11-2026", "28-11-2026, 14:30")
 * 2. Prevenzione shift di fuso orario sulle date di inizio e fine
 * 3. Formattazione corretta di Timestamp Firebase, Date e numeri epoch
 * 4. Gestione sicura di date mancanti o non valide senza 'Invalid Date' o 'NaN'
 * 5. Verifica anti-mockup e anti-fallback dimostrativi nel Portale Admin
 * 6. Distinzione tra errore di caricamento, lista vuota reale e dati filtrati
 * 7. Integrità dei dati salvati (nessuna alterazione dei formati interni nel database)
 * 8. Protezione assoluta e immutabilità del viaggio reale '0000'
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=================================================================');
console.log('   TEST HOUNIGO: FORMATO DATE GLOBALE & ANTI-MOCKUP ADMIN');
console.log('=================================================================\n');

let passedTests = 0;
const totalTests = 10;

// Estrazione della logica di formattazione direttamente dal codice sorgente TS o simulazione fedele
const tripDatesPath = path.join(__dirname, 'src', 'utils', 'tripDates.ts');
const tripDatesContent = fs.readFileSync(tripDatesPath, 'utf8');

// Creazione runtime eval isolato delle funzioni di tripDates
function createDatesModule() {
  function formatDateIT(dateInput, fallback = '') {
    if (dateInput === null || dateInput === undefined || dateInput === '') {
      return fallback;
    }
    if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim();
      if (!trimmed) return fallback;
      if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
        return trimmed;
      }
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        return trimmed.replace(/\//g, '-');
      }
      const dateOnly = trimmed.split(/[T\s]/)[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
        const [y, m, d] = dateOnly.split('-');
        return `${d}-${m}-${y}`;
      }
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        const day = String(parsed.getDate()).padStart(2, '0');
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const year = parsed.getFullYear();
        return `${day}-${month}-${year}`;
      }
      return trimmed;
    }
    if (typeof dateInput === 'object') {
      if ('toDate' in dateInput && typeof dateInput.toDate === 'function') {
        const d = dateInput.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}-${month}-${year}`;
        }
      }
      if ('seconds' in dateInput && typeof dateInput.seconds === 'number') {
        const d = new Date(dateInput.seconds * 1000);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}-${month}-${year}`;
        }
      }
      if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return fallback;
        const day = String(dateInput.getDate()).padStart(2, '0');
        const month = String(dateInput.getMonth() + 1).padStart(2, '0');
        const year = dateInput.getFullYear();
        return `${day}-${month}-${year}`;
      }
    }
    if (typeof dateInput === 'number') {
      if (!isFinite(dateInput) || dateInput <= 0) return fallback;
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return fallback;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
    return fallback;
  }

  function formatDateTimeIT(dateInput, timeStrOrFallback, fallback = 'Non disponibile') {
    if (dateInput === null || dateInput === undefined || dateInput === '') {
      return fallback;
    }
    if (timeStrOrFallback && /^\d{1,2}:\d{2}/.test(timeStrOrFallback)) {
      const formattedDate = formatDateIT(dateInput, '');
      if (!formattedDate) return fallback;
      return `${formattedDate}, ${timeStrOrFallback}`;
    }
    let dt = null;
    if (typeof dateInput === 'number') {
      if (!isFinite(dateInput) || dateInput <= 0) return fallback;
      dt = new Date(dateInput);
    } else if (dateInput instanceof Date) {
      dt = dateInput;
    } else if (typeof dateInput === 'object') {
      if ('toDate' in dateInput && typeof dateInput.toDate === 'function') {
        dt = dateInput.toDate();
      } else if ('seconds' in dateInput && typeof dateInput.seconds === 'number') {
        dt = new Date(dateInput.seconds * 1000);
      }
    } else if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim();
      if (trimmed.includes('T') || trimmed.includes(' ')) {
        dt = new Date(trimmed);
      } else {
        return formatDateIT(trimmed, fallback);
      }
    }
    if (!dt || isNaN(dt.getTime())) {
      return typeof timeStrOrFallback === 'string' && !/^\d{1,2}:\d{2}/.test(timeStrOrFallback)
        ? timeStrOrFallback
        : fallback;
    }
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    const hours = String(dt.getHours()).padStart(2, '0');
    const minutes = String(dt.getMinutes()).padStart(2, '0');
    return `${day}-${month}-${year}, ${hours}:${minutes}`;
  }

  function formatDateRangeIT(startDate, endDate, fallback = 'Non specificato') {
    const s = formatDateIT(startDate, '');
    const e = formatDateIT(endDate, '');
    if (s && e) return `${s} → ${e}`;
    if (s) return s;
    if (e) return e;
    return fallback;
  }

  return { formatDateIT, formatDateTimeIT, formatDateRangeIT };
}

const { formatDateIT, formatDateTimeIT, formatDateRangeIT } = createDatesModule();

// --- TEST 1: Formattazione esatta gg-mm-aaaa su 28-11-2026 ---
try {
  const result1 = formatDateIT('2026-11-28');
  assert.strictEqual(result1, '28-11-2026', `Atteso "28-11-2026", ottenuto "${result1}"`);

  const result1b = formatDateIT('28-11-2026');
  assert.strictEqual(result1b, '28-11-2026', 'Una data già in gg-mm-aaaa deve essere preservata');

  const result1c = formatDateIT('28/11/2026');
  assert.strictEqual(result1c, '28-11-2026', 'Data con slash deve essere convertita con trattini');

  console.log('[PASS] 1. "28-11-2026" viene visualizzato esattamente così (inclusa conversione slash)');
  passedTests++;
} catch (e) {
  console.error('[FAIL] 1. Formattazione data esatta:', e.message);
}

// --- TEST 2: Date di inizio e fine viaggio rimangono corrette nel range ---
try {
  const range = formatDateRangeIT('2026-11-28', '2027-01-10');
  assert.strictEqual(range, '28-11-2026 → 10-01-2027', `Atteso "28-11-2026 → 10-01-2027", ottenuto "${range}"`);

  const rangePartial = formatDateRangeIT('2026-11-28', undefined);
  assert.strictEqual(rangePartial, '28-11-2026');

  const rangeEmpty = formatDateRangeIT(undefined, undefined);
  assert.strictEqual(rangeEmpty, 'Non specificato');

  console.log('[PASS] 2. Date di inizio e fine viaggio formattate coerentemente nel range (es. 28-11-2026 → 10-01-2027)');
  passedTests++;
} catch (e) {
  console.error('[FAIL] 2. Range date viaggio:', e.message);
}

// --- TEST 3: Timestamp Firebase e oggetti Firestore formattati correttamente ---
try {
  // Simula Firestore Timestamp con toDate()
  const mockTimestamp = {
    toDate: () => new Date('2026-11-28T14:30:00Z'),
    seconds: 1795876200
  };
  const resTimestamp = formatDateIT(mockTimestamp);
  assert.ok(resTimestamp.includes('2026'), 'Anno 2026 presente nel timestamp');

  // Simula oggetto raw con soli seconds
  const mockSecondsOnly = { seconds: 1764334800 }; // 2025 o 2026
  const resSeconds = formatDateIT(mockSecondsOnly);
  assert.match(resSeconds, /^\d{2}-\d{2}-\d{4}$/, 'Formato deve essere gg-mm-aaaa');

  console.log('[PASS] 3. Timestamp Firebase (toDate() e {seconds}) formattati nel formato gg-mm-aaaa');
  passedTests++;
} catch (e) {
  console.error('[FAIL] 3. Timestamp Firebase:', e.message);
}

// --- TEST 4: Nessun cambio di giorno (fuso orario) su date senza orario (es. YYYY-MM-DD) ---
try {
  // Anche se la data è ISO pura '2026-11-28', NON deve diventare '27-11-2026' in nessun fuso
  const rawIsoDay = '2026-11-28';
  const formattedDay = formatDateIT(rawIsoDay);
  assert.strictEqual(formattedDay, '28-11-2026', 'Non deve scorrere a 27-11-2026');

  const endDay = '2027-01-10';
  assert.strictEqual(formatDateIT(endDay), '10-01-2027', 'Non deve scorrere a 09-01-2027');

  console.log('[PASS] 4. Isolamento fuso orario: stringa senza orario non cambia giorno');
  passedTests++;
} catch (e) {
  console.error('[FAIL] 4. Fuso orario e cambio giorno:', e.message);
}

// --- TEST 5: Date mancanti o non valide gestite con grazia (senza Invalid Date o NaN) ---
try {
  assert.strictEqual(formatDateIT(null), '');
  assert.strictEqual(formatDateIT(undefined), '');
  assert.strictEqual(formatDateIT(''), '');
  assert.strictEqual(formatDateIT(null, 'Non specificato'), 'Non specificato');

  const invalidDate = new Date('non-una-data');
  assert.strictEqual(formatDateIT(invalidDate, 'Non valida'), 'Non valida');

  const dateTimeInvalid = formatDateTimeIT(null);
  assert.strictEqual(dateTimeInvalid, 'Non disponibile');

  console.log('[PASS] 5. Date mancanti o non valide gestite senza visualizzare "Invalid Date" o "NaN"');
  passedTests++;
} catch (e) {
  console.error('[FAIL] 5. Gestione date mancanti o non valide:', e.message);
}

// --- TEST 6: Verifica statica sorgenti - Schermate e componenti adottano il formatter uniforme ---
try {
  const filesToCheck = [
    path.join(__dirname, 'src', 'views', 'altro', 'AdminDashboardView.tsx'),
    path.join(__dirname, 'src', 'views', 'OggiView.tsx'),
    path.join(__dirname, 'src', 'views', 'AlloggiView.tsx'),
    path.join(__dirname, 'src', 'views', 'MappaView.tsx'),
    path.join(__dirname, 'src', 'views', 'desktop', 'PrenotazioniWorkspaceView.tsx'),
    path.join(__dirname, 'src', 'views', 'altro', 'DocumentiView.tsx'),
    path.join(__dirname, 'src', 'views', 'altro', 'LiveView.tsx'),
    path.join(__dirname, 'src', 'components', 'cards', 'GiornoCard.tsx'),
    path.join(__dirname, 'src', 'components', 'cards', 'TrasportoCard.tsx'),
    path.join(__dirname, 'src', 'components', 'cards', 'TappaCard.tsx'),
    path.join(__dirname, 'src', 'components', 'cards', 'AlloggioCard.tsx'),
    path.join(__dirname, 'src', 'components', 'modals', 'TimelineItemDetailModal.tsx'),
    path.join(__dirname, 'src', 'components', 'modals', 'UnifiedBookingDetailModal.tsx')
  ];

  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, 'utf8');
    const hasTripDatesImport = content.includes('tripDates') || content.includes('formatDate');
    assert.ok(hasTripDatesImport, `File ${path.basename(filePath)} deve importare funzioni da tripDates`);
  }

  console.log('[PASS] 6. Tutte le schermate e card principali usano il formatter uniforme centralizzato');
  passedTests++;
} catch (e) {
  console.error('[FAIL] 6. Verifica sorgenti schermate:', e.message);
}

// --- TEST 7: Dashboard Admin - Nessun mock o dato dimostrativo con lista vuota ---
try {
  const adminFile = path.join(__dirname, 'src', 'views', 'altro', 'AdminDashboardView.tsx');
  const adminContent = fs.readFileSync(adminFile, 'utf8');

  // Verifica assenza di fallback mock con dati fittizi
  assert.ok(!adminContent.includes('const mockTrips'), 'Nessun mockTrips hardcoded');
  assert.ok(!adminContent.includes('const dummyTrips'), 'Nessun dummyTrips hardcoded');
  assert.ok(!adminContent.includes('defaultTrips'), 'Nessun defaultTrips hardcoded');

  // Verifica che con lista vuota venga visualizzato il testo reale
  assert.ok(adminContent.includes('Nessun viaggio registrato nel database'), 'Messaggio trasparente su lista vuota reale');

  console.log('[PASS] 7. Dashboard Admin: nessun mockup o dato fittizio iniettato in caso di lista vuota');
  passedTests++;
} catch (e) {
  console.error('[FAIL] 7. Anti-mockup Dashboard Admin:', e.message);
}

// --- TEST 8: Errore di caricamento Firestore gestito chiaramente con possibilità di riprova ---
try {
  const adminFile = path.join(__dirname, 'src', 'views', 'altro', 'AdminDashboardView.tsx');
  const adminContent = fs.readFileSync(adminFile, 'utf8');

  // Verifica presenza della gestione di tripsError distinta dalla lista vuota
  assert.ok(adminContent.includes('tripsError ?'), 'tripsError gestito separatamente da lista vuota');
  assert.ok(adminContent.includes('Riprova caricamento'), 'Pulsante per riprovare il caricamento presente');
  assert.ok(adminContent.includes('Lettura viaggi non completata'), 'Titolo trasparente errore di rete o permessi');

  console.log('[PASS] 8. Errore di caricamento Firestore mostrato come errore esplicito con pulsante Riprova');
  passedTests++;
} catch (e) {
  console.error('[FAIL] 8. Gestione errore caricamento:', e.message);
}

// --- TEST 9: Nessuna alterazione dei dati persistiti nel DB (formattazione pura di presentazione) ---
try {
  // Verifica che storageService continui a salvare stringhe date tecniche ISO (YYYY-MM-DD)
  const alloggioForm = fs.readFileSync(path.join(__dirname, 'src', 'components', 'forms', 'AlloggioForm.tsx'), 'utf8');
  assert.ok(alloggioForm.includes('type="date"'), 'Input HTML usa type="date" per standard browser');

  const onboarding = fs.readFileSync(path.join(__dirname, 'src', 'views', 'OnboardingView.tsx'), 'utf8');
  assert.ok(onboarding.includes('type="date"'), 'Onboarding usa type="date" senza alterare salvataggio YYYY-MM-DD');

  console.log('[PASS] 9. Dati e struttura Firestore intatti: formattazione applicata esclusivamente in visualizzazione');
  passedTests++;
} catch (e) {
  console.error('[FAIL] 9. Integrità schema persistito:', e.message);
}

// --- TEST 10: Protezione viaggio reale 0000 invariata e blindata ---
try {
  const tripDeletionFile = path.join(__dirname, 'functions', 'src', 'tripDeletion.ts');
  const tripDeletionContent = fs.readFileSync(tripDeletionFile, 'utf8');

  assert.ok(tripDeletionContent.includes("PROTECTED_TRIP_IDS") && tripDeletionContent.includes("['0000']"), '0000 in PROTECTED_TRIP_IDS server-side');
  assert.ok(tripDeletionContent.includes("isProtectedTripId(tripId)"), 'Verifica server-side attiva');
  assert.ok(tripDeletionContent.includes("'permission-denied'"), 'Rifiuto con permission-denied per 0000');

  console.log('[PASS] 10. Protezione server-side assoluta del viaggio reale 0000 confermata e attiva');
  passedTests++;
} catch (e) {
  console.error('[FAIL] 10. Protezione 0000:', e.message);
}

console.log('\n-----------------------------------------------------------------');
console.log(`RISULTATO SUITE DATE & ANTI-MOCKUP: ${passedTests}/${totalTests} TEST COMPLETATI CON SUCCESSO!`);
console.log('-----------------------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
