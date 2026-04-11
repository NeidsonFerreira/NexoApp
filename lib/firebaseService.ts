import { retry } from "./retry";
import { withTimeout } from "./utils";
import { isOnline } from "./network";
import { logError } from "./logger";
import { enqueue } from "./requestManager";

type SafeRequestOptions = {
  timeoutMs?: number;
  tentativas?: number;
  exigirInternet?: boolean;
  dedupeKey?: string;
  priority?: number;
};

export async function safeRequest<T>(
  fn: () => Promise<T>,
  options?: SafeRequestOptions
): Promise<T> {
  const {
    timeoutMs = 10000,
    tentativas = 3,
    exigirInternet = true,
    dedupeKey,
    priority = 0,
  } = options ?? {};

  return enqueue(
    async () => {
      if (exigirInternet) {
        const online = await isOnline();
        if (!online) {
          throw new Error("Sem conexão com a internet.");
        }
      }

      try {
        return await retry(() => withTimeout(fn(), timeoutMs), tentativas);
      } catch (error) {
        await logError(error, "safeRequest");
        throw error;
      }
    },
    {
      key: dedupeKey,
      priority,
    }
  );
}