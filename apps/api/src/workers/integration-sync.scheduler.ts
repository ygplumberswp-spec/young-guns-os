import type { BackgroundWorkOrchestratorService } from '../services/background-work-orchestrator.service.js';
import type { IntegrationSyncOrchestratorService } from '../services/integration-sync-orchestrator.service.js';

const DEFAULT_INTERVAL_MS = 60_000;

export function startIntegrationSyncScheduler(
  orchestrator: IntegrationSyncOrchestratorService | BackgroundWorkOrchestratorService,
  options?: { intervalMs?: number },
): () => void {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  let tickRunning = false;

  async function runTick(): Promise<void> {
    if (tickRunning) {
      return;
    }

    tickRunning = true;

    try {
      if ('processTick' in orchestrator) {
        await orchestrator.processTick();
      } else {
        await orchestrator.runScheduledSyncs();
      }
    } catch (error: unknown) {
      console.error('[integration-sync-scheduler] Tick failed', error);
    } finally {
      tickRunning = false;
    }
  }

  const timer = setInterval(() => {
    void runTick();
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  void runTick();

  return () => {
    clearInterval(timer);
  };
}
