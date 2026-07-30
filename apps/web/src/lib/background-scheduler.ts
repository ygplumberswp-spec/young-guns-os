import { shouldAllowBackgroundPreload } from './network-awareness';

export type BackgroundTaskPriority = 'foreground' | 'background' | 'expensive';

type ScheduledTask = {
  id: string;
  priority: BackgroundTaskPriority;
  run: (signal: AbortSignal) => Promise<void>;
  controller: AbortController;
};

const MAX_BACKGROUND_CONCURRENCY = 2;
const MAX_EXPENSIVE_CONCURRENCY = 1;

let paused = false;
let runningBackground = 0;
let runningExpensive = 0;
const queue: ScheduledTask[] = [];
const activeTasks = new Map<string, ScheduledTask>();
const dedupeKeys = new Set<string>();

export function pauseBackgroundScheduler(): void {
  paused = true;
}

export function resumeBackgroundScheduler(): void {
  paused = false;
  drainQueue();
}

export function cancelAllBackgroundTasks(): void {
  for (const task of activeTasks.values()) {
    task.controller.abort();
  }
  for (const task of queue) {
    task.controller.abort();
  }
  queue.length = 0;
  activeTasks.clear();
  dedupeKeys.clear();
  runningBackground = 0;
  runningExpensive = 0;
}

/** Test-only reset for scheduler state. */
export function resetBackgroundSchedulerForTests(): void {
  cancelAllBackgroundTasks();
  paused = false;
}

export function scheduleBackgroundTask(
  dedupeKey: string,
  priority: BackgroundTaskPriority,
  run: (signal: AbortSignal) => Promise<void>,
): void {
  if (priority !== 'foreground') {
    if (paused || !shouldAllowBackgroundPreload()) {
      return;
    }
    if (dedupeKeys.has(dedupeKey)) {
      return;
    }
  }

  dedupeKeys.add(dedupeKey);

  const controller = new AbortController();
  const task: ScheduledTask = {
    id: dedupeKey,
    priority,
    run,
    controller,
  };

  if (priority === 'foreground') {
    void executeTask(task);
    return;
  }

  queue.push(task);
  drainQueue();
}

function drainQueue(): void {
  if (paused || !shouldAllowBackgroundPreload()) {
    return;
  }

  for (let i = 0; i < queue.length; i += 1) {
    const task = queue[i];
    if (!task) continue;

    if (task.priority === 'expensive' && runningExpensive >= MAX_EXPENSIVE_CONCURRENCY) {
      continue;
    }

    if (task.priority === 'background' && runningBackground >= MAX_BACKGROUND_CONCURRENCY) {
      continue;
    }

    queue.splice(i, 1);
    i -= 1;
    void executeTask(task);
  }
}

async function executeTask(task: ScheduledTask): Promise<void> {
  if (task.controller.signal.aborted) {
    dedupeKeys.delete(task.id);
    return;
  }

  activeTasks.set(task.id, task);

  if (task.priority === 'background') {
    runningBackground += 1;
  } else if (task.priority === 'expensive') {
    runningExpensive += 1;
  }

  try {
    await task.run(task.controller.signal);
  } catch {
    // background preload failures are non-fatal
  } finally {
    activeTasks.delete(task.id);
    dedupeKeys.delete(task.id);

    if (task.priority === 'background') {
      runningBackground = Math.max(0, runningBackground - 1);
    } else if (task.priority === 'expensive') {
      runningExpensive = Math.max(0, runningExpensive - 1);
    }

    drainQueue();
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseBackgroundScheduler();
      return;
    }
    resumeBackgroundScheduler();
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    resumeBackgroundScheduler();
  });
}
