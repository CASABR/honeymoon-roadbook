const assert = require('assert');
const fs = require('fs');

const read = (path) => fs.readFileSync(path, 'utf8');

const card = read('src/components/cards/PreDeparturePhotoCard.tsx');
const journal = read('src/services/photoJournalService.ts');
const oggi = read('src/views/OggiView.tsx');
const gmail = read('src/services/gmailOAuth.ts');
const gmailRow = read('src/components/common/GmailConnectionRow.tsx');
const smartInsert = read('src/components/modals/SmartInsertModal.tsx');
const live = read('src/views/altro/LiveView.tsx');

assert(card.includes("localDate() !== startDate"), 'Il suggerimento deve apparire solo nel giorno 1');
assert(card.includes('!canEdit'), 'Il suggerimento deve rispettare i permessi di modifica');
assert(card.includes('isPredeparturePromptDismissed(tripId, userId)'), 'La chiusura deve essere per viaggio e utente');
assert(journal.includes('`${DISMISS_PREFIX}:${tripId}:${userId}`'), 'La chiave di chiusura deve includere viaggio e utente');
assert(card.includes('processFileForAttachment(file)'), 'La foto deve usare il servizio allegati esistente');
assert(journal.includes("const GALLERY_KEY = 'hounigo_live_gallery'"), 'La foto deve entrare nella galleria diario esistente');
assert(card.includes('onClick={handleShare}') && card.includes('onClick={handleRemoveShare}'), 'Condivisione e rimozione LIVE devono essere esplicite');
assert(card.includes('deleteLiveUpdate(tripId, photo.liveUpdateId)'), 'La condivisione LIVE deve essere rimovibile');
assert(live.includes('handleUploadPhoto'), 'Il caricamento foto manuale deve restare disponibile');

assert.strictEqual((gmail.match(/https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly/g) || []).length, 1, 'Deve esistere un solo scope Gmail readonly centralizzato');
assert(!gmail.includes('gmail.modify') && !gmail.includes('mail.google.com'), 'Non devono essere richiesti scope Gmail più ampi');
assert(smartInsert.includes('provider.addScope(GMAIL_READONLY_SCOPE)'), 'L’import Gmail deve usare lo scope readonly centralizzato');
assert(gmailRow.includes('Il login Google non autorizza la lettura delle email.'), 'Login Google e accesso Gmail devono essere distinti');
assert(smartInsert.includes('Carica PDF/foto') && smartInsert.includes('Incolla testo email'), 'I fallback devono essere immediatamente proposti dopo il rifiuto Gmail');
assert(smartInsert.includes('extractFromAttachment') && smartInsert.includes('extractFromText'), 'I fallback devono riusare l’estrazione AI esistente');
assert(gmailRow.includes('Per la verifica futura:') && gmailRow.includes('Per un inoltro email dedicato futuro:'), 'I passaggi futuri OAuth e inoltro devono essere documentati');
assert(oggi.includes('<PreDeparturePhotoCard'), 'La card pre-partenza deve essere montata nella vista Oggi');

console.log('✓ Foto pre-partenza, LIVE reversibile e fallback Gmail verificati.');
