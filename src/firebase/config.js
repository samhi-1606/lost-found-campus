// Firebase initialisation for the browser.
//
// Values come from Vite env vars in .env.local, never from source. Only the
// public web-app config belongs here; service-account keys and API secrets stay
// server-side and must never reach the frontend bundle.
//
// Initialisation is skipped when the config is incomplete so the app still
// renders instead of white-screening; the pages check `isFirebaseConfigured`.
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.trim() !== ""
);

export const FIREBASE_CONFIG_ERROR =
  "Firebase is not configured. Add the VITE_FIREBASE_* values to .env.local and restart the dev server.";

let auth = null;
let db = null;

if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db };
