import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  cancelAllBackgroundTasks,
  pauseBackgroundScheduler,
  resetBackgroundSchedulerForTests,
  resumeBackgroundScheduler,
  scheduleBackgroundTask,
} from './background-scheduler.js';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('background scheduler', () => {
  beforeEach(() => {
    resetBackgroundSchedulerForTests();
  });

  it('dedupes identical background tasks', async () => {
    let runs = 0;

    scheduleBackgroundTask('dedupe-a', 'background', async () => {
      runs += 1;
      await wait(20);
    });
    scheduleBackgroundTask('dedupe-a', 'background', async () => {
      runs += 1;
    });

    await wait(80);
    assert.equal(runs, 1);
  });

  it('drops background tasks while scheduler is paused', async () => {
    let runs = 0;

    pauseBackgroundScheduler();
    scheduleBackgroundTask('paused-task', 'background', async () => {
      runs += 1;
    });

    await wait(80);
    assert.equal(runs, 0);

    resumeBackgroundScheduler();
    scheduleBackgroundTask('after-resume', 'background', async () => {
      runs += 1;
    });

    await wait(80);
    assert.equal(runs, 1);
  });

  it('cancels queued and active tasks on logout clear', async () => {
    let completed = false;

    scheduleBackgroundTask('cancel-me', 'background', async (signal) => {
      await wait(50);
      if (!signal.aborted) {
        completed = true;
      }
    });

    cancelAllBackgroundTasks();
    await wait(100);
    assert.equal(completed, false);
  });
});
