import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rate_limit_v3";

type ActionMap = Record<string, number[]>;

async function readActions(): Promise<ActionMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActionMap) : {};
  } catch {
    return {};
  }
}

async function writeActions(actions: ActionMap) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(actions));
  } catch {
    // nunca quebrar o app por rate limit
  }
}

export async function checkRateLimit(
  key: string,
  limit = 5,
  interval = 60000
) {
  const now = Date.now();
  const actions = await readActions();

  if (!actions[key]) {
    actions[key] = [];
  }

  actions[key] = actions[key].filter((timestamp) => now - timestamp < interval);

  if (actions[key].length >= limit) {
    throw new Error("Muitas ações. Tente novamente.");
  }

  actions[key].push(now);
  await writeActions(actions);
}

export async function resetRateLimit(key?: string) {
  if (!key) {
    await AsyncStorage.removeItem(KEY);
    return;
  }

  const actions = await readActions();
  delete actions[key];
  await writeActions(actions);
}