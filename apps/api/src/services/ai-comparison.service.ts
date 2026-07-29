import { and, desc, eq } from 'drizzle-orm';
import type {
  AiRoutingCategory,
  CreateAiComparisonRunRequest,
  AiComparisonRunSummary,
} from '@titan/shared';
import type { AuraGenerateRequest } from '@titan/aura';
import type { DatabaseClient } from '@titan/db';
import { aiComparisonResults, aiComparisonRuns } from '@titan/db';
import type { AiProviderResilienceService } from './ai-provider-resilience.service.js';

export class AiComparisonError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AiComparisonError';
  }
}

type StaffScope = { companyId: string; userId: string };

type AiComparisonDeps = {
  db: DatabaseClient;
  aiProviderResilienceService: AiProviderResilienceService;
};

export class AiComparisonService {
  constructor(private readonly deps: AiComparisonDeps) {}

  async createComparisonRun(
    scope: StaffScope,
    input: CreateAiComparisonRunRequest,
    request: AuraGenerateRequest,
  ): Promise<AiComparisonRunSummary> {
    const targets = input.providerTargets?.length
      ? input.providerTargets
      : await this.deps.aiProviderResilienceService.listConfiguredTargets(scope.companyId);

    if (targets.length < 2) {
      throw new AiComparisonError(
        'INSUFFICIENT_PROVIDERS',
        'Comparison mode requires at least two configured providers.',
      );
    }

    const [run] = await this.deps.db
      .insert(aiComparisonRuns)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        subject: input.subject,
        taskPrompt: input.taskPrompt,
        routingCategory: input.routingCategory ?? null,
        status: 'pending_approval',
        metadata: { targetCount: targets.length },
      })
      .returning();

    const results = await Promise.all(
      targets.slice(0, 4).map(async (target) => {
        const started = Date.now();
        const generation = await this.deps.aiProviderResilienceService.generateForTarget(
          scope.companyId,
          request,
          {
            operationType: 'analysis',
            routingCategory: input.routingCategory,
            userId: scope.userId,
            providerKey: target.providerKey,
            modelKey: target.modelKey,
            providerId: target.providerId,
          },
        );

        const [row] = await this.deps.db
          .insert(aiComparisonResults)
          .values({
            comparisonRunId: run!.id,
            companyId: scope.companyId,
            providerId: generation.providerId,
            providerKey: generation.providerKey as typeof aiComparisonResults.$inferInsert.providerKey,
            modelKey: generation.modelKey,
            responseContent: generation.content,
            promptTokens: generation.promptTokens,
            completionTokens: generation.completionTokens,
            latencyMs: Date.now() - started,
            metadata: { failoverCount: generation.failoverCount },
          })
          .returning();

        return row!;
      }),
    );

    const disagreementSummary = summarizeDisagreements(results.map((row) => row.responseContent));
    const consolidatedRecommendation = buildConsolidatedRecommendation(
      input.subject,
      results.map((row) => ({
        providerKey: row.providerKey,
        modelKey: row.modelKey,
        content: row.responseContent,
      })),
      disagreementSummary,
    );

    const [updatedRun] = await this.deps.db
      .update(aiComparisonRuns)
      .set({
        consolidatedRecommendation,
        disagreementSummary,
        updatedAt: new Date(),
      })
      .where(eq(aiComparisonRuns.id, run!.id))
      .returning();

    return this.toSummary(updatedRun!, results);
  }

  async listComparisonRuns(companyId: string, limit = 20): Promise<AiComparisonRunSummary[]> {
    const runs = await this.deps.db.query.aiComparisonRuns.findMany({
      where: eq(aiComparisonRuns.companyId, companyId),
      orderBy: [desc(aiComparisonRuns.createdAt)],
      limit,
    });

    const summaries: AiComparisonRunSummary[] = [];
    for (const run of runs) {
      const results = await this.deps.db.query.aiComparisonResults.findMany({
        where: eq(aiComparisonResults.comparisonRunId, run.id),
        orderBy: [desc(aiComparisonResults.createdAt)],
      });
      summaries.push(this.toSummary(run, results));
    }
    return summaries;
  }

  async updateComparisonStatus(
    scope: StaffScope,
    runId: string,
    status: 'approved' | 'rejected',
  ): Promise<AiComparisonRunSummary> {
    const run = await this.deps.db.query.aiComparisonRuns.findFirst({
      where: and(eq(aiComparisonRuns.id, runId), eq(aiComparisonRuns.companyId, scope.companyId)),
    });

    if (!run) {
      throw new AiComparisonError('NOT_FOUND', 'Comparison run not found');
    }

    const [updated] = await this.deps.db
      .update(aiComparisonRuns)
      .set({ status, updatedAt: new Date() })
      .where(eq(aiComparisonRuns.id, runId))
      .returning();

    const results = await this.deps.db.query.aiComparisonResults.findMany({
      where: eq(aiComparisonResults.comparisonRunId, runId),
    });

    return this.toSummary(updated!, results);
  }

  private toSummary(
    run: typeof aiComparisonRuns.$inferSelect,
    results: Array<typeof aiComparisonResults.$inferSelect>,
  ): AiComparisonRunSummary {
    return {
      id: run.id,
      subject: run.subject,
      taskPrompt: run.taskPrompt,
      routingCategory: run.routingCategory as AiRoutingCategory | null,
      status: run.status as AiComparisonRunSummary['status'],
      consolidatedRecommendation: run.consolidatedRecommendation,
      disagreementSummary: run.disagreementSummary,
      results: results.map((row) => ({
        id: row.id,
        providerKey: row.providerKey,
        modelKey: row.modelKey,
        providerId: row.providerId,
        responseContent: row.responseContent,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        latencyMs: row.latencyMs,
        createdAt: row.createdAt.toISOString(),
      })),
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }
}

function summarizeDisagreements(responses: string[]) {
  if (responses.length < 2) {
    return null;
  }

  const normalized = responses.map((response) => response.trim().toLowerCase());
  const uniqueStarts = new Set(normalized.map((response) => response.slice(0, 120)));
  if (uniqueStarts.size <= 1) {
    return 'Models largely agreed on the recommendation.';
  }

  return `${uniqueStarts.size} distinct response patterns detected across ${responses.length} model outputs. Review disagreements before approval.`;
}

function buildConsolidatedRecommendation(
  subject: string,
  outputs: Array<{ providerKey: string; modelKey: string; content: string }>,
  disagreementSummary: string | null,
) {
  const sections = outputs.map(
    (output) => `### ${output.providerKey}/${output.modelKey}\n${output.content.trim()}`,
  );

  return [
    `# Consolidated recommendation: ${subject}`,
    '',
    disagreementSummary ?? 'Review individual model outputs below.',
    '',
    'This comparison requires human approval before any action is executed.',
    '',
    ...sections,
  ].join('\n');
}
