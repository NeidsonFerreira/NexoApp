import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { getApps } from "firebase/app";
import { Platform } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { isExpoGoAndroid } from "./isExpoGoAndroid";
import { retry } from "./retry";
import { logError } from "./logger";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registrarPushNotificationsAsync(): Promise<string | null> {
  try {
    // ❌ não funciona no Expo Go Android
    if (isExpoGoAndroid()) return null;

    // ❌ precisa ser device físico
    if (!Device.isDevice) return null;

    // Android channel obrigatório
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    // permissões
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      console.log("❌ Permissão não concedida");
      return null;
    }

    // Garante Firebase inicializado antes de pedir token
    if (!getApps().length) {
      console.log("❌ Firebase não inicializado; abortando geração de token");
      return null;
    }

    // 🔥 projectId fixo (do google-services.json)
    const projectId = "nexo-8cc2c";
    const firebaseProjectId = Constants.expoConfig?.extra?.firebaseProjectId
      ?? process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    if (firebaseProjectId && firebaseProjectId !== projectId) {
      console.log(
        `❌ ProjectId divergente (firebase: ${firebaseProjectId}, notifications: ${projectId})`
      );
      return null;
    }

    // gera token Expo com retry
    const expoToken = await retry(async () => {
      const res = await Notifications.getExpoPushTokenAsync({ projectId });
      return res.data;
    });

    console.log("📲 Expo Push Token:", expoToken);

    // também logar token FCM puro
    const deviceToken = await Notifications.getDevicePushTokenAsync();
    console.log("🔥 FCM Token:", deviceToken);

    // 🔥 valida auth antes de salvar
    if (!auth.currentUser) {
      console.log("⚠️ Usuário não logado, token NÃO salvo no Firestore");
      return expoToken;
    }

    console.log("👤 Salvando token para UID:", auth.currentUser.uid);

    // salva direto no Firestore
    await setDoc(
      doc(db, "users", auth.currentUser.uid),
      {
        pushToken: expoToken,
        pushTokenUpdatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log("✅ Token salvo no Firestore");

    // também envia para Cloud Function
    try {
      const functions = getFunctions();
      const registrarPushToken = httpsCallable(functions, "registrarPushToken");
      await registrarPushToken({ pushToken: expoToken });
      console.log("✅ Token enviado para Cloud Function");
    } catch (fnError) {
      console.log("⚠️ Erro ao chamar Cloud Function:", fnError);
    }

    return expoToken;
  } catch (error) {
    console.log("❌ erro notificação:", error);
    logError(error, "notifications");
    return null;
  }
}
