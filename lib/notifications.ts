import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
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
    if (isExpoGoAndroid()) return null;
    if (!Device.isDevice) return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) return null;

    const token = await retry(async () => {
      return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    });

    if (auth.currentUser) {
      await setDoc(
        doc(db, "users", auth.currentUser.uid),
        {
          pushToken: token,
          pushTokenUpdatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return token;
  } catch (error) {
    logError(error, "notifications");
    return null;
  }
}
