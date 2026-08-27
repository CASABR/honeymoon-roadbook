import { auth, db } from "./firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { repository, registerCloudSyncHandler, type CloudSyncSection, type BudgetEntry, type Checklist } from "./repository";
import type { Accommodation, DayData, Transport } from "../data/mockData";
import type { User } from "firebase/auth";

type SyncStatus = "locale" | "sincronizzazione" | "sincronizzato" | "errore";

type SyncableItem = { id: string; updatedAt?: number };
const LOCAL_ONLY_KEYS = [
  "bookingRef", "confirmationCode", "qrCodeData", "qrCodes", "attachments", "dataUrl",
  "number", "password", "token",
];

let currentSyncStatus: SyncStatus = "locale";
let activeUid: string | null = null;
let applyingRemote = false;
const queuedWrites = new Map<CloudSyncSection, Promise<void>>();
const pendingSections = new Set<CloudSyncSection>();

function setSyncStatus(status: SyncStatus): void {
  currentSyncStatus = status;
  window.dispatchEvent(new CustomEvent("hrb_sync_status_change", { detail: status }));
  window.dispatchEvent(new CustomEvent("hrb_budget_sync_status_change", {
    detail: status === "sincronizzazione" ? "pending" : status === "locale" ? "errore" : status,
  }));
}

function getAuthenticatedUser(): User | null {
  const user = auth?.currentUser;
  if (!user || user.uid === "local-bypass-user") return null;
  return user;
}

function canUseCloud(user: User | null = getAuthenticatedUser()): user is User {
  return Boolean(user && db && navigator.onLine && user.uid === activeUid);
}

function userPath(user: User, suffix: string): string {
  return suffix ? `users/${user.uid}/${suffix}` : `users/${user.uid}`;
}

function sanitizeForCloud(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForCloud);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !LOCAL_ONLY_KEYS.includes(key))
      .map(([key, child]) => [key, sanitizeForCloud(child)]),
  );
}

function isSpecialFirestoreValue(value: object): boolean {
  return value instanceof Date
    || (typeof Blob !== "undefined" && value instanceof Blob)
    || Object.getPrototypeOf(value) !== Object.prototype;
}

function removeUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map(removeUndefinedDeep);
  }
  if (!value || typeof value !== "object" || isSpecialFirestoreValue(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, removeUndefinedDeep(child)]),
  );
}

function prepareForFirestore(value: unknown): unknown {
  return removeUndefinedDeep(sanitizeForCloud(value));
}

function mergeLocalOnlyFields<T extends object>(cloud: T, local?: T): T {
  if (!local) return cloud;
  const merged: Record<string, unknown> = { ...(cloud as Record<string, unknown>) };
  const localRecord = local as Record<string, unknown>;
  for (const key of LOCAL_ONLY_KEYS) {
    if (key in localRecord) merged[key] = localRecord[key];
  }
  return merged as T;
}

function mergeItineraryDays(cloud: DayData[], local: DayData[]): DayData[] {
  const localDays = new Map(local.map((day) => [day.id, day]));
  return cloud.map((day) => {
    const localDay = localDays.get(day.id);
    if (!localDay) return day;
    const localActivities = new Map(localDay.activities.map((activity) => [activity.id, activity]));
    return {
      ...day,
      activities: day.activities.map((activity) => mergeLocalOnlyFields(activity, localActivities.get(activity.id))),
    };
  });
}

function mergeCollectionItems<T extends SyncableItem>(cloud: T[], local: T[]): T[] {
  const localById = new Map(local.map((item) => [item.id, item]));
  return cloud.map((item) => mergeLocalOnlyFields(item, localById.get(item.id)));
}

function getServerMillis(value: unknown): number | undefined {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return undefined;
}

function hasNewerLocalValue(local: SyncableItem, cloudData: DocumentData): boolean {
  const localTime = local.updatedAt;
  const cloudTime = typeof cloudData.clientUpdatedAt === "number" ? cloudData.clientUpdatedAt : undefined;
  return Boolean(localTime && cloudTime && localTime > cloudTime);
}

async function writeAggregate<T>(
  firestore: Firestore,
  user: User,
  suffix: string,
  payloadKey: string,
  payload: T,
): Promise<void> {
  await setDoc(doc(firestore, userPath(user, suffix)), prepareForFirestore({
    [payloadKey]: payload,
    clientUpdatedAt: Date.now(),
    updatedAt: serverTimestamp(),
  }) as Record<string, unknown>, { merge: true });
}

async function readAggregate<T>(
  firestore: Firestore,
  user: User,
  suffix: string,
  payloadKey: string,
): Promise<{ exists: boolean; payload?: T; serverUpdatedAt?: number }> {
  const snapshot = await getDoc(doc(firestore, userPath(user, suffix)));
  const data = snapshot.data();
  return {
    exists: snapshot.exists(),
    payload: data && payloadKey in data ? data[payloadKey] as T : undefined,
    serverUpdatedAt: data ? getServerMillis(data.updatedAt) : undefined,
  };
}

async function writeCollection<T extends SyncableItem>(
  firestore: Firestore,
  user: User,
  suffix: string,
  items: T[],
): Promise<void> {
  const reference = collection(firestore, userPath(user, suffix));
  const cloudSnapshot = await getDocs(reference);
  const localIds = new Set(items.map((item) => item.id));

  for (const cloudDocument of cloudSnapshot.docs) {
    if (!localIds.has(cloudDocument.id)) await deleteDoc(cloudDocument.ref);
  }
  await Promise.all(items.map((item) => setDoc(doc(reference, item.id), prepareForFirestore({
    ...item,
    clientUpdatedAt: item.updatedAt || Date.now(),
    updatedAt: serverTimestamp(),
  }) as Record<string, unknown>)));
}

async function readCollection<T extends SyncableItem>(
  firestore: Firestore,
  user: User,
  suffix: string,
): Promise<T[]> {
  const snapshot = await getDocs(collection(firestore, userPath(user, suffix)));
  return snapshot.docs.map((item) => {
    const data = item.data();
    const clientUpdatedAt = data.clientUpdatedAt;
    const payload = { ...data };
    delete payload.updatedAt;
    delete payload.clientUpdatedAt;
    return {
      ...payload,
      ...(typeof clientUpdatedAt === "number" ? { updatedAt: clientUpdatedAt } : {}),
    } as T;
  });
}

async function pushSection(section: CloudSyncSection): Promise<void> {
  const user = getAuthenticatedUser();
  if (!canUseCloud(user) || !db) return;
  setSyncStatus("sincronizzazione");

  if (section === "itinerary") {
    await writeAggregate(db, user, "data/itinerary", "days", await repository.getTripDays([]));
  } else if (section === "completedActivities") {
    await writeAggregate(db, user, "data/completed_activities", "list", await repository.getCompletedActivities());
  } else if (section === "checklists") {
    await writeAggregate(db, user, "data/checklists", "list", await repository.getChecklists([]));
  } else if (section === "accommodations") {
    await writeCollection(db, user, "accommodations", await repository.getAccommodations([]));
  } else if (section === "transports") {
    await writeCollection(db, user, "transports", await repository.getTransports([]));
  } else if (section === "budget") {
    await writeCollection(db, user, "budget", await repository.getBudgetEntries([]));
  }
  setSyncStatus("sincronizzato");
  pendingSections.delete(section);
}

function queueSection(section: CloudSyncSection): void {
  if (applyingRemote) return;
  if (!canUseCloud()) {
    if (!navigator.onLine && activeUid === auth?.currentUser?.uid) pendingSections.add(section);
    return;
  }
  const previous = queuedWrites.get(section) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => pushSection(section))
    .catch((error: unknown) => {
      console.error(`[SYNC] Errore sincronizzazione ${section}:`, error);
      pendingSections.add(section);
      setSyncStatus(navigator.onLine ? "errore" : "locale");
    });
  queuedWrites.set(section, next);
}

async function initialiseAggregate<T>(
  user: User,
  firestore: Firestore,
  _section: CloudSyncSection,
  suffix: string,
  payloadKey: string,
  local: T,
  saveLocal: (value: T) => Promise<void>,
): Promise<void> {
  const cloud = await readAggregate<T>(firestore, user, suffix, payloadKey);
  if (cloud.exists && cloud.payload !== undefined) {
    applyingRemote = true;
    try { await saveLocal(cloud.payload); } finally { applyingRemote = false; }
    return;
  }
  if (Array.isArray(local) && local.length === 0) return;
  await writeAggregate(firestore, user, suffix, payloadKey, local);
}

async function initialiseCollection<T extends SyncableItem>(
  user: User,
  firestore: Firestore,
  _section: CloudSyncSection,
  suffix: string,
  local: T[],
  saveLocal: (value: T[]) => Promise<void>,
): Promise<void> {
  const reference = collection(firestore, userPath(user, suffix));
  const cloudSnapshot = await getDocs(reference);
  if (cloudSnapshot.empty) {
    if (local.length > 0) {
      await writeCollection(firestore, user, suffix, local);
    }
    return;
  }

  const cloudItems = await readCollection<T>(firestore, user, suffix);
  const cloudById = new Map(cloudItems.map((item) => [item.id, item]));
  const localOnly = local.filter((item) => !cloudById.has(item.id));
  const localNewer = local.filter((item) => {
    const cloud = cloudById.get(item.id);
    return cloud ? hasNewerLocalValue(item, cloud as DocumentData) : false;
  });
  const mergedItems = [...cloudItems, ...localOnly, ...localNewer];
  if (localOnly.length > 0 || localNewer.length > 0) {
    await writeCollection(firestore, user, suffix, mergedItems);
  }
  applyingRemote = true;
  try {
    const localWithCloudFields = mergeCollectionItems(mergedItems, local);
    await saveLocal(localWithCloudFields);
  } finally { applyingRemote = false; }
}

async function initialiseSync(user: User): Promise<void> {
  if (!db || !canUseCloud(user)) {
    setSyncStatus("locale");
    return;
  }
  setSyncStatus("sincronizzazione");
  const firestore = db;
  try {
    const localDays = await repository.getTripDays([]);
    await initialiseAggregate(user, firestore, "itinerary", "data/itinerary", "days", localDays, (value) => repository.saveTripDays(mergeItineraryDays(value as DayData[], localDays)));
    await initialiseAggregate(user, firestore, "completedActivities", "data/completed_activities", "list", await repository.getCompletedActivities(), (value) => repository.saveCompletedActivities(value as string[]));
    await initialiseAggregate(user, firestore, "checklists", "data/checklists", "list", await repository.getChecklists([]), (value) => repository.saveChecklists(value as Checklist[]));
    await initialiseCollection(user, firestore, "accommodations", "accommodations", await repository.getAccommodations([]), (value) => repository.saveAccommodations(value as Accommodation[]));
    await initialiseCollection(user, firestore, "transports", "transports", await repository.getTransports([]), (value) => repository.saveTransports(value as Transport[]));
    await initialiseCollection(user, firestore, "budget", "budget", await repository.getBudgetEntries([]), (value) => repository.saveBudgetEntries(value as BudgetEntry[]));
    setSyncStatus("sincronizzato");
  } catch (error) {
    console.error("[SYNC] Inizializzazione cloud fallita:", error);
    setSyncStatus(navigator.onLine ? "errore" : "locale");
  }
}

function listenAggregate<T>(
  firestore: Firestore,
  user: User,
  suffix: string,
  payloadKey: string,
  saveLocal: (value: T) => Promise<void>,
): Unsubscribe {
  return onSnapshot(doc(firestore, userPath(user, suffix)), { includeMetadataChanges: true }, async (snapshot: DocumentSnapshot) => {
    if (!snapshot.exists() || snapshot.metadata.hasPendingWrites) return;
    const payload = snapshot.data()?.[payloadKey] as T | undefined;
    if (payload === undefined) return;
    applyingRemote = true;
    try { await saveLocal(payload); } finally { applyingRemote = false; }
    setSyncStatus("sincronizzato");
  }, (error: Error) => {
    console.error(`[SYNC] Listener ${suffix} fallito:`, error);
    setSyncStatus(navigator.onLine ? "errore" : "locale");
  });
}

function listenCollection<T extends SyncableItem>(
  firestore: Firestore,
  user: User,
  suffix: string,
  saveLocal: (value: T[]) => Promise<void>,
): Unsubscribe {
  return onSnapshot(collection(firestore, userPath(user, suffix)), { includeMetadataChanges: true }, async (snapshot: QuerySnapshot) => {
    if (snapshot.metadata.hasPendingWrites) {
      setSyncStatus("sincronizzazione");
      return;
    }
    applyingRemote = true;
    const cloudItems = snapshot.docs.map((item) => {
      const data = item.data();
      const clientUpdatedAt = data.clientUpdatedAt;
      const payload = { ...data };
      delete payload.updatedAt;
      delete payload.clientUpdatedAt;
      return {
        ...payload,
        ...(typeof clientUpdatedAt === "number" ? { updatedAt: clientUpdatedAt } : {}),
      } as T;
    });
    try { await saveLocal(cloudItems); } finally { applyingRemote = false; }
    setSyncStatus("sincronizzato");
  }, (error: Error) => {
    console.error(`[SYNC] Listener ${suffix} fallito:`, error);
    setSyncStatus(navigator.onLine ? "errore" : "locale");
  });
}

export const syncService = {
  getSyncStatus(): SyncStatus { return currentSyncStatus; },
  getBudgetSyncStatus(): "sincronizzato" | "pending" | "errore" {
    return currentSyncStatus === "sincronizzazione" ? "pending" : currentSyncStatus === "locale" ? "errore" : currentSyncStatus;
  },

  startRealtimeSync(user: User): () => void {
    const validUser = getAuthenticatedUser();
    if (!db || !validUser || validUser.uid !== user.uid || user.uid === "local-bypass-user") {
      setSyncStatus("locale");
      return () => undefined;
    }
    activeUid = user.uid;
    const listeners: Unsubscribe[] = [];
    let active = true;
    registerCloudSyncHandler(queueSection);

    void initialiseSync(user).then(() => {
      if (!active || !db || !canUseCloud(user)) return;
      listeners.push(
        listenAggregate(db, user, "data/itinerary", "days", async (value) => {
          const localDays = await repository.getTripDays([]);
          await repository.saveTripDays(mergeItineraryDays(value as DayData[], localDays));
        }),
        listenAggregate(db, user, "data/completed_activities", "list", (value) => repository.saveCompletedActivities(value as string[])),
        listenAggregate(db, user, "data/checklists", "list", (value) => repository.saveChecklists(value as Checklist[])),
        listenCollection(db, user, "accommodations", async (value) => {
          const local = await repository.getAccommodations([]);
          await repository.saveAccommodations(mergeCollectionItems(value as Accommodation[], local));
        }),
        listenCollection(db, user, "transports", async (value) => {
          const local = await repository.getTransports([]);
          await repository.saveTransports(mergeCollectionItems(value as Transport[], local));
        }),
        listenCollection(db, user, "budget", async (value) => {
          const local = await repository.getBudgetEntries([]);
          await repository.saveBudgetEntries(mergeCollectionItems(value as BudgetEntry[], local));
        }),
      );
    });

    const handleOffline = () => setSyncStatus("locale");
    const handleOnline = () => {
      setSyncStatus("sincronizzazione");
      const pending = [...pendingSections];
      pendingSections.clear();
      void Promise.all(pending.map((section) => pushSection(section).catch((error: unknown) => {
        pendingSections.add(section);
        console.error(`[SYNC] Errore reinvio ${section}:`, error);
        setSyncStatus(navigator.onLine ? "errore" : "locale");
      }))).then(() => initialiseSync(user));
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      active = false;
      listeners.splice(0).forEach((unsubscribe) => unsubscribe());
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      registerCloudSyncHandler(null);
      if (activeUid === user.uid) activeUid = null;
    };
  },

  // Compatibility methods retained for existing callers.
  async pushNotes(): Promise<void> { return; },
  async pullNotes(): Promise<string | null> { return null; },
  async pushCompletedActivities(): Promise<void> { queueSection("completedActivities"); },
  async pullCompletedActivities(): Promise<string[] | null> { return null; },
  async pushBudget(): Promise<void> { queueSection("budget"); },
  async pullBudget(): Promise<BudgetEntry[] | null> { return null; },
  async pushAccommodations(): Promise<void> { queueSection("accommodations"); },
  async pullAccommodations(): Promise<Accommodation[] | null> { return null; },

  async getOrCreateUserProfile(user: User): Promise<{ onboardingCompleted: boolean }> {
    if (!db) return { onboardingCompleted: true };
    const userDocRef = doc(db, userPath(user, ""));
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      await setDoc(userDocRef, prepareForFirestore({ lastLoginAt: serverTimestamp() }) as Record<string, unknown>, { merge: true });
      return { onboardingCompleted: Boolean(snap.data().onboardingCompleted) };
    }
    await setDoc(userDocRef, prepareForFirestore({
      uid: user.uid,
      displayName: user.displayName || "Viaggiatore",
      email: user.email || "",
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      onboardingCompleted: false,
    }) as Record<string, unknown>);
    return { onboardingCompleted: false };
  },

  async completeUserProfileOnboarding(uid: string): Promise<void> {
    if (!db || !auth?.currentUser || auth.currentUser.uid !== uid) return;
    await setDoc(doc(db, userPath(auth.currentUser, "")), prepareForFirestore({
      onboardingCompleted: true,
      lastLoginAt: serverTimestamp(),
    }) as Record<string, unknown>, { merge: true });
  },
};
