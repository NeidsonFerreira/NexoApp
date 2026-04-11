export async function retry<T>(
  fn: () => Promise<T>,
  tentativas = 3,
  delay = 800,
  maxDelay = 5000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (tentativas <= 1) throw error;

    const nextDelay = Math.min(Math.round(delay * 1.8), maxDelay);
    const jitter = Math.random() * 250;

    await new Promise((resolve) => setTimeout(resolve, delay + jitter));

    return retry(fn, tentativas - 1, nextDelay, maxDelay);
  }
}
