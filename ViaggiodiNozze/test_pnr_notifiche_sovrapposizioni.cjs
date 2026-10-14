/**
 * Test Suite Automatizzato per:
 * 1. PNR: non mostrare nulla quando il dato manca/è vuoto/ha soli spazi
 * 2. Notifiche: ciclo di disattivazione, timeout, resilienza errori e ripristino flag isSubscribing
 * 3. Valutazione completezza sovrapposizioni (TimeCollision)
 */

const assert = require('assert');

console.log('=================================================================');
console.log('   ESECUZIONE TEST SUITE: PNR, NOTIFICHE & SOVRAPPOSIZIONI');
console.log('=================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Errore: ${err.message}`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// 1. PNR HELPER
// -----------------------------------------------------------------------------
function shouldRenderPNR(code) {
  return Boolean(code && typeof code === 'string' && code.trim().length > 0);
}

// -----------------------------------------------------------------------------
// 2. MOCK PUSH CONTROLLER
// -----------------------------------------------------------------------------
class MockPushManager {
  constructor(shouldHang = false, shouldFail = false) {
    this.shouldHang = shouldHang;
    this.shouldFail = shouldFail;
    this.subscribed = true;
  }

  async getSubscription() {
    if (this.shouldHang) {
      return new Promise(() => {}); // Promise pendente eterna
    }
    if (!this.subscribed) return null;
    return {
      endpoint: 'https://fcm.googleapis.com/fcm/send/fake-sub',
      unsubscribe: async () => {
        if (this.shouldFail) throw new Error('Unsubscribe browser error');
        this.subscribed = false;
        return true;
      }
    };
  }
}

class PushNotificationController {
  constructor(mockPushManager, mockDeleteDoc) {
    this.pushManager = mockPushManager;
    this.mockDeleteDoc = mockDeleteDoc;
    this.isSubscribing = false;
    this.subscription = { endpoint: 'existing' };
  }

  async unsubscribeFromPush() {
    this.isSubscribing = true;
    try {
      // 1. Browser unsubscribe con timeout protetto a 50ms per i test
      if (this.pushManager) {
        try {
          const getSubPromise = this.pushManager.getSubscription();
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 50));
          const sub = await Promise.race([getSubPromise, timeoutPromise]);
          if (sub && typeof sub.unsubscribe === 'function') {
            const unsubPromise = sub.unsubscribe();
            const unsubTimeout = new Promise((resolve) => setTimeout(() => resolve(true), 50));
            await Promise.race([unsubPromise, unsubTimeout]);
          }
        } catch (swErr) {
          // Errore non fatale per non bloccare la UI
        }
      }

      this.subscription = null;

      // 2. Cloud deleteDoc con timeout protetto a 50ms per i test
      if (this.mockDeleteDoc) {
        try {
          const delPromise = this.mockDeleteDoc();
          const delTimeout = new Promise((resolve) => setTimeout(() => resolve(), 50));
          await Promise.race([delPromise, delTimeout]);
        } catch (dbErr) {
          // Errore DB catturato
        }
      }

      return true;
    } finally {
      // Garantisce sempre il ripristino di isSubscribing
      this.isSubscribing = false;
    }
  }
}

// -----------------------------------------------------------------------------
// 3. CRITERIO DI COMPLETEZZA TIME COLLISION MODAL
// -----------------------------------------------------------------------------
function evaluateCompleteness(item) {
  let score = 0;
  const reasons = [];
  const raw = item.originalData || {};

  const attachments = raw.attachments || raw.tickets || [];
  const hasQRCode = Boolean(raw.qrCode || raw.bookingCode || raw.pnr);
  if (attachments.length > 0 || hasQRCode) {
    score += 4;
    reasons.push(attachments.length > 0 ? 'include voucher/allegati' : 'ha codice/PNR');
  }

  const loc = item.location || raw.address || raw.indirizzo || raw.departureLocation;
  if (loc && loc.trim().length > 3) {
    score += 2;
    reasons.push('ha indirizzo completo');
  }

  if (raw.duration || raw.orarioInizio || raw.checkOutTime || raw.arrivalTime || raw.departureTime) {
    score += 2;
    reasons.push('orario e durata dettagliati');
  }

  const desc = raw.description || raw.descrizione || raw.notes || raw.nota || raw.noteCopilota || item.noteCopilota;
  if (desc && desc.trim().length > 10) {
    score += 2;
    reasons.push('descrizione e note');
  }

  if (raw.cost || raw.budget || raw.price || raw.paymentStatus) {
    score += 1;
  }

  return { score, reasons };
}

// -----------------------------------------------------------------------------
// ESECUZIONE TEST
// -----------------------------------------------------------------------------
async function main() {
  await runTest('PNR valido viene mostrato', () => {
    assert.strictEqual(shouldRenderPNR('PNR: XLY76H'), true);
    assert.strictEqual(shouldRenderPNR('ABC123'), true);
  });

  await runTest('PNR assente, null o undefined non viene mostrato', () => {
    assert.strictEqual(shouldRenderPNR(undefined), false);
    assert.strictEqual(shouldRenderPNR(null), false);
  });

  await runTest('PNR stringa vuota o composta solo da spazi non genera testo', () => {
    assert.strictEqual(shouldRenderPNR(''), false);
    assert.strictEqual(shouldRenderPNR('   '), false);
    assert.strictEqual(shouldRenderPNR('\t\n'), false);
  });

  await runTest('Disattivazione notifiche riuscita reimposta stato e azzera isSubscribing', async () => {
    const pm = new MockPushManager(false, false);
    const controller = new PushNotificationController(pm, async () => {});
    
    assert.strictEqual(controller.isSubscribing, false);
    const res = await controller.unsubscribeFromPush();
    
    assert.strictEqual(res, true);
    assert.strictEqual(controller.subscription, null);
    assert.strictEqual(controller.isSubscribing, false);
    assert.strictEqual(pm.subscribed, false);
  });

  await runTest('Disattivazione con Promise browser appesa non si blocca e rilascia isSubscribing', async () => {
    const hangingPm = new MockPushManager(true, false);
    const controller = new PushNotificationController(hangingPm, async () => {});
    
    const startTime = Date.now();
    await controller.unsubscribeFromPush();
    const elapsed = Date.now() - startTime;
    
    assert.strictEqual(controller.isSubscribing, false);
    assert.strictEqual(controller.subscription, null);
    assert.ok(elapsed < 200, `L'operazione non deve bloccarsi (completata in ${elapsed}ms)`);
  });

  await runTest('Disattivazione con errore Firestore o offline non blocca la UI e azzera stato', async () => {
    const pm = new MockPushManager(false, false);
    const failingDb = async () => {
      throw new Error('Firestore permission denied o network error');
    };
    const controller = new PushNotificationController(pm, failingDb);
    
    await controller.unsubscribeFromPush();
    assert.strictEqual(controller.isSubscribing, false);
    assert.strictEqual(controller.subscription, null);
  });

  await runTest('Browser senza PushManager gestisce la disattivazione senza eccezioni pendenti', async () => {
    const controller = new PushNotificationController(null, async () => {});
    await controller.unsubscribeFromPush();
    assert.strictEqual(controller.isSubscribing, false);
    assert.strictEqual(controller.subscription, null);
  });

  await runTest('Valutazione completezza assegna correttamente punteggio a scheda ricca di dati', () => {
    const completeItem = {
      title: 'Tour Milford Sound',
      location: 'Milford Highway, Fiordland',
      originalData: {
        attachments: [{ id: '1', name: 'ticket.pdf' }],
        address: 'Milford Sound Visitor Centre',
        duration: '2h 15m',
        description: 'Crociera sui fiordi con pranzo al sacco incluso',
        cost: '140 €'
      }
    };

    const simpleItem = {
      title: 'Milford Sound sosta',
      location: '',
      originalData: {}
    };

    const compA = evaluateCompleteness(completeItem);
    const compB = evaluateCompleteness(simpleItem);

    assert.ok(compA.score >= 10, `Punteggio item completo: ${compA.score}`);
    assert.strictEqual(compB.score, 0);
    assert.ok(compA.score - compB.score >= 2);
  });

  console.log('\n=================================================================');
  console.log(`   ESITO TEST: ${passedTests}/${totalTests} superati con successo.`);
  console.log('=================================================================\n');
  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
