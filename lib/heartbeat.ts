import { AppState } from "react-native";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { isOnline } from "./network";
import { logError } from "./logger";

let interval: ReturnType<typeof setInterval> | null = null;
let appState = "active";

AppState.addEventListener("change", (state) => {
  appState = state;
});

export function startHeartbeat() {
  if (interval) return;

  interval = setInterval(async () => {
    try {
      if (appState !== "active") return;
      if (!auth.currentUser?.uid) return;
      if (!(await isOnline())) return;

      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        lastSeen: new Date().toISOString(),
      });
    } catch (error) {
      logError(error, "heartbeat");
    }
  }, 300000);
}

export function stopHeartbeat() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
