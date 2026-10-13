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
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      
      // Controlla se c'è già una subscription
      navigator.serviceWorker.ready.then(registration => {
        registration.pushManager.getSubscription().then(sub => {
          if (sub) {
            setSubscription(sub);
          }
        });
      });
    }
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

      const registration = await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      
      if (!sub) {
        // Iscrizione reale usando la VAPID key
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
        });
      }
      
      setSubscription(sub);
      console.log('Push Subscription:', JSON.stringify(sub));
      
      // Salva la subscription nel DB
      const role = storageService.getDeviceRole();
      // Generate a simple device id if we don't have one
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
      
      await setDoc(doc(db, 'push_subscribers', deviceId), {
        subscription: JSON.parse(JSON.stringify(sub)),
        role: role,
        deviceId: deviceId,
        tripId: tripId,
        uid: auth.currentUser?.uid || null,
        updatedAt: new Date().toISOString()
      }, { merge: true });

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
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }

      setSubscription(null);

      const deviceId = localStorage.getItem('device_id');
      if (deviceId) {
        await deleteDoc(doc(db, 'push_subscribers', deviceId));
      }
      
      return true;
    } catch (err: any) {
      console.error('Errore durante la disattivazione:', err);
      throw err;
    } finally {
      setIsSubscribing(false);
    }
  };

  return { isSupported, permission, subscription, subscribeToPush, unsubscribeFromPush, isSubscribing };
}
