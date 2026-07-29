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

  const queueTimer = setInterval(() => {
    void workflowEngine.processPendingJobs().catch((error: unknown) => {
      console.error('[automation-worker] Workflow queue processing failed', error);
    });

    void workflowEngine.processDueSchedules().catch((error: unknown) => {
      console.error('[automation-worker] Schedule processing failed', error);
    });

    if (orchestrationEngine) {
      void orchestrationEngine.processPendingJobs().catch((error: unknown) => {
        console.error('[automation-worker] Orchestration queue processing failed', error);
      });
    }
  }, intervalMs);

  const overdueTimer = setInterval(() => {
    void workflowEngine.processPendingJobs(1).catch((error: unknown) => {
      console.error('[automation-worker] Overdue check failed', error);
    });
  }, OVERDUE_CHECK_INTERVAL_MS);

  if (typeof queueTimer.unref === 'function') {
    queueTimer.unref();
  }

  if (typeof overdueTimer.unref === 'function') {
    overdueTimer.unref();
  }

  void workflowEngine.processPendingJobs().catch((error: unknown) => {
    console.error('[automation-worker] Initial workflow queue processing failed', error);
  });

  if (orchestrationEngine) {
    void orchestrationEngine.processPendingJobs().catch((error: unknown) => {
      console.error('[automation-worker] Initial orchestration queue processing failed', error);
    });
  }

  return () => {
    clearInterval(queueTimer);
    clearInterval(overdueTimer);
  };
}
