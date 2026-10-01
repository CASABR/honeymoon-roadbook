import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

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
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});