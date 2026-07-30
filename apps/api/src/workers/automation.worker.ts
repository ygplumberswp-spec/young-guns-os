import type { WorkflowEngineService } from '../services/workflow-engine.service.js';
import type { AgentOrchestrationEngineService } from '../services/agent-orchestration-engine.service.js';

const DEFAULT_INTERVAL_MS = 5_000;
const OVERDUE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

type AutomationWorkers = {
  workflowEngine: WorkflowEngineService;
  orchestrationEngine: AgentOrchestrationEngineService;
};

export function startAutomationWorkers(
  workers: AutomationWorkers | WorkflowEngineService,
  options?: { intervalMs?: number },
): () => void {
  const workflowEngine = 'workflowEngine' in workers ? workers.workflowEngine : workers;
  const orchestrationEngine = 'orchestrationEngine' in workers ? workers.orchestrationEngine : null;
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;

  let queueTickRunning = false;
  let overdueTickRunning = false;

  async function runQueueTick(): Promise<void> {
    if (queueTickRunning) {
      return;
    }

    queueTickRunning = true;

    try {
      await workflowEngine.processPendingJobs();
      await workflowEngine.processDueSchedules();

      if (orchestrationEngine) {
        await orchestrationEngine.processPendingJobs();
      }
    } catch (error: unknown) {
      console.error('[automation-worker] Queue tick failed', error);
    } finally {
      queueTickRunning = false;
    }
  }

  async function runOverdueTick(): Promise<void> {
    if (overdueTickRunning) {
      return;
    }

    overdueTickRunning = true;

    try {
      await workflowEngine.processPendingJobs(1);
    } catch (error: unknown) {
      console.error('[automation-worker] Overdue check failed', error);
    } finally {
      overdueTickRunning = false;
    }
  }

  const queueTimer = setInterval(() => {
    void runQueueTick();
  }, intervalMs);

  const overdueTimer = setInterval(() => {
    void runOverdueTick();
  }, OVERDUE_CHECK_INTERVAL_MS);

  if (typeof queueTimer.unref === 'function') {
    queueTimer.unref();
  }

  if (typeof overdueTimer.unref === 'function') {
    overdueTimer.unref();
  }

  void runQueueTick();

  return () => {
    clearInterval(queueTimer);
    clearInterval(overdueTimer);
  };
}
