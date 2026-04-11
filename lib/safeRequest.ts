import { safeRequest as baseSafeRequest } from "./firebaseService";

type SafeRequestOptions = {
  retries?: number;
  timeout?: number;
  key?: string;
  priority?: number;
  requireInternet?: boolean;
};

export async function safeRequest<T>(
  fn: () => Promise<T>,
  options?: SafeRequestOptions
): Promise<T> {
  return baseSafeRequest(fn, {
    tentativas: options?.retries ?? 3,
    timeoutMs: options?.timeout ?? 10000,
    dedupeKey: options?.key,
    exigirInternet: options?.requireInternet ?? true,
    priority: options?.priority ?? 0,
  });
}