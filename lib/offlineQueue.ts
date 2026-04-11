import AsyncStorage from "@react-native-async-storage/async-storage";
import { logError, logWarn } from "./logger";
import { isOnline } from "./network";

const KEY = "offline_queue_v3";
const MAX_QUEUE_ITEMS = 100;
const MAX_RETRIES = 5;
const ITEM_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const PROCESS_INTERVAL_MS = 7000;

export type QueueItem = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  nextRetryAt: number;
};

type NewQueueItem = {
  id: string;
  type: string;
  payload: unknown;
};

async function getQueue(): Promise<QueueItem[]> {
  try {
    const data = await AsyncStorage.getItem(KEY);
    if (!data) return [];

    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(Boolean) as QueueItem[];
  } catch (error) {
    logError(error, "offlineQueue:getQueue");
    return [];
  }
}

async function saveQueue(queue: QueueItem[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  } catch (error) {
    logError(error, "offlineQueue:saveQueue");
  }
}

function isExpired(item: QueueItem) {
  return Date.now() - item.createdAt > ITEM_TTL_MS;
}

function backoffMs(attempts: number) {
  const base = Math.min(60000, 2000 * 2 ** Math.max(0, attempts - 1));
  return base;
}

export async function addToQueue(item: NewQueueItem) {
  const queue = await getQueue();

  const alreadyExists = queue.some(
    (q) => q.id === item.id || (q.type === item.type && JSON.stringify(q.payload) === JSON.stringify(item.payload))
  );

  if (alreadyExists) {
    return;
  }

  if (queue.length >= MAX_QUEUE_ITEMS) {
    queue.shift();
    logWarn("Fila offline atingiu limite e removeu item mais antigo", { max: MAX_QUEUE_ITEMS }, "offlineQueue");
  }

  queue.push({
    ...item,
    createdAt: Date.now(),
    attempts: 0,
    nextRetryAt: 0,
  });

  await saveQueue(queue);
}

export async function processQueue(
  executor: (item: QueueItem) => Promise<void>
) {
  const online = await isOnline();
  if (!online) return;

  const queue = await getQueue();
  const remaining: QueueItem[] = [];

  for (const item of queue) {
    if (isExpired(item)) {
      logWarn("Item expirado removido da fila offline", { id: item.id, type: item.type }, "offlineQueue");
      continue;
    }

    if (item.nextRetryAt > Date.now()) {
      remaining.push(item);
      continue;
    }

    try {
      await executor(item);
    } catch (error) {
      const attempts = item.attempts + 1;

      if (attempts >= MAX_RETRIES) {
        logError(
          {
            message: "Item excedeu tentativas máximas e foi descartado",
            originalError: error,
            item,
          },
          "offlineQueue"
        );
        continue;
      }

      remaining.push({
        ...item,
        attempts,
        nextRetryAt: Date.now() + backoffMs(attempts),
      });

      logError(
        {
          message: "Falha ao processar item da fila offline",
          originalError: error,
          itemId: item.id,
          attempts,
        },
        "offlineQueue"
      );
    }
  }

  await saveQueue(remaining);
}

let started = false;
let interval: ReturnType<typeof setInterval> | null = null;
let processing = false;

export function startAutoRecovery(
  executor: (item: QueueItem) => Promise<void>
) {
  if (started) return;
  started = true;

  interval = setInterval(async () => {
    if (processing) return;

    try {
      processing = true;
      await processQueue(executor);
    } catch (error) {
      logError(error, "offlineQueue:startAutoRecovery");
    } finally {
      processing = false;
    }
  }, PROCESS_INTERVAL_MS);
}

export function stopAutoRecovery() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  started = false;
  processing = false;
}

export async function clearOfflineQueue() {
  await AsyncStorage.removeItem(KEY);
}

export async function getOfflineQueueSize() {
  const queue = await getQueue();
  return queue.length;
}