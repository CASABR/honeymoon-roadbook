import type { Shopping, TimeStatus } from '../types';
import { buildEurSavePatch } from '../services/currencyService';
import { storageService } from '../storage/storageService';

export interface ShoppingFormDraft {
  sottocategoria: string;
  nome: string;
  scopo: string;
  data: string;
  orario: string;
  timeStatus: TimeStatus;
  indirizzo: string;
  budget: string;
  link: string;
  noteCopilota: string;
  copilota: boolean;
}

export type ShoppingSavePayload = Omit<Shopping, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export interface CachedMoneyPatch {
  budgetRaw: string;
  normMeta: Record<string, any>;
  finalBudget: string | undefined;
}

export const SHOPPING_SUBCATEGORIES = [
  'Abbigliamento',
  'Souvenir',
  'Alimentari',
  'Elettronica',
  'Carburante',
  'Altro',
] as const;

/**
 * Deriva lo stato iniziale deterministico del form Shopping da un record esistente o dai default di creazione.
 */
export function buildShoppingFormInitialState(
  initialData?: Shopping | null,
  defaultDate?: string,
  defaultTime?: string
): ShoppingFormDraft {
  if (!initialData) {
    return {
      sottocategoria: '',
      nome: '',
      scopo: '',
      data: defaultDate || '',
      orario: defaultTime || '',
      timeStatus: 'indicativo',
      indirizzo: '',
      budget: '',
      link: '',
      noteCopilota: '',
      copilota: false,
    };
  }

  const raw = initialData as Shopping & {
    date?: string;
    time?: string;
    cost?: string;
    notes?: string;
  };
  const existingNotes = [initialData.noteCopilota, initialData.nota, raw.notes]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join('\n\n');

  return {
    sottocategoria: initialData.sottocategoria || '',
    nome: initialData.nome || '',
    scopo: initialData.scopo || '',
    data: initialData.data || raw.date || '',
    orario: initialData.orario || raw.time || '',
    timeStatus: initialData.timeStatus || 'indicativo',
    indirizzo: initialData.indirizzo || '',
    budget: initialData.budget || raw.cost || '',
    link: initialData.link || '',
    noteCopilota: existingNotes,
    copilota: Boolean(existingNotes.trim()) || initialData.copilota || false,
  };
}

/**
 * Serializzazione stabile della bozza Shopping per rilevare modifiche reali (incluso timeStatus solo con orario).
 */
export function serializeShoppingDraftFingerprint(draft: ShoppingFormDraft): string {
  return JSON.stringify([
    draft.sottocategoria,
    draft.nome,
    draft.scopo,
    draft.data,
    draft.orario,
    draft.orario ? draft.timeStatus : '',
    draft.indirizzo,
    draft.budget,
    draft.link,
    draft.noteCopilota,
    Boolean(draft.noteCopilota.trim()) || draft.copilota,
  ]);
}

export function validateShoppingDraft(draft: ShoppingFormDraft): string | null {
  if (!draft.nome.trim()) {
    return 'Il nome del negozio o centro commerciale è obbligatorio.';
  }
  return null;
}

/**
 * Costruisce il payload normalizzato Shopping riutilizzando l'esito valuta se il budget non è cambiato.
 */
export async function buildShoppingSavePayload(params: {
  draft: ShoppingFormDraft;
  initialData?: Shopping | null;
  cachedMoney?: CachedMoneyPatch | null;
}): Promise<{ payload: ShoppingSavePayload; moneyCache: CachedMoneyPatch }> {
  const { draft, initialData, cachedMoney } = params;
  const trimmedBudget = draft.budget.trim();

  let normMeta: Record<string, any>;
  let finalBudget: string | undefined;

  if (cachedMoney && cachedMoney.budgetRaw === trimmedBudget) {
    normMeta = cachedMoney.normMeta;
    finalBudget = cachedMoney.finalBudget;
  } else {
    const normalizedMoney = await buildEurSavePatch({
      costRaw: trimmedBudget || undefined,
      existingItem: initialData,
    });
    const { cost: normCost, depositPaid: _dp, acconto: _ac, ...rest } = normalizedMoney;
    normMeta = rest;
    finalBudget = normCost ?? (trimmedBudget || undefined);
  }

  const payload: ShoppingSavePayload = {
    id: initialData?.id,
    sottocategoria: draft.sottocategoria || undefined,
    nome: draft.nome.trim(),
    scopo: draft.scopo.trim() || undefined,
    data: draft.data || undefined,
    date: draft.data || undefined,
    orario: draft.orario || undefined,
    time: draft.orario || undefined,
    timeStatus: draft.orario ? draft.timeStatus : undefined,
    indirizzo: draft.indirizzo.trim() || undefined,
    ...normMeta,
    budget: finalBudget,
    cost: finalBudget,
    link: draft.link.trim() || undefined,
    coordinate: initialData?.coordinate,
    noteCopilota: draft.noteCopilota.trim() || undefined,
    nota: draft.noteCopilota.trim() || undefined,
    notes: draft.noteCopilota.trim() || undefined,
    copilota: Boolean(draft.noteCopilota.trim()) || draft.copilota || undefined,
  } as ShoppingSavePayload;

  return {
    payload,
    moneyCache: {
      budgetRaw: trimmedBudget,
      normMeta,
      finalBudget,
    },
  };
}

/**
 * Persiste una modifica su una card Shopping già esistente preservando campi non gestiti dal form,
 * timestamp monotono e un'unica notifica `roadbook_data_mutated` via storageService.saveShopping.
 */
export async function persistExistingShoppingEdit(
  existingFallback: Shopping | null | undefined,
  data: ShoppingSavePayload
): Promise<Shopping> {
  const targetId = data.id || existingFallback?.id;
  if (!targetId) {
    throw new Error('ID Shopping mancante per il salvataggio automatico.');
  }

  const currentList = await storageService.getShopping();
  const latestExisting = currentList.find((item) => item.id === targetId) || existingFallback;
  const now = Date.now();
  const nextUpdatedAt = Math.max(now, (latestExisting?.updatedAt || 0) + 1);

  const merged: Shopping = {
    ...(latestExisting || {}),
    ...data,
    id: targetId,
    createdAt: latestExisting?.createdAt || now,
    updatedAt: nextUpdatedAt,
  } as Shopping;

  await storageService.saveShopping(merged);
  const refreshedList = await storageService.getShopping();
  return refreshedList.find((item) => item.id === targetId) || merged;
}

export function getShoppingDraftStorageKey(tripId?: string | null, entityId?: string | null): string {
  const safeTrip = (tripId || 'local').trim() || 'local';
  const safeEntity = (entityId || 'new').trim() || 'new';
  return `hounigo_shopping_draft_v1_${safeTrip}_${safeEntity}`;
}

export function loadShoppingLocalDraft(
  tripId?: string | null,
  entityId?: string | null
): ShoppingFormDraft | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getShoppingDraftStorageKey(tripId, entityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.nome !== 'string') return null;
    return parsed as ShoppingFormDraft;
  } catch {
    return null;
  }
}

export function saveShoppingLocalDraft(
  tripId: string | null | undefined,
  entityId: string | null | undefined,
  draft: ShoppingFormDraft
): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(getShoppingDraftStorageKey(tripId, entityId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearShoppingLocalDraft(
  tripId?: string | null,
  entityId?: string | null
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(getShoppingDraftStorageKey(tripId, entityId));
  } catch {}
}
