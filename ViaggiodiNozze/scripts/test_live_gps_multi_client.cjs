const assert = require('node:assert/strict');

// In-memory simulation of Firestore & multi-client behavior matching liveGpsService & firestore.rules
class MockFirestore {
  constructor() {
    this.data = new Map();
    this.subscribers = new Map();
  }

  set(path, docData) {
    this.data.set(path, { ...docData });
    this.notify(path);
  }

  get(path) {
    const val = this.data.get(path);
    return val ? { exists: () => true, data: () => ({ ...val }) } : { exists: () => false, data: () => null };
  }

  notify(path) {
    const subs = this.subscribers.get(path) || [];
    const val = this.get(path);
    for (const cb of subs) {
      cb(val);
    }
  }

  subscribe(path, callback) {
    if (!this.subscribers.has(path)) this.subscribers.set(path, []);
    this.subscribers.get(path).push(callback);
    callback(this.get(path));
    return () => {
      const arr = this.subscribers.get(path) || [];
      this.subscribers.set(path, arr.filter(c => c !== callback));
    };
  }
}

const db = new MockFirestore();
const TRIP_ID = 'test-trip-001';
const OWNER_UID = 'owner-123';
const COPILOT_UID = 'copilot-456';
const GUEST_UID = 'guest-789';

const LEASE_PATH = `live_feeds/${TRIP_ID}/gps_control/current`;
const LOCATION_PATH = `live_feeds/${TRIP_ID}/locations/current`;
const TRIP_PATH = `trips/${TRIP_ID}`;

// Setup trip
db.set(TRIP_PATH, {
  ownerUid: OWNER_UID,
  collaborators: { [COPILOT_UID]: 'copilota' }
});

// Emulated Service methods
const createClientService = (userUid, deviceId, role) => {
  return {
    uid: userUid,
    deviceId,
    role,

    assignGuide(holderUid, holderDeviceId) {
      const trip = db.get(TRIP_PATH);
      if (!trip.exists() || trip.data().ownerUid !== this.uid) {
        throw new Error('Solo l’Organizzatore può assegnare la guida GPS.');
      }
      db.set(LEASE_PATH, {
        holderUid,
        holderDeviceId,
        status: 'active',
        updatedAt: Date.now(),
        expiresAt: Date.now() + 23 * 3600 * 1000
      });
    },

    publishLocation(lat, lng, accuracy = 10, city = 'Test City') {
      const leaseDoc = db.get(LEASE_PATH);
      if (!leaseDoc.exists()) throw new Error('Nessuna guida GPS assegnata.');
      const lease = leaseDoc.data();

      // Rules verification
      if (lease.holderUid !== this.uid || lease.holderDeviceId !== this.deviceId || lease.status !== 'active') {
        throw new Error('Questo dispositivo non detiene la guida GPS attiva.');
      }

      const locDoc = db.get(LOCATION_PATH);
      if (locDoc.exists()) {
        const lastUpdate = locDoc.data().updatedAt;
        if (Date.now() - lastUpdate < 16_000) {
          // Throttled: skip write gracefully
          return false;
        }
      }

      db.set(LOCATION_PATH, {
        lat,
        lng,
        accuracy,
        city,
        country: 'Italy',
        updatedAt: Date.now(),
        publisherDeviceId: this.deviceId,
        status: 'active'
      });
      return true;
    },

    pauseOrStop(status) {
      const leaseDoc = db.get(LEASE_PATH);
      if (!leaseDoc.exists()) throw new Error('Nessuna guida attiva.');
      const lease = leaseDoc.data();
      const isOwner = this.uid === OWNER_UID;
      const isHolder = lease.holderUid === this.uid && lease.holderDeviceId === this.deviceId;
      if (!isOwner && !isHolder) {
        throw new Error('Non autorizzato a modificare la condivisione.');
      }

      db.set(LEASE_PATH, { ...lease, status, updatedAt: Date.now() });
      const locDoc = db.get(LOCATION_PATH);
      if (locDoc.exists()) {
        db.set(LOCATION_PATH, { ...locDoc.data(), status, updatedAt: Date.now() });
      }
    },

    subscribeLocation(isPrivileged, callback) {
      return db.subscribe(LOCATION_PATH, snapshot => {
        if (!snapshot.exists()) return callback(null, false);
        const data = snapshot.data();
        const isStale = Date.now() - data.updatedAt >= 120_000;
        if (isPrivileged) {
          callback(data, isStale);
        } else {
          callback(data.status === 'active' && !isStale ? data : null, isStale);
        }
      });
    }
  };
};

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`[PASS ${String(passed).padStart(2, '0')}] ${name}`);
};

console.log('\n=== HOUNIGO: LIVE GPS MULTI-CLIENT SIMULATION ===\n');

const clientOwner = createClientService(OWNER_UID, 'device-owner-A', 'owner');
const clientCopilot = createClientService(COPILOT_UID, 'device-copilot-B', 'copilota');
const clientGuest = createClientService(GUEST_UID, 'device-guest-C', 'viewer');

test('Stato iniziale: nessuna guida e nessuna posizione pubblica', () => {
  let guestLoc = undefined;
  const unsub = clientGuest.subscribeLocation(false, loc => { guestLoc = loc; });
  assert.equal(guestLoc, null);
  unsub();
});

test('Viewer/Ospite non può assegnare o prendere la guida', () => {
  assert.throws(() => {
    clientGuest.assignGuide(GUEST_UID, 'device-guest-C');
  }, /Solo l’Organizzatore può assegnare la guida GPS/);
});

test('Organizzatore avvia condivisione su Device A', () => {
  clientOwner.assignGuide(OWNER_UID, clientOwner.deviceId);
  const lease = db.get(LEASE_PATH).data();
  assert.equal(lease.status, 'active');
  assert.equal(lease.holderDeviceId, 'device-owner-A');
  assert.equal(lease.holderUid, OWNER_UID);
});

test('Device A pubblica posizione e secondo client (copilota) e ospite ricevono coordinate fresche', () => {
  let guestLoc = null;
  let copilotLoc = null;
  const unsubGuest = clientGuest.subscribeLocation(false, loc => { guestLoc = loc; });
  const unsubCopilot = clientCopilot.subscribeLocation(true, loc => { copilotLoc = loc; });

  const published = clientOwner.publishLocation(41.9028, 12.4964, 5, 'Roma');
  assert.equal(published, true);
  assert.ok(guestLoc);
  assert.equal(guestLoc.city, 'Roma');
  assert.equal(guestLoc.lat, 41.9028);

  assert.ok(copilotLoc);
  assert.equal(copilotLoc.city, 'Roma');

  unsubGuest();
  unsubCopilot();
});

test('Throttle a 16 secondi previene scritture ravvicinate respingendo il flood', () => {
  const publishedAgain = clientOwner.publishLocation(41.9030, 12.4970, 5, 'Roma Termini');
  assert.equal(publishedAgain, false); // Throttled
});

test('Coordinate obsolete (> 2 min) vengono oscurate all’ospite e marcate isStale per il copilota', () => {
  // Simula invecchiamento coordinate a 130 secondi fa
  const locDoc = db.get(LOCATION_PATH).data();
  locDoc.updatedAt = Date.now() - 130_000;
  db.set(LOCATION_PATH, locDoc);

  let guestLoc = undefined;
  let copilotLoc = undefined;
  let copilotStale = undefined;

  const unsubGuest = clientGuest.subscribeLocation(false, loc => { guestLoc = loc; });
  const unsubCopilot = clientCopilot.subscribeLocation(true, (loc, isStale) => {
    copilotLoc = loc;
    copilotStale = isStale;
  });

  // Privacy garantita: l'ospite vede null
  assert.equal(guestLoc, null);
  // Operatività garantita: il copilota sa che il dato c'è ma è obsoleto
  assert.ok(copilotLoc);
  assert.equal(copilotStale, true);

  unsubGuest();
  unsubCopilot();
});

test('Pausa condivisione: ospiti ricevono null e stato diventa paused', () => {
  clientOwner.pauseOrStop('paused');
  let guestLoc = undefined;
  const unsubGuest = clientGuest.subscribeLocation(false, loc => { guestLoc = loc; });
  assert.equal(guestLoc, null);

  const lease = db.get(LEASE_PATH).data();
  assert.equal(lease.status, 'paused');
  unsubGuest();
});

test('Trasferimento guida: Organizzatore trasferisce la guida a Copilota su Device B', () => {
  clientOwner.assignGuide(COPILOT_UID, clientCopilot.deviceId);
  const lease = db.get(LEASE_PATH).data();
  assert.equal(lease.holderUid, COPILOT_UID);
  assert.equal(lease.holderDeviceId, 'device-copilot-B');
});

test('Vecchio dispositivo (Device A) viene respinto se tenta di pubblicare', () => {
  assert.throws(() => {
    clientOwner.publishLocation(45.4642, 9.1900, 8, 'Milano');
  }, /Questo dispositivo non detiene la guida GPS attiva/);
});

test('Nuovo dispositivo copilota (Device B) pubblica con successo nuove coordinate', () => {
  // Aggiorna timestamp per superare eventuale throttle
  const locDoc = db.get(LOCATION_PATH).data();
  locDoc.updatedAt = Date.now() - 20_000;
  db.set(LOCATION_PATH, locDoc);

  let guestLoc = null;
  const unsub = clientGuest.subscribeLocation(false, loc => { guestLoc = loc; });

  const published = clientCopilot.publishLocation(45.4642, 9.1900, 8, 'Milano');
  assert.equal(published, true);
  assert.ok(guestLoc);
  assert.equal(guestLoc.city, 'Milano');
  assert.equal(guestLoc.publisherDeviceId, 'device-copilot-B');

  unsub();
});

test('Revoca guida: Organizzatore riprende la guida su Device A', () => {
  clientOwner.assignGuide(OWNER_UID, clientOwner.deviceId);
  const lease = db.get(LEASE_PATH).data();
  assert.equal(lease.holderUid, OWNER_UID);
  assert.equal(lease.holderDeviceId, 'device-owner-A');

  // Copilota su Device B ora viene respinto
  assert.throws(() => {
    clientCopilot.publishLocation(45.4645, 9.1910, 8, 'Milano Centro');
  }, /Questo dispositivo non detiene la guida GPS attiva/);
});

test('Interruzione totale (Stop): coordinate azzerate per ospiti', () => {
  clientOwner.pauseOrStop('stopped');
  const lease = db.get(LEASE_PATH).data();
  assert.equal(lease.status, 'stopped');

  let guestLoc = undefined;
  const unsub = clientGuest.subscribeLocation(false, loc => { guestLoc = loc; });
  assert.equal(guestLoc, null);
  unsub();
});

console.log(`\nRISULTATO: ${passed}/11 TEST MULTI-CLIENT GPS SUPERATI CON SUCCESSO!\n`);
