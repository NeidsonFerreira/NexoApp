import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

const CACHE_KEY = "force_update_config_v1";

function compareVersions(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;

    if (na > nb) return true;
    if (na < nb) return false;
  }

  return false;
}

async function getRemoteConfig() {
  try {
    const snap = await getDoc(doc(db, "config", "app"));
    const data = snap.data() ?? null;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    return data;
  } catch {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  }
}

export async function checkForceUpdate(): Promise<boolean> {
  try {
    const config = await getRemoteConfig();
    const minVersion = config?.minVersion;
    const current = Constants.expoConfig?.version;

    if (!minVersion || !current) return false;

    return compareVersions(minVersion, current);
  } catch {
    return false;
  }
}
