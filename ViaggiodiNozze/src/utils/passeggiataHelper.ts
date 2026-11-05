/**
 * Helper per il rilevamento e la gestione delle Passeggiate consecutive
 * nella timeline giornaliera di HOUNIGO.
 */

export interface PasseggiataSequenceInfo {
  inSequence: boolean;
  sequenceIndex: number; // 1-based index (es. Tappa 1 di 3)
  sequenceTotal: number; // Totale tappe nel percorso collegato
  isFirst: boolean;
  isMiddle: boolean;
  isLast: boolean;
}

export function isPasseggiataItem(item: any): boolean {
  if (!item) return false;
  const raw = item.originalData || item;
  const rawSub = (raw.sottocategoria || raw.category || '').toLowerCase();
  
  if (item.type === 'tappa' || raw.titolo !== undefined) {
    return rawSub === 'passeggiata';
  }
  if (item.type === 'attivita' || raw.title !== undefined) {
    return rawSub === 'passeggiata';
  }
  return false;
}

/**
 * Calcola a runtime per ciascun elemento della timeline se fa parte
 * di una sequenza di 2 o più Passeggiate adiacenti (senza interruzioni
 * da eventi di altre categorie).
 */
export function computePasseggiataSequences<T extends { id: string }>(items: T[]): Map<string, PasseggiataSequenceInfo> {
  const result = new Map<string, PasseggiataSequenceInfo>();

  let currentBlock: T[] = [];

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
      // Singola passeggiata isolata: non collegata
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
