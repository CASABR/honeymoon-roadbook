require('dotenv').config();
const webpush = require('web-push');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

try {
  const serviceAccount = require('../serviceAccountKey.json');
  initializeApp({
    credential: cert(serviceAccount)
  });
} catch (e) {
  console.log("Avviso: serviceAccountKey.json non trovato in root. Fallback ad ambiente default.", e.message);
  initializeApp();
}

const db = getFirestore();

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
const mailto = process.env.VAPID_MAILTO || 'mailto:admin@hounigo.com';

if (!publicVapidKey || !privateVapidKey) {
  throw new Error('VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY sono obbligatorie per inviare notifiche.');
}

webpush.setVapidDetails(
  mailto,
  publicVapidKey,
  privateVapidKey
);

async function sendNotifications() {
  const args = process.argv.slice(2);
  const targetTripId = args[0] ? args[0].trim() : null;
  const message = args[1] || 'Sono state caricate nuove modifiche al tuo itinerario.';

  // SICUREZZA: Rifiuta categoricamente l'invio globale/broadcast non associato a un tripId
  if (!targetTripId || targetTripId === 'all') {
    console.error("ERRORE DI SICUREZZA: È obbligatorio specificare un tripId valido come primo argomento.");
    console.error("Uso corretto: node scripts/send-update-notification.cjs <tripId> [messaggio]");
    process.exit(1);
  }

  console.log(`Recupero dispositivi registrati per il viaggio "${targetTripId}" da Firestore...`);
  const snapshot = await db.collection('push_subscribers').where('tripId', '==', targetTripId).get();

  if (snapshot.empty) {
    console.log(`Nessun dispositivo iscritto trovato per il viaggio "${targetTripId}".`);
    process.exit(0);
  }

  const validDocs = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.subscription) return;
    validDocs.push({ id: doc.id, ref: doc.ref, data });
  });

  if (validDocs.length === 0) {
    console.log(`Nessuna sottoscrizione valida trovata per il viaggio "${targetTripId}".`);
    process.exit(0);
  }

  console.log(`Invio notifica in corso a ${validDocs.length} dispositivo/i registrato/i...`);

  const payload = JSON.stringify({
    title: 'Nuovo Aggiornamento Itinerario 🚀',
    body: message,
    url: '/'
  });

  const promises = validDocs.map(({ id, ref, data }) => {
    console.log(`-> Invio a: ${id} (Ruolo: ${data.role || 'ospite'}, Viaggi: ${data.tripIds || data.tripId || 'Tutti'})`);
    return webpush.sendNotification(data.subscription, payload).catch(err => {
      console.error(`Errore invio a ${id}:`, err.statusCode, err.message);
      // Se il token è scaduto o non più valido, elimina il record obsoleto
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`Rimuovo subscription non più valida: ${id}`);
        return ref.delete();
      }
    });
  });

  await Promise.all(promises);
  console.log("Procedura di invio completata con successo!");
  process.exit(0);
}

sendNotifications().catch((err) => {
  console.error("Errore critico durante l'esecuzione:", err);
  process.exit(1);
});
