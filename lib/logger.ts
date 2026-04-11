import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "./firebase";

const STORAGE_KEY = "app_logs_v2";
const MAX_LOGS = 200;
const FLUSH_BATCH_SIZE = 50;

export type LogLevel = "error" | "warn" | "info";

export type LogEntry = {
  level: LogLevel;
  message: string;
  context?: string;
  payload?: unknown;
  userId: string | null;
  createdAt: number;
};

let remoteTransport: ((logs: LogEntry[]) => Promise<void>) | null = null;
let flushing = false;

function serializePayload(payload: unknown) {
  try {
    if (payload instanceof Error) {
      return {
        name: payload.name,
        message: payload.message,
        stack: payload.stack,
      };
    }

    return payload;
  } catch {
    return String(payload);
  }
}

async function readLogs(): Promise<LogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeLogs(logs: LogEntry[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // nunca quebrar o app por log
  }
}

async function saveLog(entry: LogEntry) {
  try {
    const logs = await readLogs();
    logs.push(entry);

    while (logs.length > MAX_LOGS) {
      logs.shift();
    }

    await writeLogs(logs);
  } catch {
    // nunca quebrar o app por log
  }
}

export function setRemoteLoggerTransport(
  transport: (logs: LogEntry[]) => Promise<void>
) {
  remoteTransport = transport;
}

export async function flushLogs(): Promise<void> {
  if (!remoteTransport || flushing) return;

  flushing = true;

  try {
    const logs = await readLogs();
    if (!logs.length) return;

    const batch = logs.slice(0, FLUSH_BATCH_SIZE);
    await remoteTransport(batch);

    const remaining = logs.slice(batch.length);
    await writeLogs(remaining);
  } catch {
    // mantém logs locais para próxima tentativa
  } finally {
    flushing = false;
  }
}

export async function log(
  level: LogLevel,
  message: string,
  payload?: unknown,
  context?: string
) {
  const entry: LogEntry = {
    level,
    message,
    context,
    payload: serializePayload(payload),
    userId: auth.currentUser?.uid ?? null,
    createdAt: Date.now(),
  };

  if (__DEV__) {
    if (level === "error") {
      console.log("[ERROR]", context ?? "unknown", message, entry.payload);
    } else if (level === "warn") {
      console.log("[WARN]", context ?? "unknown", message, entry.payload);
    } else {
      console.log("[INFO]", context ?? "unknown", message, entry.payload);
    }
  }

  await saveLog(entry);
}

export function logError(error: unknown, context?: string) {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "unknown";

  void log("error", msg, error, context);
}

export function logWarn(message: string, payload?: unknown, context?: string) {
  void log("warn", message, payload, context);
}

export function logEvent(name: string, payload?: unknown, context = "event") {
  void log("info", name, payload, context);
}

export async function getStoredLogs() {
  return readLogs();
}

export async function clearLogs() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}