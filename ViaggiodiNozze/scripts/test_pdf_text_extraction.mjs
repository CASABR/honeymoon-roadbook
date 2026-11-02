import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const source = new jsPDF();
source.text('HOTEL DEMO - Check-in 10/05/2099 ore 15:00', 20, 20);
source.text('Check-out 12/05/2099 ore 10:30 - Codice DEMO123', 20, 30);
const bytes = new Uint8Array(source.output('arraybuffer'));
const loadingTask = getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false, verbosity: 0 });
const document = await loadingTask.promise;
const page = await document.getPage(1);
const content = await page.getTextContent();
const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
await loadingTask.destroy();

assert.equal(text.includes('HOTEL DEMO'), true);
assert.equal(text.includes('10/05/2099'), true);
assert.equal(text.includes('15:00'), true);
assert.equal(text.includes('DEMO123'), true);
console.log('[PASS] PDF testuale sintetico estratto localmente; nessuna rete utilizzata.');
