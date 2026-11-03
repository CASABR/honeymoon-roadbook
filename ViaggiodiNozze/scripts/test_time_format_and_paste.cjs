const assert = require('assert');

function formatTimeInputValue(raw, isBackspaceKey = false) {
  const normalized = raw.replace(/\./g, ':');
  const clean = normalized.replace(/[^\d:]/g, '');

  if (!clean) return '';

  if (clean.includes(':')) {
    const parts = clean.split(':');
    let h = parts[0].slice(0, 2);
    let m = parts.slice(1).join('').slice(0, 2);

    if (h.length === 2) {
      const hNum = parseInt(h, 10);
      if (hNum > 23) h = '23';
    }

    if (m.length > 0) {
      const m0 = parseInt(m[0], 10);
      if (m0 > 5) {
        m = '5' + (m[1] || '');
      }
      if (m.length === 2) {
        const mNum = parseInt(m, 10);
        if (mNum > 59) m = '59';
      }
    }

    return `${h}:${m}`;
  }

  const digits = clean.replace(/\D/g, '').slice(0, 4);

  if (digits.length === 0) return '';
  if (digits.length === 1) return digits;

  if (digits.length === 2) {
    let h = digits;
    const hNum = parseInt(h, 10);
    if (hNum > 23) h = '23';
    return isBackspaceKey ? h : `${h}:`;
  }

  if (digits.length === 3) {
    let h = digits.slice(0, 2);
    if (parseInt(h, 10) > 23) h = '23';
    let m0 = digits[2];
    if (parseInt(m0, 10) > 5) m0 = '5';
    return `${h}:${m0}`;
  }

  let h = digits.slice(0, 2);
  let m = digits.slice(2, 4);
  if (parseInt(h, 10) > 23) h = '23';
  if (parseInt(m, 10) > 59) m = '59';
  return `${h}:${m}`;
}

function parseAndFormatPastedTime(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  
  if (trimmed.includes(':') || trimmed.includes('.')) {
    const sep = trimmed.includes(':') ? ':' : '.';
    const parts = trimmed.split(sep);
    if (parts.length >= 2) {
      const hStr = parts[0].trim();
      const mStr = parts[1].trim().slice(0, 2);
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
  }

  if (digitsOnly.length === 4) {
    const h = parseInt(digitsOnly.slice(0, 2), 10);
    const m = parseInt(digitsOnly.slice(2, 4), 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  if (digitsOnly.length === 3) {
    const h = parseInt(digitsOnly.slice(0, 1), 10);
    const m = parseInt(digitsOnly.slice(1, 3), 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  return null;
}

console.log('--- TEST DIGITAZIONE PROGRESSIVA 1530 ---');
assert.strictEqual(formatTimeInputValue('1'), '1');
assert.strictEqual(formatTimeInputValue('15'), '15:');
assert.strictEqual(formatTimeInputValue('15:3'), '15:3');
assert.strictEqual(formatTimeInputValue('15:30'), '15:30');
assert.strictEqual(formatTimeInputValue('1530'), '15:30');

console.log('--- TEST DIGITAZIONE PROGRESSIVA 0915 ---');
assert.strictEqual(formatTimeInputValue('0'), '0');
assert.strictEqual(formatTimeInputValue('09'), '09:');
assert.strictEqual(formatTimeInputValue('09:1'), '09:1');
assert.strictEqual(formatTimeInputValue('09:15'), '09:15');
assert.strictEqual(formatTimeInputValue('0915'), '09:15');

console.log('--- TEST DIGITAZIONE PROGRESSIVA 0005 ---');
assert.strictEqual(formatTimeInputValue('00'), '00:');
assert.strictEqual(formatTimeInputValue('0005'), '00:05');

console.log('--- TEST VALIDAZIONE LIMITI 00-23 E 00-59 ---');
assert.strictEqual(formatTimeInputValue('2599'), '23:59');
assert.strictEqual(formatTimeInputValue('99'), '23:');
assert.strictEqual(formatTimeInputValue('12:89'), '12:59');

console.log('--- TEST INCOLLA FORMATI ---');
assert.strictEqual(parseAndFormatPastedTime('1530'), '15:30');
assert.strictEqual(parseAndFormatPastedTime('15:30'), '15:30');
assert.strictEqual(parseAndFormatPastedTime('15.30'), '15:30');
assert.strictEqual(parseAndFormatPastedTime('0915'), '09:15');
assert.strictEqual(parseAndFormatPastedTime('9:15'), '09:15');
assert.strictEqual(parseAndFormatPastedTime('9.15'), '09:15');
assert.strictEqual(parseAndFormatPastedTime('0005'), '00:05');
assert.strictEqual(parseAndFormatPastedTime('invalid'), null);
assert.strictEqual(parseAndFormatPastedTime('25:00'), null);

console.log('--- TEST MINUTI NON MULTIPLI DI CINQUE CONSERVATI ---');
assert.strictEqual(formatTimeInputValue('1532'), '15:32');
assert.strictEqual(parseAndFormatPastedTime('09:17'), '09:17');

console.log('TUTTI I TEST FORMATTAZIONE ORARIO SUPERATI CON SUCCESSO!');
