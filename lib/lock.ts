const locks = new Set<string>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (locks.has(key)) {
    throw new Error("Ação já em andamento");
  }

  locks.add(key);

  try {
    return await fn();
  } finally {
    locks.delete(key);
  }
}
