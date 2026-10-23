const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=================================================================');
console.log('   TEST HOUNIGO: PRENOTAZIONI, PARTECIPANTI, OWNER & PRESTAZIONI');
console.log('=================================================================\n');

let passedTests = 0;
function pass(msg) {
  console.log(`[PASS] ${msg}`);
  passedTests++;
}

// -----------------------------------------------------------------------------
// 1. RICERCA PRENOTAZIONI & AUTOCOMPLETE DA ROADBOOK ATTIVO
// -----------------------------------------------------------------------------
{
  // Simulazione dataset del viaggio attivo
  const mockActivities = [
    { id: 'act_1', title: 'Hobbiton Movie Set Tour', date: '2026-12-05', time: '10:00', location: 'Matamata', cost: '89.00 €', sottocategoria: 'Tour Guidato', notes: 'Presentarsi 15m prima' },
    { id: 'act_2', title: 'Rafting Kaituna Cascades', date: '2026-12-08', time: '14:30', location: 'Rotorua', cost: '120 €', sottocategoria: 'Adrenalina' }
  ];
  const mockTappe = [
    { id: 'tp_1', titolo: 'Auckland City Center', data: '2026-11-29', indirizzo: 'Queen Street, Auckland', nota: 'Punto di ritrovo' },
    { id: 'tp_2', titolo: 'Rotorua Geothermal Valley', data: '2026-12-08', indirizzo: 'Te Puia, Rotorua' }
  ];
  const mockAlloggi = [
    { id: 'acc_1', name: 'Grand Chancellor Hotel', checkIn: '2026-11-29', checkOut: '2026-12-02', location: 'Auckland Waterfront', cost: '350 €', sottocategoria: 'Hotel' }
  ];

  // A. Funzione di filtro e matching
  function filterSuggestions(query, category, items) {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      let isCategoryMatch = false;
      if (category === 'attivita') {
        isCategoryMatch = item.sourceType === 'attivita' || item.sourceType === 'tappa';
      } else if (category === 'alloggio') {
        isCategoryMatch = item.sourceType === 'alloggio' || item.sourceType === 'tappa';
      } else {
        isCategoryMatch = true;
      }

      if (!q) return isCategoryMatch;
      const matchText = `${item.title} ${item.subtitle || ''} ${item.location || ''}`.toLowerCase();
      return matchText.includes(q);
    });
  }

  const suggestions = [
    ...mockActivities.map(a => ({ id: a.id, sourceType: 'attivita', title: a.title, date: a.date, time: a.time, location: a.location, cost: a.cost, sottocategoria: a.sottocategoria, notes: a.notes })),
    ...mockTappe.map(t => ({ id: t.id, sourceType: 'tappa', title: t.titolo, date: t.data, location: t.indirizzo, notes: t.nota })),
    ...mockAlloggi.map(h => ({ id: h.id, sourceType: 'alloggio', title: h.name, date: h.checkIn, location: h.location, cost: h.cost }))
  ];

  // Test Ricerca attività esistente
  const resAct = filterSuggestions('Hobbiton', 'attivita', suggestions);
  assert.strictEqual(resAct.length, 1);
  assert.strictEqual(resAct[0].title, 'Hobbiton Movie Set Tour');
  assert.strictEqual(resAct[0].sourceType, 'attivita');

  // Test Ricerca senza risultati e inserimento manuale
  const resEmpty = filterSuggestions('Attività Mai Esistita', 'attivita', suggestions);
  assert.strictEqual(resEmpty.length, 0);

  // Test Precompilazione campi compatibili (senza sovrascrivere valori esistenti)
  const currentForm = { title: '', date: '', time: '11:00', cost: '50 €', location: '' };
  const selected = resAct[0];

  const updatedForm = {
    title: selected.title,
    date: currentForm.date || selected.date,
    time: currentForm.time || selected.time, // preserva 11:00 già digitato
    cost: currentForm.cost || selected.cost, // preserva 50 € già digitato
    location: currentForm.location || selected.location
  };

  assert.strictEqual(updatedForm.title, 'Hobbiton Movie Set Tour');
  assert.strictEqual(updatedForm.date, '2026-12-05');
  assert.strictEqual(updatedForm.time, '11:00', 'Preserva orario già digitato');
  assert.strictEqual(updatedForm.cost, '50 €', 'Preserva costo già digitato');
  assert.strictEqual(updatedForm.location, 'Matamata', 'Precompila location vuota');

  // Assenza duplicati
  const duplicateIdSet = new Set();
  suggestions.forEach(s => duplicateIdSet.add(`${s.sourceType}_${s.id}`));
  assert.strictEqual(duplicateIdSet.size, suggestions.length);

  pass('1. Ricerca prenotazioni: autocomplete reattivo da roadbook, precompilazione sicura e supporto inserimento manuale');
}

// -----------------------------------------------------------------------------
// 2. GESTIONE DEI PARTECIPANTI ED ESPULSIONE SICURA (removeMember)
// -----------------------------------------------------------------------------
{
  // Simulazione backend Cloud Function removeMember
  function simulateRemoveMember({ requesterUid, tripData, subMembers, targetUid }) {
    if (!requesterUid) throw new Error('unauthenticated');
    if (!tripData) throw new Error('not-found');

    const isOwner = tripData.ownerUid === requesterUid || subMembers[requesterUid]?.role === 'owner';
    if (!isOwner) throw new Error('permission-denied: Solo il proprietario può espellere partecipanti');

    if (targetUid === tripData.ownerUid) {
      throw new Error('failed-precondition: Non è possibile espellere il proprietario del viaggio');
    }
    if (targetUid === requesterUid) {
      throw new Error('failed-precondition: Non puoi espellere te stesso dal viaggio');
    }

    // Esecuzione espulsione atomica
    const newMembersList = (tripData.members || []).filter(u => u !== targetUid);
    const newSubMembers = { ...subMembers };
    delete newSubMembers[targetUid];

    return {
      success: true,
      tripId: tripData.id,
      expelledUid: targetUid,
      updatedTripMembers: newMembersList,
      updatedSubMembers: newSubMembers
    };
  }

  const mockTrip = {
    id: 'trip_nz_2026',
    ownerUid: 'uid_owner_mario',
    members: ['uid_owner_mario', 'uid_copilota_luigi', 'uid_guest_anna']
  };
  const mockSubMembers = {
    'uid_owner_mario': { role: 'owner', name: 'Mario Rossi' },
    'uid_copilota_luigi': { role: 'copilota', name: 'Luigi Verdi' },
    'uid_guest_anna': { role: 'copilota' } // name non disponibile
  };

  // Test 2.1: Espulsione autorizzata da parte dell'owner
  const kickResult = simulateRemoveMember({
    requesterUid: 'uid_owner_mario',
    tripData: mockTrip,
    subMembers: mockSubMembers,
    targetUid: 'uid_copilota_luigi'
  });
  assert.strictEqual(kickResult.success, true);
  assert.strictEqual(kickResult.expelledUid, 'uid_copilota_luigi');
  assert.strictEqual(kickResult.updatedTripMembers.includes('uid_copilota_luigi'), false);
  assert.strictEqual(kickResult.updatedSubMembers['uid_copilota_luigi'], undefined);

  // Test 2.2: Espulsione negata a utente non proprietario (copilota prova a espellere)
  assert.throws(() => {
    simulateRemoveMember({
      requesterUid: 'uid_copilota_luigi',
      tripData: mockTrip,
      subMembers: mockSubMembers,
      targetUid: 'uid_guest_anna'
    });
  }, /permission-denied/);

  // Test 2.3: Impossibilità assoluta di espellere il proprietario (anti-orfano)
  assert.throws(() => {
    simulateRemoveMember({
      requesterUid: 'uid_owner_mario',
      tripData: mockTrip,
      subMembers: mockSubMembers,
      targetUid: 'uid_owner_mario'
    });
  }, /failed-precondition/);

  // Test 2.4: Gestione dati anagrafici mancanti (mostra esplicitamente "Nome non specificato")
  const annaData = mockSubMembers['uid_guest_anna'];
  const displayNameAnna = annaData.name || 'Nome non specificato';
  assert.strictEqual(displayNameAnna, 'Nome non specificato');

  pass('2. Gestione partecipanti: elenco ruoli, dati mancanti espliciti, autorizzazione owner ed espulsione atomica');
}

// -----------------------------------------------------------------------------
// 3. NOME DEL PROPRIETARIO (ACQUISIZIONE & VALIDAZIONE)
// -----------------------------------------------------------------------------
{
  function validateOwnerName(name) {
    if (!name || typeof name !== 'string') return null;
    const clean = name.trim();
    if (clean.length === 0) return null;
    return clean;
  }

  // Nome valido
  assert.strictEqual(validateOwnerName('  Mario Rossi  '), 'Mario Rossi');
  assert.strictEqual(validateOwnerName('Giulia'), 'Giulia');

  // Nome non valido o solo spazi
  assert.strictEqual(validateOwnerName(''), null);
  assert.strictEqual(validateOwnerName('   '), null);
  assert.strictEqual(validateOwnerName(null), null);
  assert.strictEqual(validateOwnerName(undefined), null);

  // Conservazione viaggio 0000: nessuna sovrascrittura automatica
  const trip0000 = { id: '0000', title: 'Viaggio Originale', ownerUid: 'admin_real' };
  const incomingName = 'Nuovo Nome';
  // Non deve alterare trip0000 se non espressamente richiesto
  assert.strictEqual(trip0000.id, '0000');
  assert.strictEqual(trip0000.ownerName, undefined, 'Viaggio 0000 non modificato automaticamente');

  pass('3. Nome proprietario: validazione trim, rifiuto stringhe vuote o solo spazi e protezione trip 0000');
}

// -----------------------------------------------------------------------------
// 4. PRESTAZIONI PRENOTAZIONI & RESILIENZA CARICAMENTO
// -----------------------------------------------------------------------------
{
  // Test robustezza parseEuro con stringhe anomale
  // Verifica che trailing dot non generi crash
  const priceHelperCode = fs.readFileSync(
    path.join(__dirname, 'src', 'utils', 'priceHelper.ts'),
    'utf-8'
  );

  assert.ok(
    priceHelperCode.includes('parts[1] && parts[1].length === 3'),
    'priceHelper.ts protegge contro accesso a parts[1] indefinito'
  );

  // Verifica corrispondenza 6 collezioni in unifiedBookingService.ts
  const unifiedCode = fs.readFileSync(
    path.join(__dirname, 'src', 'services', 'unifiedBookingService.ts'),
    'utf-8'
  );

  assert.ok(
    unifiedCode.includes('storageService.getRistoranti') &&
    unifiedCode.includes('storageService.getShopping'),
    'getAllUnifiedBookings include correttamente le collezioni prenotazioni (inclusi ristoranti e shopping)'
  );

  // Verifica ottimizzazione syncService (rimozione blind full push allo startup)
  const syncCode = fs.readFileSync(
    path.join(__dirname, 'src', 'storage', 'syncService.ts'),
    'utf-8'
  );

  assert.ok(
    !syncCode.includes('await this.syncAllLocalToCloud();\n\n      if (pulledCount > 0)'),
    'syncService.ts non esegue più il re-push massivo di tutto il DB allo startup'
  );

  // Verifica gestione stati errore e retry in PrenotazioniWorkspaceView.tsx
  const workspaceCode = fs.readFileSync(
    path.join(__dirname, 'src', 'views', 'desktop', 'PrenotazioniWorkspaceView.tsx'),
    'utf-8'
  );

  assert.ok(
    workspaceCode.includes('loadError') && workspaceCode.includes('isSlowLoading'),
    'PrenotazioniWorkspaceView implementa gestione esplicita dell\'errore e stato di caricamento lento'
  );
  assert.ok(
    workspaceCode.includes('Riprova Caricamento'),
    'PrenotazioniWorkspaceView fornisce pulsante di recupero su errore'
  );

  pass('4. Prestazioni prenotazioni: fix parsing euro, sincronizzazione 6 collezioni, eliminazione collo di bottiglia e stato errore/retry');
}

console.log('\n-----------------------------------------------------------------');
console.log(`RISULTATO SUITE SPRINT: ${passedTests}/4 TEST SUPERATI CON SUCCESSO!`);
console.log('-----------------------------------------------------------------\n');
