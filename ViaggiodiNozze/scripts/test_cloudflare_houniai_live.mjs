import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import dotenv from 'dotenv';
import { deleteApp, initializeApp } from 'firebase/app';
import { deleteUser, getAuth, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

dotenv.config({ path: '.env.local', quiet: true });

const endpoint = process.env.HOUNIAI_TEST_URL || 'https://hounigo-ai.nunzio114.workers.dev/v1/houniai';
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};
const ownerEmail = process.env.HOUNIAI_TEST_EMAIL || process.env.VITE_TEST_EMAIL;
const ownerPassword = process.env.HOUNIAI_TEST_PASSWORD || process.env.VITE_TEST_PASSWORD;
if (Object.values(firebaseConfig).some(value => !value) || !ownerEmail || !ownerPassword) {
  throw new Error('Configurazione Firebase test locale incompleta.');
}

const origin = 'https://casabr.github.io';
const consentVersion = 'cloudflare-workers-ai-v1';
const syntheticCollections = ['attivita', 'alloggi', 'trasporti', 'documenti', 'tappe', 'ristoranti', 'shopping'];

function parseJson(text) {
  const normalized = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');
  assert.notEqual(start, -1, 'La risposta non contiene JSON');
  assert.notEqual(end, -1, 'La risposta non contiene JSON completo');
  return JSON.parse(normalized.slice(start, end + 1));
}

async function waitForNextRateWindow() {
  const waitMs = 60_000 - (Date.now() % 60_000) + 1_500;
  console.log(`[INFO] Attesa ${Math.ceil(waitMs / 1000)}s per rispettare il limite di 2 richieste/minuto.`);
  await new Promise(resolve => setTimeout(resolve, waitMs));
}

async function requestWorker(idToken, tripId, requestBody) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Origin: origin, Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripId,
      consentVersion,
      requestBody,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function callWorker(idToken, tripId, requestBody) {
  const { response, payload } = await requestWorker(idToken, tripId, requestBody);
  assert.equal(response.ok, true, `Worker live ha risposto ${response.status}`);
  assert.equal(typeof payload.text, 'string');
  assert.notEqual(payload.text.trim(), '');
  return payload.text;
}

const extractionSystem = 'Sei un assistente di estrazione prenotazioni. Il contenuto sintetico descrive un pernottamento: restituisci entityType alloggio e i dati strutturati, senza salvare nulla.';
const extractionSchema = {
  type: 'object',
  properties: {
    entityType: { type: 'string', enum: ['alloggio'] },
    alloggio: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        location: { type: 'string' },
        checkIn: { type: 'string' },
        checkOut: { type: 'string' },
        checkInTime: { type: 'string' },
        checkOutTime: { type: 'string' },
        bookingCode: { type: 'string' },
      },
      required: ['name', 'location', 'checkIn', 'checkOut'],
    },
  },
  required: ['entityType', 'alloggio'],
};
function extractionRequest(parts) {
  return {
    system_instruction: { parts: [{ text: extractionSystem }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 800,
      responseMimeType: 'application/json',
      responseSchema: extractionSchema,
    },
  };
}

async function createSyntheticPdfText() {
  const source = new jsPDF();
  source.text('HOTEL SINTETICO - Check-in 10/05/2099 ore 15:00', 20, 20);
  source.text('Check-out 12/05/2099 ore 10:30 - Codice SYNTH-PDF', 20, 30);
  const bytes = new Uint8Array(source.output('arraybuffer'));
  const loadingTask = getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false, verbosity: 0 });
  const document = await loadingTask.promise;
  const page = await document.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
  await loadingTask.destroy();
  assert.equal(text.includes('HOTEL SINTETICO'), true);
  return text;
}

const glyphs = {
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
};

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function createSyntheticBookingPng() {
  const width = 640;
  const height = 180;
  const pixels = Buffer.alloc(width * height * 3, 255);
  const drawText = (value, startX, startY, scale = 5) => {
    let cursorX = startX;
    for (const character of value) {
      const glyph = glyphs[character] || glyphs[' '];
      glyph.forEach((row, rowIndex) => [...row].forEach((pixel, columnIndex) => {
        if (pixel !== '1') return;
        for (let y = 0; y < scale; y += 1) for (let x = 0; x < scale; x += 1) {
          const px = cursorX + columnIndex * scale + x;
          const py = startY + rowIndex * scale + y;
          const offset = (py * width + px) * 3;
          pixels[offset] = 20;
          pixels[offset + 1] = 32;
          pixels[offset + 2] = 51;
        }
      }));
      cursorX += scale * 6;
    }
  };
  drawText('HOTEL DEMO', 30, 20, 6);
  drawText('CHECK IN 10 MAY 2099 15 00', 30, 75, 4);
  drawText('CHECK OUT 12 MAY 2099 10 30', 30, 120, 4);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const target = row * (width * 3 + 1);
    raw[target] = 0;
    pixels.copy(raw, target + 1, row * width * 3, (row + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

function createClient(name) {
  const app = initializeApp(firebaseConfig, name);
  return { app, auth: getAuth(app), db: getFirestore(app) };
}

async function assertNoImportedBookings(db, tripId) {
  for (const collectionName of syntheticCollections) {
    const snapshot = await getDocs(collection(db, 'trips', tripId, collectionName));
    assert.equal(snapshot.empty, true, `Scrittura automatica inattesa in ${collectionName}`);
  }
}

const ownerClient = createClient(`houniai-owner-${Date.now()}`);
const copilotClient = createClient(`houniai-copilot-${Date.now()}`);
const outsiderClient = createClient(`houniai-outsider-${Date.now()}`);
let tripId = '';
const differentTripId = `houniai-other-${randomBytes(6).toString('hex')}`;
let tripCreated = false;
let copilotMemberCreated = false;
let copilotUser;
let outsiderUser;
let stage = 'inizializzazione';

try {
  stage = 'autenticazione Owner';
  const ownerCredential = await signInWithEmailAndPassword(ownerClient.auth, ownerEmail, ownerPassword);
  const ownerUser = ownerCredential.user;
  const ownerToken = await ownerUser.getIdToken();
  assert.equal(typeof ownerToken, 'string');
  assert.equal(ownerToken.length > 100, true);

  const tripRef = doc(collection(ownerClient.db, 'trips'));
  tripId = tripRef.id;
  stage = 'creazione viaggio sintetico';
  await setDoc(tripRef, {
    id: tripId,
    title: 'HOUNIGO E2E sintetico',
    startDate: '2099-05-10',
    endDate: '2099-05-12',
    ownerUid: ownerUser.uid,
    ownerName: 'Owner sintetico',
    members: [ownerUser.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  tripCreated = true;

  stage = 'creazione identità temporanee';
  copilotUser = (await signInAnonymously(copilotClient.auth)).user;
  outsiderUser = (await signInAnonymously(outsiderClient.auth)).user;
  const copilotMemberRef = doc(ownerClient.db, 'trips', tripId, 'members', copilotUser.uid);
  stage = 'assegnazione Copilota';
  await setDoc(copilotMemberRef, {
    uid: copilotUser.uid,
    role: 'copilota',
    name: 'Copilota sintetico',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  copilotMemberCreated = true;
  await updateDoc(tripRef, { members: arrayUnion(copilotUser.uid), updatedAt: serverTimestamp() });

  stage = 'verifiche autorizzative';
  const copilotToken = await copilotUser.getIdToken();
  const outsiderToken = await outsiderUser.getIdToken();
  stage = 'rifiuto utente estraneo';
  const outsiderDenied = await requestWorker(outsiderToken, tripId, { contents: [{ role: 'user', parts: [{ text: 'Test sintetico.' }] }] });
  assert.equal(outsiderDenied.response.ok, false, 'Un utente estraneo non deve essere autorizzato');
  stage = 'rifiuto viaggio diverso';
  const otherTripDenied = await requestWorker(ownerToken, differentTripId, { contents: [{ role: 'user', parts: [{ text: 'Test sintetico.' }] }] });
  assert.equal(otherTripDenied.response.ok, false, 'Un viaggio diverso non deve essere autorizzato');
  console.log('[PASS] Owner/Copilota predisposti; estraneo e viaggio diverso rifiutati.');

  stage = 'inferenze e quote Owner';
  await waitForNextRateWindow();
  const chatRequest = {
    contents: [{ role: 'user', parts: [{ text: 'Rispondi in italiano con una frase breve: come organizzo una giornata di viaggio?' }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 120 },
  };
  stage = 'chat Owner';
  const chat = await callWorker(ownerToken, tripId, chatRequest);
  assert.equal(chat.length > 10, true);

  const textBooking = 'Hotel Sintetico, Roma. Check-in 10 maggio 2099 alle 15:00, check-out 12 maggio alle 10:30. Conferma SYNTH-TEXT.';
  stage = 'estrazione testo Owner';
  const textResult = parseJson(await callWorker(ownerToken, tripId, extractionRequest([{ text: textBooking }])));
  assert.equal(textResult.entityType, 'alloggio');
  stage = 'rate limit minuto Owner primo';
  const minuteDeniedOne = await requestWorker(ownerToken, tripId, chatRequest);
  assert.equal(minuteDeniedOne.response.status, 429);

  await waitForNextRateWindow();
  const pdfText = await createSyntheticPdfText();
  stage = 'estrazione PDF Owner';
  const pdfResult = parseJson(await callWorker(ownerToken, tripId, extractionRequest([{ text: pdfText }])));
  assert.equal(pdfResult.entityType, 'alloggio');
  stage = 'estrazione immagine Owner';
  const imageResult = parseJson(await callWorker(ownerToken, tripId, extractionRequest([
    { text: 'Leggi questa prenotazione sintetica e ricava date e orari.' },
    { inline_data: { mime_type: 'image/png', data: createSyntheticBookingPng() } },
  ])));
  assert.equal(imageResult.entityType, 'alloggio');
  stage = 'rate limit minuto Owner secondo';
  const minuteDeniedTwo = await requestWorker(ownerToken, tripId, chatRequest);
  assert.equal(minuteDeniedTwo.response.status, 429);

  await waitForNextRateWindow();
  stage = 'Smart Import Owner';
  const smartImportResult = parseJson(await callWorker(ownerToken, tripId, extractionRequest([{ text: textBooking }])));
  assert.equal(smartImportResult.entityType, textResult.entityType);
  assert.equal(JSON.stringify(smartImportResult).includes('2099'), true);
  stage = 'quota giornaliera Owner';
  const dailyDenied = await requestWorker(ownerToken, tripId, chatRequest);
  assert.equal(dailyDenied.response.status, 429);

  stage = 'inferenza Copilota';
  const copilotChat = await callWorker(copilotToken, tripId, chatRequest);
  assert.equal(copilotChat.length > 10, true);
  stage = 'verifica assenza scritture';
  await assertNoImportedBookings(ownerClient.db, tripId);
  console.log('[PASS] Chat, testo, PDF, immagine e Smart Import sintetici reali; limiti minuto/giorno applicati.');
  console.log('[PASS] Nessuna prenotazione salvata automaticamente nel viaggio sintetico.');
} catch (error) {
  const code = typeof error?.code === 'string' ? error.code : 'errore';
  throw new Error(`Collaudo bloccato durante: ${stage} (${code}).`);
} finally {
  try {
    if (copilotMemberCreated) {
      await deleteDoc(doc(ownerClient.db, 'trips', tripId, 'members', copilotUser.uid));
    }
    if (tripCreated) await deleteDoc(doc(ownerClient.db, 'trips', tripId));
    if (copilotUser) await deleteUser(copilotUser);
    if (outsiderUser) await deleteUser(outsiderUser);
    if (tripCreated || copilotUser || outsiderUser) {
      console.log('[PASS] Risorse sintetiche create da questa esecuzione rimosse puntualmente.');
    }
  } finally {
    await Promise.allSettled([deleteApp(ownerClient.app), deleteApp(copilotClient.app), deleteApp(outsiderClient.app)]);
  }
}
