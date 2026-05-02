import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { app, auth, db } from "../firebaseConfig"; // importa do firebaseConfig.js
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

    // Garante Firebase inicializado com config Android
    if (!app) {
      console.log("❌ Firebase não inicializado; abortando geração de token");
      return null;
    }
    console.log("✅ Firebase inicializado com App ID:", app.options.appId);

    // projectId do projeto Firebase usado no push
    const projectId = Constants.expoConfig?.extra?.firebaseProjectId
      ?? process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

    if (!projectId) {
      console.log("❌ ProjectId não encontrado");
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
      const functions = getFunctions(app);
      const registrarPushToken = httpsCallable(functions, "registrarPushToken");
      await registrarPushToken({ pushToken: expoToken });
      console.log("✅ Token enviado para Cloud Function");
    } catch (fnError) {
      console.log("⚠️ Erro ao chamar Cloud Function:", fnError);
    }

    return expoToken;
  } catch (error) {
    const err = error as { code?: string; message?: string; stack?: string };
    console.log("❌ erro notificação detalhado:", {
      code: err?.code ?? "sem_code",
      message: err?.message ?? String(error),
      stack: err?.stack ?? null,
      firebaseAppName: app?.name ?? "desconhecido",
      firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? null,
      firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? null,
    });
    logError(error, "notifications");
    return null;
  }
}
