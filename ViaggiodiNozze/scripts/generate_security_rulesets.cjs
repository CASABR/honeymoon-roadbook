/**
 * HOUNIGO — GENERATORE CONFIGURAZIONI REGOLE DI SICUREZZA
 * 
 * Deriva da firestore.rules (master di produzione) i 3 ruleset specializzati:
 * 1. firestore.rules.lockdown:
 *    - Congelamento totale 0000 (scritture bloccate, letture riservate a privileged).
 *    - Tutti gli altri viaggi e collezioni di sistema (users, push, admins, invites, gps) intatti.
 * 2. firestore.rules.rollback:
 *    - Rollback restrittivo: le letture su 0000 rimangono protette per i privilegiati finché
 *      non si verifica la bonifica; le scritture sono sbloccate per consentire interventi.
 *    - Tutti gli altri viaggi e collezioni di sistema intatti.
 * 3. firestore.rules.candidate:
 *    - Regole definitive post-migrazione: i Viewer possono leggere le card condivise (sanitizzate).
 *    - La cassaforte private_credentials e i documenti riservati sono accessibili solo ai privileged.
 *    - Schema Guard attivo su tutte le scritture.
 *    - Tutti gli altri viaggi e collezioni di sistema intatti.
 */

const fs = require('fs');
const path = require('path');

const baseRulesPath = path.resolve(__dirname, '..', 'firestore.rules');
const baseRules = fs.readFileSync(baseRulesPath, 'utf8').replace(/\r\n/g, '\n');

const privilegedHelper = `    // Verifica se l'utente e membro privilegiato (owner o copilota)
    function isTripPrivilegedMember(tripId) {
      return isSignedIn() && (
        isTripOwner(tripId)
        ||
        (exists(/databases/$(database)/documents/trips/$(tripId)/members/$(request.auth.uid))
         && get(/databases/$(database)/documents/trips/$(tripId)/members/$(request.auth.uid)).data.get('role', '') in ['owner', 'copilota'])
        ||
        (request.resource != null && existsAfter(/databases/$(database)/documents/trips/$(tripId)/members/$(request.auth.uid))
         && getAfter(/databases/$(database)/documents/trips/$(tripId)/members/$(request.auth.uid)).data.get('role', '') in ['owner', 'copilota'])
      );
    }

    // Schema guard: blocca qualsiasi scrittura contenente chiavi sensibili
    function hasNoSensitiveKeys(data) {
      return !data.keys().hasAny([
        'pinCode', 'codiceAccesso', 'keyboxCode',
        'bookingCode', 'pnr', 'codicePrenotazione', 'conferma', 'bookingReference',
        'ticketUrl', 'voucherUrl', 'bookingUrl', 'linkPrenotazione',
        'qrCode', 'qr', 'tavolo', 'posti', 'terminalGate',
        'cost', 'costo', 'budget', 'deposit', 'depositPaid', 'acconto', 'cauzione', 'amountPaid', 'paymentStatus',
        'noteCopilota', 'cancellazioneGratuitaEntro', 'attachments'
      ]);
    }
`;

function buildLockdownRules() {
  let content = baseRules;

  // 1. Inserisci helper privilegiati dopo isGlobalAdmin
  const adminEnd = 'function isGlobalAdmin() {';
  const idxAdmin = content.indexOf(adminEnd);
  const idxAdminClose = content.indexOf('    }', idxAdmin) + 5;
  content = content.slice(0, idxAdminClose) + '\n\n' + privilegedHelper + content.slice(idxAdminClose);

  // 2. Modifica allow get su /trips/{tripId}
  content = content.replace(
    `      allow get: if isSignedIn() && (\n        isTripMember(tripId)\n        || isGlobalAdmin()\n      );`,
    `      allow get: if isSignedIn() && (\n        (tripId == '0000' ? isTripPrivilegedMember(tripId) : isTripMember(tripId))\n        || isGlobalAdmin()\n      );`
  );

  // 3. Modifica allow update su /trips/{tripId} (congelamento 0000)
  content = content.replace(
    `      allow update: if isSignedIn()`,
    `      allow update: if tripId != '0000'\n                    && isSignedIn()`
  );

  // 4. Modifica allow create su members (congelamento 0000)
  content = content.replace(
    `        allow create: if isSignedIn()`,
    `        allow create: if tripId != '0000'\n                        && isSignedIn()`
  );
  content = content.replace(
    `        allow update: if isSignedIn()`,
    `        allow update: if tripId != '0000'\n                        && isSignedIn()`
  );

  // 5. Sottocollezioni di 0000
  const subcolMatchOld = `      match /{subcol}/{docId} {\n        allow read, write: if subcol in [\n                               'tappe', 'attivita', 'alloggi', 'trasporti', 'spese',\n                               'documenti', 'note', 'bagagli', 'giorni', 'settings',\n                               'ristoranti', 'shopping', 'locks', 'devices'\n                             ]\n                             && isTripMember(tripId);\n      }`;
  
  const subcolLockdown = `      // 1.2.B CASSAFORTE CREDENZIALI PRIVATE E COLLEZIONI RISERVATE (P0)
      match /private_credentials/{docId} {
        allow read: if isTripPrivilegedMember(tripId);
        allow write: if isTripPrivilegedMember(tripId) && tripId != '0000';
      }
      match /documenti/{docId} {
        allow read: if isTripPrivilegedMember(tripId);
        allow write: if isTripPrivilegedMember(tripId) && tripId != '0000';
      }
      match /spese/{docId} {
        allow read: if isTripPrivilegedMember(tripId);
        allow write: if isTripPrivilegedMember(tripId) && tripId != '0000';
      }
      match /note/{docId} {
        allow read: if isTripPrivilegedMember(tripId);
        allow write: if isTripPrivilegedMember(tripId) && tripId != '0000';
      }

      // 1.3 SOTTOCOLLEZIONI CONDIVISE
      match /{subcol}/{docId} {
        allow read: if subcol in [
                         'tappe', 'attivita', 'alloggi', 'trasporti',
                         'bagagli', 'giorni', 'settings', 'ristoranti', 'shopping',
                         'locks', 'devices'
                       ]
                       && (tripId == '0000' ? isTripPrivilegedMember(tripId) : isTripMember(tripId));

        allow create, update: if subcol in [
                                   'tappe', 'attivita', 'alloggi', 'trasporti',
                                   'bagagli', 'giorni', 'settings', 'ristoranti', 'shopping',
                                   'locks', 'devices'
                                 ]
                                 && tripId != '0000'
                                 && isTripPrivilegedMember(tripId)
                                 && hasNoSensitiveKeys(request.resource.data);

        allow delete: if subcol in [
                           'tappe', 'attivita', 'alloggi', 'trasporti',
                           'bagagli', 'giorni', 'settings', 'ristoranti', 'shopping',
                           'locks', 'devices'
                         ]
                         && tripId != '0000'
                         && isTripPrivilegedMember(tripId);
      }`;

  content = content.replace(subcolMatchOld, subcolLockdown);

  // 6. Congelamento live feed updates per 0000
  content = content.replace(
    `        allow create, update: if isTripMember(tripId) && validLiveUpdate(request.resource.data);`,
    `        allow create, update: if tripId != '0000' && isTripMember(tripId) && validLiveUpdate(request.resource.data);`
  );

  return content;
}

function buildRollbackRules() {
  let content = baseRules;

  // Inserisci helper
  const adminEnd = 'function isGlobalAdmin() {';
  const idxAdmin = content.indexOf(adminEnd);
  const idxAdminClose = content.indexOf('    }', idxAdmin) + 5;
  content = content.slice(0, idxAdminClose) + '\n\n' + privilegedHelper + content.slice(idxAdminClose);

  // Su 0000 le letture restano protette (Viewer bloccato finché non bonificato)
  content = content.replace(
    `      allow get: if isSignedIn() && (\n        isTripMember(tripId)\n        || isGlobalAdmin()\n      );`,
    `      allow get: if isSignedIn() && (\n        (tripId == '0000' ? isTripPrivilegedMember(tripId) : isTripMember(tripId))\n        || isGlobalAdmin()\n      );`
  );

  const subcolMatchOld = `      match /{subcol}/{docId} {\n        allow read, write: if subcol in [\n                               'tappe', 'attivita', 'alloggi', 'trasporti', 'spese',\n                               'documenti', 'note', 'bagagli', 'giorni', 'settings',\n                               'ristoranti', 'shopping', 'locks', 'devices'\n                             ]\n                             && isTripMember(tripId);\n      }`;

  // Rollback restrittivo:
  // - private_credentials / doc / spese / note restano confinati ai privilegiati
  // - subcol condivise: lettura protetta su 0000 (solo privileged), ma scritture sbloccate per permettere all'owner di operare
  const subcolRollback = `      // 1.2.B CASSAFORTE CREDENZIALI PRIVATE E COLLEZIONI RISERVATE (ROLLBACK SICURO)
      match /private_credentials/{docId} {
        allow read, write: if isTripPrivilegedMember(tripId);
      }
      match /documenti/{docId} {
        allow read, write: if isTripPrivilegedMember(tripId);
      }
      match /spese/{docId} {
        allow read, write: if isTripPrivilegedMember(tripId);
      }
      match /note/{docId} {
        allow read, write: if isTripPrivilegedMember(tripId);
      }

      // 1.3 SOTTOCOLLEZIONI CONDIVISE (ROLLBACK RESTRITTIVO: VIEWER BLOCCATO SU 0000 PER EVITARE RIESPOSIZIONE)
      match /{subcol}/{docId} {
        allow read: if subcol in [
                         'tappe', 'attivita', 'alloggi', 'trasporti',
                         'bagagli', 'giorni', 'settings', 'ristoranti', 'shopping',
                         'locks', 'devices'
                       ]
                       && (tripId == '0000' ? isTripPrivilegedMember(tripId) : isTripMember(tripId));

        allow create, update, delete: if subcol in [
                                           'tappe', 'attivita', 'alloggi', 'trasporti',
                                           'bagagli', 'giorni', 'settings', 'ristoranti', 'shopping',
                                           'locks', 'devices'
                                         ]
                                         && isTripPrivilegedMember(tripId);
      }`;

  content = content.replace(subcolMatchOld, subcolRollback);
  return content;
}

function buildCandidateRules() {
  let content = baseRules;

  // Inserisci helper
  const adminEnd = 'function isGlobalAdmin() {';
  const idxAdmin = content.indexOf(adminEnd);
  const idxAdminClose = content.indexOf('    }', idxAdmin) + 5;
  content = content.slice(0, idxAdminClose) + '\n\n' + privilegedHelper + content.slice(idxAdminClose);

  const subcolMatchOld = `      match /{subcol}/{docId} {\n        allow read, write: if subcol in [\n                               'tappe', 'attivita', 'alloggi', 'trasporti', 'spese',\n                               'documenti', 'note', 'bagagli', 'giorni', 'settings',\n                               'ristoranti', 'shopping', 'locks', 'devices'\n                             ]\n                             && isTripMember(tripId);\n      }`;

  // Candidate definitivo post-migrazione:
  // - I Viewer possono leggere le card condivise (perché i dati sensibili sono stati estratti e sanificati!)
  // - Le scritture sulle subcol richiedono privileged + hasNoSensitiveKeys (Schema Guard)
  // - private_credentials, documenti, spese, note accessibili solo a privileged
  const subcolCandidate = `      // 1.2.B CASSAFORTE CREDENZIALI PRIVATE E COLLEZIONI RISERVATE (DEFINITIVO)
      match /private_credentials/{docId} {
        allow read, write: if isTripPrivilegedMember(tripId);
      }
      match /documenti/{docId} {
        allow read, write: if isTripPrivilegedMember(tripId);
      }
      match /spese/{docId} {
        allow read, write: if isTripPrivilegedMember(tripId);
      }
      match /note/{docId} {
        allow read, write: if isTripPrivilegedMember(tripId);
      }

      // 1.3 SOTTOCOLLEZIONI CONDIVISE (DATI SANIFICATI: LETTURA MEMBRI APERTA, SCHEMA GUARD ATTIVO)
      match /{subcol}/{docId} {
        allow read: if subcol in [
                         'tappe', 'attivita', 'alloggi', 'trasporti',
                         'bagagli', 'giorni', 'settings', 'ristoranti', 'shopping',
                         'locks', 'devices'
                       ]
                       && isTripMember(tripId);

        allow create, update: if subcol in [
                                   'tappe', 'attivita', 'alloggi', 'trasporti',
                                   'bagagli', 'giorni', 'settings', 'ristoranti', 'shopping',
                                   'locks', 'devices'
                                 ]
                                 && isTripPrivilegedMember(tripId)
                                 && hasNoSensitiveKeys(request.resource.data);

        allow delete: if subcol in [
                           'tappe', 'attivita', 'alloggi', 'trasporti',
                           'bagagli', 'giorni', 'settings', 'ristoranti', 'shopping',
                           'locks', 'devices'
                         ]
                         && isTripPrivilegedMember(tripId);
      }`;

  content = content.replace(subcolMatchOld, subcolCandidate);
  return content;
}

// Genera e scrivi i tre file
const lockdownContent = buildLockdownRules();
const rollbackContent = buildRollbackRules();
const candidateContent = buildCandidateRules();

fs.writeFileSync(path.resolve(__dirname, '..', 'firestore.rules.lockdown'), lockdownContent, 'utf8');
fs.writeFileSync(path.resolve(__dirname, '..', 'firestore.rules.rollback'), rollbackContent, 'utf8');
fs.writeFileSync(path.resolve(__dirname, '..', 'firestore.rules.candidate'), candidateContent, 'utf8');

// Configurazione firebase.rollback.json
const rollbackFirebaseConfig = {
  firestore: {
    rules: "firestore.rules.rollback"
  },
  storage: {
    rules: "storage.rules"
  }
};
fs.writeFileSync(path.resolve(__dirname, '..', 'firebase.rollback.json'), JSON.stringify(rollbackFirebaseConfig, null, 2) + '\n', 'utf8');

console.log('✅ Rulesets generati con successo:');
console.log(' - firestore.rules.lockdown  (congelamento scoped 0000 + schema guard + parità collezioni)');
console.log(' - firestore.rules.rollback  (rollback restrittivo: viewer bloccato su 0000 per zero re-exposure)');
console.log(' - firestore.rules.candidate (candidate definitivo con schema guard + parità collezioni)');
console.log(' - firebase.rollback.json    (configurazione dedicata di rollback)');
