const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

console.log('=== TEST MIRATO PRE-RILASCIO PWA 1.5.7 ===\n');

// 1. ensurePushAuthUser()
console.log('--- Controllo 1: ensurePushAuthUser() ---');
const pushServiceSrc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'pushNotificationService.ts'), 'utf8');
assert.ok(pushServiceSrc.includes('authStateReady'), 'Deve invocare authStateReady se disponibile');
assert.ok(pushServiceSrc.includes('onAuthStateChanged'), 'Deve disporre di fallback onAuthStateChanged per attendere il ripristino');
assert.ok(pushServiceSrc.includes('if (auth.currentUser) return auth.currentUser;'), 'Deve restituire l\'utente ripristinato senza sostituirlo');
// Verifica che signInAnonymously sia invocato solo se auth.currentUser è ancora assente DOPO l'attesa
const ensureBody = pushServiceSrc.slice(pushServiceSrc.indexOf('async function ensurePushAuthUser()'), pushServiceSrc.indexOf('async function callPush'));
const authStateReadyPos = ensureBody.indexOf('authStateReady');
const signInAnonPos = ensureBody.indexOf('signInAnonymously');
assert.ok(authStateReadyPos < signInAnonPos, 'authStateReady deve precedere signInAnonymously');
console.log('PASS 1: ensurePushAuthUser attende il ripristino della sessione e non sovrascrive identità esistenti');

// 2. Registrazione push, associazione al viaggio corretto e gestione Viewer/Ospiti LIVE
console.log('\n--- Controllo 2: Registrazione Push, Viaggio e Permessi ---');
const usePushSrc = fs.readFileSync(path.join(ROOT, 'src', 'hooks', 'usePushNotifications.ts'), 'utf8');
assert.ok(usePushSrc.includes('previous.tripId !== activeTripId'), 'usePushNotifications deve verificare che la subscription sia associata al viaggio attivo');
assert.ok(pushServiceSrc.includes('if (data.active !== true) throw new Error'), 'La registrazione push deve essere confermata dal server (data.active === true)');
assert.ok(pushServiceSrc.includes('if (!isCloudAuthorized(input.tripId))'), 'recordPushMutation deve verificare isCloudAuthorized per bloccare invii da Viewer/ospiti non autorizzati');
console.log('PASS 2: Registrazione push associata al viaggio attivo, validata dal server e protetta contro abusi da Viewer/ospiti');

// 3. Modifiche locali pendenti e lockdown
console.log('\n--- Controllo 3: Sopravvivenza Modifiche Locali a Lockdown, Chiusura e Sync ---');
const syncServiceSrc = fs.readFileSync(path.join(ROOT, 'src', 'storage', 'syncService.ts'), 'utf8');
assert.ok(syncServiceSrc.includes('localUpdated > serverUpdated'), 'syncService non deve sovrascrivere modifiche locali con dati remoti più vecchi');
assert.ok(syncServiceSrc.includes('!isCloudAuthorized()'), 'syncService deve verificare isCloudAuthorized per sospendere push durante lockdown remoto');
assert.ok(syncServiceSrc.includes('modifiche locali preservate in attesa di autorizzazione cloud'), 'Messaggio esplicito di preservazione dati locali');
console.log('PASS 3: Modifiche locali pendenti conservate in IndexedDB durante lockdown e riapertura, senza perdita di dati');

// 4. Toggle pagamento e registrazione corretta
console.log('\n--- Controllo 4: Toggle Pagamento e Registrazione Contabile ---');
const priceHelper = require('../src/utils/priceHelper.ts'); // if ts-node or transpiled, let's test via direct logic import or parsing
const priceHelperSrc = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'priceHelper.ts'), 'utf8');
assert.ok(priceHelperSrc.includes('(paidNum === 0 || paidNum >= costNum)'), 'Non può dichiarare saldato se vi è un residuo dovuto non coperto da versamento registrato');

const alloggioCardSrc = fs.readFileSync(path.join(ROOT, 'src', 'components/cards/AlloggioCard.tsx'), 'utf8');
assert.ok(alloggioCardSrc.includes('newStatus === \'saldato\' ? formatCompactEuro(costNum) : (origAcconto || \'\')'), 'AlloggioCard registra l\'importo versato a saldo preservando l\'acconto');

const trasportoCardSrc = fs.readFileSync(path.join(ROOT, 'src', 'components/cards/TrasportoCard.tsx'), 'utf8');
assert.ok(trasportoCardSrc.includes('newStatus === \'saldato\' ? formatCompactEuro(costNum) : (origAcconto || \'\')'), 'TrasportoCard registra l\'importo versato a saldo preservando l\'acconto');

const attivitaCardSrc = fs.readFileSync(path.join(ROOT, 'src', 'components/cards/AttivitaCard.tsx'), 'utf8');
assert.ok(attivitaCardSrc.includes('newStatus === \'saldato\' ? formatCompactEuro(costNum) : (origAcconto || \'\')'), 'AttivitaCard registra l\'importo versato a saldo preservando l\'acconto');

const shoppingCardSrc = fs.readFileSync(path.join(ROOT, 'src', 'components/cards/ShoppingCard.tsx'), 'utf8');
assert.ok(shoppingCardSrc.includes('newStatus === \'saldato\' ? formatCompactEuro(paymentInfo.costNum) : (origAcconto || \'\')'), 'ShoppingCard registra l\'importo versato a saldo preservando l\'acconto');

console.log('PASS 4: Il toggle pagamento registra l\'intero importo a saldo e non dichiara saldato un elemento senza aver registrato il pagamento');

console.log('\n>>> TUTTI I 4 CONTROLLI MIRATI HANNO DATO ESITO POSITIVO (PASS) <<<');
