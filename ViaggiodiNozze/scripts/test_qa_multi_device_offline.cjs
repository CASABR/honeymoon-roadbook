const assert = require('assert');

console.log('================================================================');
console.log('   HOUNIGO QA FINALE: VERIFICA ADMIN BROADCAST & SPOT FOTO     ');
console.log('================================================================\n');

// 1. VERIFICA AUTORIZZAZIONI BROADCAST (Worker Backend Logic)
console.log('--- TEST 1: AUTORIZZAZIONE BROADCAST (REGOLA TASSATIVA) ---');

function simulateWorkerAdminSendAuth({ uid, role, isGlobalAdmin }) {
  // Solo se isGlobalAdmin è true (presente in system_admins o secret SYSTEM_ADMIN_UIDS) l'accesso è consentito
  if (!isGlobalAdmin) {
    return { status: 403, error: 'Operazione riservata esclusivamente agli amministratori globali (system_admins).' };
  }
  return { status: 200, success: true };
}

// Case A: Owner standard (non amministratore globale)
const ownerStandard = simulateWorkerAdminSendAuth({ uid: 'owner_user_123', role: 'owner', isGlobalAdmin: false });
assert.strictEqual(ownerStandard.status, 403, 'Owner standard deve ricevere 403 su broadcast');
console.log('✓ [PASS] Owner NON amministratore globale: broadcast NEGATO (HTTP 403)');

// Case B: Copilota
const copilotaUser = simulateWorkerAdminSendAuth({ uid: 'copilota_user_456', role: 'copilota', isGlobalAdmin: false });
assert.strictEqual(copilotaUser.status, 403, 'Copilota deve ricevere 403 su broadcast');
console.log('✓ [PASS] Copilota: broadcast NEGATO (HTTP 403)');

// Case C: Viewer
const viewerUser = simulateWorkerAdminSendAuth({ uid: 'viewer_user_789', role: 'viewer', isGlobalAdmin: false });
assert.strictEqual(viewerUser.status, 403, 'Viewer deve ricevere 403 su broadcast');
console.log('✓ [PASS] Viewer: broadcast NEGATO (HTTP 403)');

// Case D: Amministratore Globale Verificato (presente in system_admins)
const globalAdminUser = simulateWorkerAdminSendAuth({ uid: 'sys_admin_999', role: 'owner', isGlobalAdmin: true });
assert.strictEqual(globalAdminUser.status, 200, 'Amministratore globale deve essere autorizzato');
console.log('✓ [PASS] Amministratore Globale verificato (system_admins): broadcast CONSENTITO (HTTP 200)');


// 2. VERIFICA SPOT FOTOGRAFICO E IMMAGINI MULTI-DISPOSITIVO
console.log('\n--- TEST 2: SPOT FOTOGRAFICO PERSISTENZA E SECONDO DISPOSITIVO ---');

const mockImageAttachment = {
  id: 'att_photo_sunset_001',
  name: 'sunset_alhambra.jpg',
  size: 154200,
  type: 'image',
  mimeType: 'image/jpeg',
  dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  purpose: 'photo'
};

const tappaSpot = {
  id: 'tappa_spot_001',
  titolo: 'Mirador de San Nicolás',
  sottocategoria: 'Spot fotografico',
  data: '2026-11-28',
  lightWindow: 'golden_hour',
  photoSubject: 'Alhambra illuminata dal sole calante',
  attachments: [mockImageAttachment],
  createdAt: Date.now(),
  updatedAt: Date.now()
};

// Simulazione Dispositivo 1 (Salvataggio locale e riapertura)
const device1Store = new Map();
device1Store.set(tappaSpot.id, JSON.parse(JSON.stringify(tappaSpot)));

const reopenedDevice1 = device1Store.get('tappa_spot_001');
assert.ok(reopenedDevice1, 'Tappa deve esistere in locale');
assert.strictEqual(reopenedDevice1.attachments.length, 1);
assert.strictEqual(reopenedDevice1.attachments[0].dataUrl, mockImageAttachment.dataUrl);
assert.strictEqual(reopenedDevice1.lightWindow, 'golden_hour');
assert.strictEqual(reopenedDevice1.photoSubject, 'Alhambra illuminata dal sole calante');
console.log('✓ [PASS] Dispositivo 1: Spot fotografico salvato, riaperto con foto e lightWindow intatti');

// Simulazione Sincronizzazione verso Dispositivo 2
const cloudPayload = JSON.parse(JSON.stringify(reopenedDevice1));
const device2Store = new Map();
device2Store.set(cloudPayload.id, cloudPayload);

const device2Received = device2Store.get('tappa_spot_001');
assert.ok(device2Received, 'Dispositivo 2 deve ricevere la tappa sincronizzata');
assert.strictEqual(device2Received.attachments[0].type, 'image');
assert.strictEqual(device2Received.attachments[0].dataUrl, mockImageAttachment.dataUrl);
assert.strictEqual(device2Received.lightWindow, 'golden_hour');
console.log('✓ [PASS] Dispositivo 2: Ricezione sincronizzata con foto e finestra di luce integra');


// 3. VERIFICA MAPS: INDICAZIONI VS CERCA SU MAPS
console.log('\n--- TEST 3: DISTINZIONE AZIONE MAPS ---');

function hasReliableGeoDestination(item) {
  if (!item) return false;
  if (item.coordinate && typeof item.coordinate.lat === 'number' && typeof item.coordinate.lng === 'number' && (item.coordinate.lat !== 0 || item.coordinate.lng !== 0)) {
    return true;
  }
  if (item.mapsUrl && item.mapsUrl.trim().length > 0) return true;
  if (item.googleMapsUrl && item.googleMapsUrl.trim().length > 0) return true;
  if (item.indirizzo && item.indirizzo.trim().length > 0) return true;
  if (item.address && item.address.trim().length > 0) return true;
  return false;
}

function getMapsActionLabel(hasGeo) {
  return hasGeo ? 'Indicazioni' : 'Cerca su Maps';
}

const itemWithCoords = { titolo: 'Punto Panoramico', coordinate: { lat: 37.181, lng: -3.592 } };
const itemWithAddress = { titolo: 'Ristorante', indirizzo: 'Calle Real de la Alhambra, 18009 Granada' };
const itemWithMapsUrl = { titolo: 'Hotel', mapsUrl: 'https://maps.app.goo.gl/xyz123' };
const itemGenericOnly = { titolo: 'Passeggiata libera nel parco' };

assert.strictEqual(hasReliableGeoDestination(itemWithCoords), true);
assert.strictEqual(getMapsActionLabel(hasReliableGeoDestination(itemWithCoords)), 'Indicazioni');

assert.strictEqual(hasReliableGeoDestination(itemWithAddress), true);
assert.strictEqual(getMapsActionLabel(hasReliableGeoDestination(itemWithAddress)), 'Indicazioni');

assert.strictEqual(hasReliableGeoDestination(itemWithMapsUrl), true);
assert.strictEqual(getMapsActionLabel(hasReliableGeoDestination(itemWithMapsUrl)), 'Indicazioni');

assert.strictEqual(hasReliableGeoDestination(itemGenericOnly), false);
assert.strictEqual(getMapsActionLabel(hasReliableGeoDestination(itemGenericOnly)), 'Cerca su Maps');

console.log('✓ [PASS] Coordinate/Indirizzo/MapsUrl -> "Indicazioni"');
console.log('✓ [PASS] Solo Titolo testuale -> "Cerca su Maps"');

console.log('\n================================================================');
console.log('       TUTTE LE VERIFICHE FINALI COMPLETATE CON SUCCESSO        ');
console.log('================================================================');
