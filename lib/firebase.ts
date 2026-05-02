import AsyncStorage from "@react-native-async-storage/async-storage";
import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import Constants from "expo-constants";

const requiredEnv = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

// Validação nativa das variáveis essenciais
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Firebase env ausente: ${key}`);
  }
}

// Utiliza o App ID configurado no app.json para o Android nativo
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: Constants.expoConfig?.extra?.firebaseAppId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const EXPECTED_FIREBASE_PROJECT_ID = "nexo-8cc2c";

if (firebaseConfig.projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
  console.warn(
    `[firebase] projectId divergente. Atual=${firebaseConfig.projectId} Esperado=${EXPECTED_FIREBASE_PROJECT_ID}`
  );
}

const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
})();

const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, "southamerica-east1");

auth.languageCode = "pt-BR";

export { app, auth, db, storage, functions };