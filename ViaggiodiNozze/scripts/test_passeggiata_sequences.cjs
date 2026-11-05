const assert = require('node:assert/strict');
const path = require('node:path');

// Test logic
function isPasseggiataItem(item) {
  if (!item) return false;
  const raw = item.originalData || item;
  const rawSub = (raw.sottocategoria || raw.category || '').toLowerCase();
  return rawSub === 'passeggiata';
}

function computePasseggiataSequences(items) {
  const result = new Map();
  let currentBlock = [];

  const flushBlock = () => {
    if (currentBlock.length >= 2) {
      const total = currentBlock.length;
      currentBlock.forEach((item, idx) => {
        result.set(item.id, {
          inSequence: true,
          sequenceIndex: idx + 1,
          sequenceTotal: total,
          isFirst: idx === 0,
          isMiddle: idx > 0 && idx < total - 1,
          isLast: idx === total - 1
        });
      });
    } else if (currentBlock.length === 1) {
      result.set(currentBlock[0].id, {
        inSequence: false,
        sequenceIndex: 1,
        sequenceTotal: 1,
        isFirst: false,
        isMiddle: false,
        isLast: false
      });
    }
    currentBlock = [];
  };

  items.forEach(item => {
    if (isPasseggiataItem(item)) {
      currentBlock.push(item);
    } else {
      flushBlock();
    }
  });

  flushBlock();
  return result;
}

console.log('--- TEST COLLEGAMENTO AUTOMATICO PASSEGGIATE ---');

const items1 = [
  { id: '1', type: 'tappa', originalData: { sottocategoria: 'Passeggiata', titolo: 'Passeggiata A' } },
  { id: '2', type: 'tappa', originalData: { sottocategoria: 'Passeggiata', titolo: 'Passeggiata B' } },
  { id: '3', type: 'tappa', originalData: { sottocategoria: 'Passeggiata', titolo: 'Passeggiata C' } },
  { id: '4', type: 'ristorante', originalData: { sottocategoria: 'Pranzo', nome: 'Ristorante X' } },
  { id: '5', type: 'tappa', originalData: { sottocategoria: 'Passeggiata', titolo: 'Passeggiata D' } }
];

const res1 = computePasseggiataSequences(items1);

// Verifica 1: 3 passeggiate consecutive risultano collegate (1 di 3, 2 di 3, 3 di 3)
assert.equal(res1.get('1').inSequence, true);
assert.equal(res1.get('1').sequenceIndex, 1);
assert.equal(res1.get('1').sequenceTotal, 3);
assert.equal(res1.get('1').isFirst, true);

assert.equal(res1.get('2').inSequence, true);
assert.equal(res1.get('2').sequenceIndex, 2);
assert.equal(res1.get('2').sequenceTotal, 3);
assert.equal(res1.get('2').isMiddle, true);

assert.equal(res1.get('3').inSequence, true);
assert.equal(res1.get('3').sequenceIndex, 3);
assert.equal(res1.get('3').sequenceTotal, 3);
assert.equal(res1.get('3').isLast, true);

// Verifica 2: Il ristorante ha interrotto il blocco, Passeggiata D è singola e non collegata
assert.equal(res1.get('5').inSequence, false);
console.log('PASS: Sequenza consecutiva riconosciuta (1, 2, 3 di 3) e interruzione da altro evento verificata.');
