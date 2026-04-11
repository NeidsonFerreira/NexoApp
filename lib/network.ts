import NetInfo from "@react-native-community/netinfo";

let lastCheck = 0;
let lastStatus = true;
let listenerStarted = false;

const CACHE_MS = 3000;
const PROBE_TIMEOUT_MS = 2500;

const PROBE_URLS = [
  "https://clients3.google.com/generate_204",
  "https://www.google.com/generate_204",
];

async function probeUrl(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });

    return response.status === 204 || response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function probeInternet(): Promise<boolean> {
  for (const url of PROBE_URLS) {
    const ok = await probeUrl(url);
    if (ok) return true;
  }
  return false;
}

function updateCache(status: boolean) {
  lastStatus = status;
  lastCheck = Date.now();
}

function ensureListener() {
  if (listenerStarted) return;
  listenerStarted = true;

  NetInfo.addEventListener((state) => {
    void (async () => {
      try {
        if (!state.isConnected || state.isInternetReachable === false) {
          updateCache(false);
          return;
        }

        const ok = await probeInternet();
        updateCache(ok);
      } catch {
        updateCache(Boolean(state.isConnected));
      }
    })();
  });
}

export async function isOnline(): Promise<boolean> {
  ensureListener();

  const now = Date.now();
  if (now - lastCheck < CACHE_MS) {
    return lastStatus;
  }

  try {
    const state = await NetInfo.fetch();

    if (!state.isConnected || state.isInternetReachable === false) {
      updateCache(false);
      return false;
    }

    const ok = await probeInternet();
    updateCache(ok);
    return ok;
  } catch {
    updateCache(lastStatus);
    return lastStatus;
  }
}