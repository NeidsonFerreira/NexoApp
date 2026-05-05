import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence, Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// Obtém as credenciais definidas no app.json / extra
const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey,
  authDomain: `${Constants.expoConfig?.extra?.firebaseProjectId}.firebaseapp.com`,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId,
  storageBucket: `${Constants.expoConfig?.extra?.firebaseProjectId}.appspot.com`,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId,
  appId: Constants.expoConfig?.extra?.firebaseAppId,
};

// Inicializa o app garantindo que não seja instanciado duas vezes
let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Configura a autenticação com segurança para não inicializar duas vezes
let auth: Auth;

try {
  // Tenta obter a instância de autenticação caso já exista
  auth = getAuth(app);
} catch {
  // Se não existir, inicializa com a persistência
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

const db = getFirestore(app);
const functions = getFunctions(app);

export { app, auth, db, functions };