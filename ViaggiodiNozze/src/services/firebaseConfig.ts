import { initializeApp } from 'firebase/app';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCAyt5Udm2SQlfpjNZJV1J-t8MkV9x2LKc",
  authDomain: "hitchyapp.firebaseapp.com",
  projectId: "hitchyapp",
  storageBucket: "hitchyapp.firebasestorage.app",
  messagingSenderId: "243881875788",
  appId: "1:243881875788:web:65d3b38eda918540c097e9",
  measurementId: "G-RHQDQ65ETD"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Abilita la persistenza offline multi-tab per massimizzare la resilienza
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn('[Firebase] Multiple tabs open, persistence can only be enabled in one tab at a a time.');
  } else if (err.code == 'unimplemented') {
    console.warn('[Firebase] The current browser does not support all of the features required to enable persistence');
  }
});

export { db };
