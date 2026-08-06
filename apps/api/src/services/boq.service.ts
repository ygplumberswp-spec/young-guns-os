import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { boqDocuments, boqLineItems, customers, jobs, quotes } from '@titan/db';
import type {
  BoqDocumentDetail,
  BoqDocumentSummary,
  BoqLineInput,
  ConvertBoqToQuoteRequest,
  CreateBoqDocumentRequest,
  UpdateBoqDocumentRequest,
} from '@titan/shared';
import { boqMarkupPriceCents } from '@titan/shared';
import type { FinanceService } from './finance.service.js';

export class BoqError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BoqError';
  }
}

type BoqActor = { companyId: string; userId?: string | null };

export class BoqService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly financeService: FinanceService,
  ) {}

  async listDocuments(companyId: string, query: { q?: string; status?: string } = {}): Promise<BoqDocumentSummary[]> {
    const rows = await this.db.query.boqDocuments.findMany({
      where: and(
        eq(boqDocuments.companyId, companyId),
        query.status ? eq(boqDocuments.status, query.status as typeof boqDocuments.status.enumValues[number]) : undefined,
        query.q
          ? or(ilike(boqDocuments.boqNumber, `%${query.q}%`), ilike(boqDocuments.title, `%${query.q}%`))
          : undefined,
      ),
      with: { customer: true, job: true, lineItems: true },
      orderBy: [desc(boqDocuments.updatedAt)],
    });

    return rows.map((row) => toBoqSummary(row));
  }

  async getDocument(companyId: string, documentId: string): Promise<BoqDocumentDetail | null> {
    const row = await this.db.query.boqDocuments.findFirst({
      where: and(eq(boqDocuments.id, documentId), eq(boqDocuments.companyId, companyId)),
      with: { customer: true, job: true, lineItems: { orderBy: (items, { asc }) => [asc(items.position)] } },
    });
    if (!row) return null;
    return toBoqDetail(row);
  }

  async createDocument(actor: BoqActor, input: CreateBoqDocumentRequest): Promise<BoqDocumentSummary> {
    const { companyId } = actor;
    if (!input.lineItems.length) throw new BoqError('VALIDATION_ERROR', 'At least one BOQ line is required');

    if (input.customerId) await this.ensureCustomer(companyId, input.customerId);
    if (input.jobId) await this.ensureJob(companyId, input.jobId);

    const [created] = await this.db
      .insert(boqDocuments)
      .values({
        companyId,
        customerId: input.customerId ?? null,
        jobId: input.jobId ?? null,
        boqNumber: await this.nextBoqNumber(companyId),
        title: input.title.trim(),
        sourceFilename: input.sourceFilename?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    if (!created) throw new BoqError('CREATE_FAILED', 'Unable to create BOQ document');

    await this.replaceLines(created.id, companyId, input.lineItems);
    return (await this.getDocument(companyId, created.id))!;
  }

  async updateDocument(
    actor: BoqActor,
    documentId: string,
    input: UpdateBoqDocumentRequest,
  ): Promise<BoqDocumentDetail> {
    const current = await this.db.query.boqDocuments.findFirst({
      where: and(eq(boqDocuments.id, documentId), eq(boqDocuments.companyId, actor.companyId)),
    });
    if (!current) throw new BoqError('NOT_FOUND', 'BOQ document not found');
    if (current.status === 'converted') throw new BoqError('VALIDATION_ERROR', 'Converted BOQs are read-only');

    if (input.customerId) await this.ensureCustomer(actor.companyId, input.customerId);
    if (input.jobId) await this.ensureJob(actor.companyId, input.jobId);

    await this.db
      .update(boqDocuments)
      .set({
        title: input.title?.trim() || current.title,
        status: input.status ?? current.status,
        customerId: input.customerId === undefined ? current.customerId : input.customerId,
        jobId: input.jobId === undefined ? current.jobId : input.jobId,
        notes: input.notes === undefined ? current.notes : input.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(boqDocuments.id, documentId));

    if (input.lineItems) {
      if (!input.lineItems.length) throw new BoqError('VALIDATION_ERROR', 'At least one BOQ line is required');
      await this.replaceLines(documentId, actor.companyId, input.lineItems);
    }

    return (await this.getDocument(actor.companyId, documentId))!;
  }

  async convertToQuote(actor: BoqActor, documentId: string, input: ConvertBoqToQuoteRequest) {
    const document = await this.getDocument(actor.companyId, documentId);
    if (!document) throw new BoqError('NOT_FOUND', 'BOQ document not found');
    if (document.status === 'converted' && document.quoteId) {
      const quote = await this.financeService.getQuoteDetail(actor.companyId, document.quoteId);
      if (quote) return quote;
    }

    const markupBps = input.markupBps ?? 2500;
    const lineItems = document.lineItems.map((line) => {
      const unitCostCents = line.unitCostCents ?? 0;
      const unitPriceCents = unitCostCents > 0 ? boqMarkupPriceCents(unitCostCents, markupBps) : 0;
      const prefix = [line.section, line.itemNumber].filter(Boolean).join(' · ');
      const description = prefix ? `${prefix} — ${line.description}` : line.description;
      return {
        category: 'materials' as const,
        description,
        quantity: Number.parseFloat(line.quantity) || 1,
        unitPriceCents: unitPriceCents > 0 ? unitPriceCents : unitCostCents,
        unitCostCents: unitCostCents > 0 ? unitCostCents : undefined,
        vatRateBps: 1500,
      };
    });

    const quote = await this.financeService.createQuote(
      { companyId: actor.companyId, userId: actor.userId ?? undefined, permissions: ['finance:write'], canWrite: true },
      {
        customerId: input.customerId,
        jobId: input.jobId ?? document.jobId ?? null,
        status: 'draft',
        scopeOfWork: `Converted from BOQ ${document.boqNumber}`,
        lineItems,
        clientActionId: input.clientActionId,
      },
    );

    await this.db
      .update(boqDocuments)
      .set({ status: 'converted', quoteId: quote.id, updatedAt: new Date() })
      .where(eq(boqDocuments.id, documentId));

    await this.db
      .update(quotes)
      .set({ boqDocumentId: documentId, updatedAt: new Date() })
      .where(eq(quotes.id, quote.id));

    return quote;
  }

  private async replaceLines(documentId: string, companyId: string, lines: BoqLineInput[]) {
    await this.db.delete(boqLineItems).where(eq(boqLineItems.boqDocumentId, documentId));
    await this.db.insert(boqLineItems).values(
      lines.map((line, index) => ({
        companyId,
        boqDocumentId: documentId,
        position: index,
        section: line.section?.trim() || null,
        itemNumber: line.itemNumber?.trim() || null,
        description: line.description.trim(),
        unit: line.unit?.trim() || null,
        quantity: String(line.quantity),
        unitCostCents: line.unitCostCents ?? null,
        notes: line.notes?.trim() || null,
      })),
    );
  }

  private async nextBoqNumber(companyId: string): Promise<string> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(boqDocuments)
      .where(eq(boqDocuments.companyId, companyId));
    const next = (row?.count ?? 0) + 1;
    return `BOQ-${String(next).padStart(5, '0')}`;
  }

  private async ensureCustomer(companyId: string, customerId: string) {
    const row = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });
    if (!row) throw new BoqError('NOT_FOUND', 'Customer not found');
  }

  private async ensureJob(companyId: string, jobId: string) {
    const row = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });
    if (!row) throw new BoqError('NOT_FOUND', 'Job not found');
  }
}

function toBoqSummary(row: {
  id: string;
  boqNumber: string;
  title: string;
  status: BoqDocumentSummary['status'];
  customerId: string | null;
  jobId: string | null;
  quoteId: string | null;
  sourceFilename: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer?: { name: string } | null;
  job?: { title: string } | null;
  lineItems?: unknown[];
}): BoqDocumentSummary {
  return {
    id: row.id,
    boqNumber: row.boqNumber,
    title: row.title,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    quoteId: row.quoteId,
    sourceFilename: row.sourceFilename,
    lineCount: row.lineItems?.length ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toBoqDetail(row: {
  id: string;
  boqNumber: string;
  title: string;
  status: BoqDocumentSummary['status'];
  customerId: string | null;
  jobId: string | null;
  quoteId: string | null;
  sourceFilename: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer?: { name: string } | null;
  job?: { title: string } | null;
  lineItems: Array<{
    id: string;
    position: number;
    section: string | null;
    itemNumber: string | null;
    description: string;
    unit: string | null;
    quantity: string;
    unitCostCents: number | null;
    notes: string | null;
  }>;
}): BoqDocumentDetail {
  return {
    ...toBoqSummary(row),
    notes: row.notes?.startsWith('clientAction:') ? null : row.notes,
    lineItems: row.lineItems.map((line) => ({
      id: line.id,
      position: line.position,
      section: line.section,
      itemNumber: line.itemNumber,
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
      unitCostCents: line.unitCostCents,
      notes: line.notes,
    })),
  };
}
