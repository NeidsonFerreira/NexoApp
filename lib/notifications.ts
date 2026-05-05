import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { app, auth, db } from "../firebaseConfig";
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
    // 🔥 AJUSTE: Permite continuar em ambiente de desenvolvimento (DEV) mesmo sem dispositivo físico ou no Expo Go
    if (!__DEV__) {
      if (isExpoGoAndroid()) {
        console.log("⚠️ Execução abortada: Expo Go no Android não suporta notificações nativas em produção.");
        return null;
      }

      if (!Device.isDevice) {
        console.log("⚠️ Execução abortada: Notificações exigem um dispositivo físico em produção.");
        return null;
      }
    }

    // Android channel obrigatório
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    // Permissões
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      console.log("❌ Permissão não concedida");
      return null;
    }

    // Garante Firebase inicializado
    if (!app) {
      console.log("❌ Firebase não inicializado; abortando geração de token");
      return null;
    }

    // ProjectId do projeto Firebase usado no push
    const projectId =
      Constants.expoConfig?.extra?.firebaseProjectId ??
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

    if (!projectId) {
      console.log("❌ ProjectId não encontrado");
      return null;
    }

    // Gera token Expo com retry
    const expoToken = await retry(async () => {
      const res = await Notifications.getExpoPushTokenAsync({ projectId });
      return res.data;
    });

    console.log("📲 Expo Push Token:", expoToken);

    // 🔥 Proteção contra FIS_AUTH_ERROR
    if (!__DEV__) {
      let deviceToken: string | null = null;
      try {
        const res = await Notifications.getDevicePushTokenAsync();
        deviceToken = res?.data ?? null;
        console.log("🔥 FCM Token:", deviceToken);
      } catch (err) {
        console.log("⚠️ Falha ao obter FCM Token (ignorado em dev):", err);
      }
    }

    // 🔥 Valida auth antes de salvar
    if (!auth.currentUser) {
      console.log("⚠️ Usuário não logado, token NÃO salvo no Firestore");
      return expoToken;
    }

    // Salva direto no Firestore
    await setDoc(
      doc(db, "users", auth.currentUser.uid),
      {
        pushToken: expoToken,
        pushTokenUpdatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log("✅ Token salvo no Firestore");

    // Também envia para Cloud Function
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
    // 🔥 AJUSTE: Transformamos o log de erro em um aviso, para que ele não pare o fluxo do seu app com o código E_REGISTRATION_FAILED
    console.log("⚠️ Registro de notificação não finalizado (comum em dev/emuladores):", {
      code: err?.code ?? "sem_code",
      message: err?.message ?? String(error),
    });
    
    return null;
  }
}