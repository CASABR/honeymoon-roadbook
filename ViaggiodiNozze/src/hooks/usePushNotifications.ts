import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { storageService } from '../storage/storageService';
import { getTripConfig } from '../utils/tripConfig';

// Chiave VAPID pubblica (da environment con fallback compatibile)
const PUBLIC_VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BGw2M2Mu8UFc2OjWFfhNl9HMzrMpOYfuI8MIwLQi8bkBaxJ4vTPkhd79u8D0SMw7qb0fHCuy0syAQ1exSxMRAR8'; 

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      
      // Controlla se c'è già una subscription con timeout di sicurezza di 4s
      const checkSub = async () => {
        try {
          const registrationPromise = navigator.serviceWorker.ready;
          const timeoutPromise = new Promise<ServiceWorkerRegistration | null>((resolve) => 
            setTimeout(() => resolve(null), 4000)
          );
          const registration = await Promise.race([registrationPromise, timeoutPromise]);
          if (registration && isMounted) {
            const sub = await registration.pushManager.getSubscription();
            if (isMounted) {
              setSubscription(sub);
            }
          }
        } catch (err) {
          console.warn('[usePushNotifications] Errore verifica subscription iniziale:', err);
        }
      };

      checkSub();
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const subscribeToPush = async () => {
    if (!isSupported) {
      throw new Error("Push notifications non supportate in questo browser.");
    }

    setIsSubscribing(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      
      if (permissionResult !== 'granted') {
        throw new Error("Permesso negato per le notifiche.");
      }

      // Timeout di 6s per serviceWorker.ready
      const swPromise = navigator.serviceWorker.ready;
      const swTimeout = new Promise<ServiceWorkerRegistration>((_, reject) => 
        setTimeout(() => reject(new Error("Timeout Service Worker: attendi il caricamento o aggiorna la pagina.")), 6000)
      );
      const registration = await Promise.race([swPromise, swTimeout]);
      
      let sub = await registration.pushManager.getSubscription();
      
      if (!sub) {
        // Iscrizione reale usando la VAPID key
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
        });
      }
      
      setSubscription(sub);
      
      // Salva la subscription nel DB
      const role = storageService.getDeviceRole();
      let deviceId = localStorage.getItem('device_id');
      if (!deviceId) {
        deviceId = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('device_id', deviceId);
      }
      
      const tripConfig = getTripConfig();
      const tripId = tripConfig?.id?.trim();
      if (!tripId) {
        throw new Error("Nessun viaggio attivo trovato. Unisciti o crea un viaggio prima di attivare le notifiche.");
      }
      
      try {
        const firestorePromise = setDoc(doc(db, 'push_subscribers', deviceId), {
          subscription: JSON.parse(JSON.stringify(sub)),
          role: role,
          deviceId: deviceId,
          tripId: tripId,
          uid: auth.currentUser?.uid || null,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        const firestoreTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout salvataggio cloud")), 5000)
        );
        await Promise.race([firestorePromise, firestoreTimeout]);
      } catch (dbErr) {
        console.warn('[usePushNotifications] Errore salvataggio subscriber su cloud (continua in locale):', dbErr);
      }

      return sub;
    } catch (err: any) {
      console.error('Errore durante l\'iscrizione alle notifiche:', err);
      throw err;
    } finally {
      setIsSubscribing(false);
    }
  };

  const unsubscribeFromPush = async () => {
    setIsSubscribing(true);

    try {
      // 1. Unsubscribe dal Browser Push Manager con timeout di sicurezza di 4s
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const swReady = navigator.serviceWorker.ready;
          const swTimeout = new Promise<ServiceWorkerRegistration | null>((resolve) => 
            setTimeout(() => resolve(null), 4000)
          );
          const registration = await Promise.race([swReady, swTimeout]);
          if (registration) {
            const sub = await registration.pushManager.getSubscription();
            if (sub) {
              const unsubPromise = sub.unsubscribe();
              const unsubTimeout = new Promise<boolean>((resolve) => 
                setTimeout(() => resolve(true), 3000)
              );
              await Promise.race([unsubPromise, unsubTimeout]);
            }
          }
        } catch (swErr: any) {
          console.warn('[usePushNotifications] Errore disiscrizione browser:', swErr);
        }
      }

      // Imposta immediatamente lo stato locale disattivato
      setSubscription(null);

      // 2. Rimozione dal cloud /push_subscribers/{deviceId} con timeout di sicurezza di 4s
      const deviceId = localStorage.getItem('device_id');
      if (deviceId) {
        try {
          const delPromise = deleteDoc(doc(db, 'push_subscribers', deviceId));
          const delTimeout = new Promise<void>((resolve) => 
            setTimeout(() => {
              console.warn('[usePushNotifications] Timeout deleteDoc su Firestore (procedo)');
              resolve();
            }, 4000)
          );
          await Promise.race([delPromise, delTimeout]);
        } catch (dbErr: any) {
          console.warn('[usePushNotifications] Errore rimozione da push_subscribers:', dbErr);
          // Non consideriamo fatale se il server era irraggiungibile: il browser ha comunque revocato la chiave
        }
      }

      return true;
    } catch (err: any) {
      console.error('Errore durante la disattivazione notifiche:', err);
      throw err;
    } finally {
      // Garantisce al 100% che il flag di salvataggio si resetti sempre
      setIsSubscribing(false);
    }
  };

  return { isSupported, permission, subscription, subscribeToPush, unsubscribeFromPush, isSubscribing };
}
