type RequestFn<T> = () => Promise<T>;

type QueueOptions = {
  key?: string;
  priority?: number;
};

type QueueTask<T> = {
  id: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  priority: number;
};

const activeRequests = new Map<string, Promise<unknown>>();
const queue: QueueTask<any>[] = [];

let running = 0;
let sequence = 0;

const MAX_CONCURRENT = 3;

function sortQueue() {
  queue.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id - b.id;
  });
}

function runNext() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const task = queue.shift();
    if (!task) return;

    running += 1;

    void task
      .run()
      .then((result) => {
        task.resolve(result);
      })
      .catch((error) => {
        task.reject(error);
      })
      .finally(() => {
        running -= 1;
        runNext();
      });
  }
}

export function dedupeRequest<T>(key: string, fn: RequestFn<T>): Promise<T> {
  if (activeRequests.has(key)) {
    return activeRequests.get(key) as Promise<T>;
  }

  const promise = fn().finally(() => {
    activeRequests.delete(key);
  });

  activeRequests.set(key, promise);
  return promise;
}

function enqueueWithoutDedupe<T>(
  fn: RequestFn<T>,
  priority: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      id: ++sequence,
      run: fn,
      resolve,
      reject,
      priority,
    });

    sortQueue();
    runNext();
  });
}

export function enqueue<T>(
  fn: RequestFn<T>,
  options?: QueueOptions
): Promise<T> {
  const priority = options?.priority ?? 0;
  const key = options?.key;

  if (key) {
    return dedupeRequest(key, () => enqueueWithoutDedupe(fn, priority));
  }

  return enqueueWithoutDedupe(fn, priority);
}

export function getRequestManagerState() {
  return {
    running,
    queued: queue.length,
    activeKeys: activeRequests.size,
  };
}