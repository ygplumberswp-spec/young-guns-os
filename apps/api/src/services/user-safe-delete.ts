import { and, eq, notInArray, or, sql } from 'drizzle-orm';
import {
  summarizeHardDeleteEligibility,
  USER_HARD_DELETE_REFUSED_MESSAGE,
  type UserHardDeleteEligibility,
  type UserSafeDeleteDependencyCheck,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  certifications,
  communications,
  completionReports,
  documents,
  employeeSkills,
  jobCompletionSnapshots,
  jobCrewMembers,
  jobDocumentPacks,
  jobMaterialLines,
  jobs,
  jobVariations,
  jobWorkflowEvents,
  mobileJobDocumentation,
  mobileJobInventoryUsage,
  mobileTimeEntries,
  payments,
  quotes,
  schedulingOverrideAudits,
  securityAuditLogs,
  trainingRecords,
  wiTimesheets,
  xeroWriteApprovals,
} from '@titan/db';

/** Team lifecycle audit actions do not block hard-delete of otherwise clean accounts. */
const TEAM_LIFECYCLE_AUDIT_ACTIONS = [
  'role_manual_reassignment',
  'user_suspended',
  'user_reactivated',
  'user_access_removed',
  'user_hard_delete_refused',
  'user_hard_deleted',
] as const;

async function countWhere(query: Promise<{ count: number }[]>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.count ?? 0);
}

/**
 * Demonstrably-safe hard-delete gate.
 * Any non-zero business-history dependency refuses permanent deletion.
 */
export async function evaluateUserHardDeleteEligibility(
  db: DatabaseClient,
  companyId: string,
  memberId: string,
): Promise<UserHardDeleteEligibility> {
  const blockers: UserSafeDeleteDependencyCheck[] = [];

  const assignedJobs = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), eq(jobs.assignedUserId, memberId))),
  );
  const crewJobs = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobCrewMembers)
      .where(and(eq(jobCrewMembers.companyId, companyId), eq(jobCrewMembers.userId, memberId))),
  );
  const completedJobs = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobCompletionSnapshots)
      .where(
        and(
          eq(jobCompletionSnapshots.companyId, companyId),
          eq(jobCompletionSnapshots.completedByUserId, memberId),
        ),
      ),
  );
  const workflowEvents = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobWorkflowEvents)
      .where(
        and(eq(jobWorkflowEvents.companyId, companyId), eq(jobWorkflowEvents.userId, memberId)),
      ),
  );
  blockers.push({
    code: 'ASSIGNED_OR_COMPLETED_JOBS',
    label: 'Assigned or completed jobs / crew / workflow events',
    count: assignedJobs + crewJobs + completedJobs + workflowEvents,
  });

  const mobileTime = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(mobileTimeEntries)
      .where(
        and(eq(mobileTimeEntries.companyId, companyId), eq(mobileTimeEntries.userId, memberId)),
      ),
  );
  const wiTime = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(wiTimesheets)
      .where(and(eq(wiTimesheets.companyId, companyId), eq(wiTimesheets.userId, memberId))),
  );
  blockers.push({
    code: 'TIME_ENTRIES',
    label: 'Time entries / timesheets',
    count: mobileTime + wiTime,
  });

  const jobDocs = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(mobileJobDocumentation)
      .where(
        and(
          eq(mobileJobDocumentation.companyId, companyId),
          eq(mobileJobDocumentation.userId, memberId),
        ),
      ),
  );
  const inventoryUsage = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(mobileJobInventoryUsage)
      .where(
        and(
          eq(mobileJobInventoryUsage.companyId, companyId),
          eq(mobileJobInventoryUsage.userId, memberId),
        ),
      ),
  );
  const materialLines = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobMaterialLines)
      .where(
        and(
          eq(jobMaterialLines.companyId, companyId),
          or(
            eq(jobMaterialLines.recordedByUserId, memberId),
            eq(jobMaterialLines.approvedByUserId, memberId),
          ),
        ),
      ),
  );
  const variations = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobVariations)
      .where(
        and(
          eq(jobVariations.companyId, companyId),
          or(
            eq(jobVariations.createdByUserId, memberId),
            eq(jobVariations.authorizedByUserId, memberId),
          ),
        ),
      ),
  );
  blockers.push({
    code: 'JOB_CARDS_OR_DOCUMENTATION',
    label: 'Job Cards / mobile documentation / materials / variations',
    count: jobDocs + inventoryUsage + materialLines + variations,
  });

  const docs = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(and(eq(documents.companyId, companyId), eq(documents.uploadedByUserId, memberId))),
  );
  const packs = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobDocumentPacks)
      .where(
        and(
          eq(jobDocumentPacks.companyId, companyId),
          or(
            eq(jobDocumentPacks.createdByUserId, memberId),
            eq(jobDocumentPacks.approvedByUserId, memberId),
            eq(jobDocumentPacks.sentByUserId, memberId),
          ),
        ),
      ),
  );
  const completion = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(completionReports)
      .where(
        and(
          eq(completionReports.companyId, companyId),
          eq(completionReports.createdByUserId, memberId),
        ),
      ),
  );
  blockers.push({
    code: 'DOCUMENTS',
    label: 'Documents / Job document packs / completion reports',
    count: docs + packs + completion,
  });

  const comms = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(communications)
      .where(and(eq(communications.companyId, companyId), eq(communications.authorUserId, memberId))),
  );
  blockers.push({
    code: 'COMMUNICATIONS',
    label: 'Communications ownership',
    count: comms,
  });

  const paymentRows = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(payments)
      .where(and(eq(payments.companyId, companyId), eq(payments.recordedByUserId, memberId))),
  );
  const quoteRows = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(quotes)
      .where(
        and(
          eq(quotes.companyId, companyId),
          or(eq(quotes.estimatorUserId, memberId), eq(quotes.belowFloorAuthorizedBy, memberId)),
        ),
      ),
  );
  blockers.push({
    code: 'FINANCIAL_RECORDS',
    label: 'Financial records (payments / quotes attribution)',
    count: paymentRows + quoteRows,
  });

  const xeroApprovals = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(xeroWriteApprovals)
      .where(
        and(
          eq(xeroWriteApprovals.companyId, companyId),
          eq(xeroWriteApprovals.approvedByUserId, memberId),
        ),
      ),
  );
  blockers.push({
    code: 'APPROVALS',
    label: 'Approvals (Xero write / material approvals counted above)',
    count: xeroApprovals,
  });

  const auditRows = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.companyId, companyId),
          eq(securityAuditLogs.userId, memberId),
          notInArray(securityAuditLogs.action, [...TEAM_LIFECYCLE_AUDIT_ACTIONS]),
        ),
      ),
  );
  const scheduleOverrides = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schedulingOverrideAudits)
      .where(
        and(
          eq(schedulingOverrideAudits.companyId, companyId),
          eq(schedulingOverrideAudits.userId, memberId),
        ),
      ),
  );
  blockers.push({
    code: 'AUDIT_SENSITIVE_HISTORY',
    label: 'Audit-sensitive business history',
    count: auditRows + scheduleOverrides,
  });

  const skills = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(employeeSkills)
      .where(and(eq(employeeSkills.companyId, companyId), eq(employeeSkills.userId, memberId))),
  );
  const certs = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(certifications)
      .where(and(eq(certifications.companyId, companyId), eq(certifications.userId, memberId))),
  );
  const training = await countWhere(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainingRecords)
      .where(and(eq(trainingRecords.companyId, companyId), eq(trainingRecords.userId, memberId))),
  );
  blockers.push({
    code: 'WORKFORCE_PROFILE_HISTORY',
    label: 'Workforce profile history (skills / certifications / training)',
    count: skills + certs + training,
  });

  const summary = summarizeHardDeleteEligibility(blockers);

  return {
    memberId,
    companyId,
    canHardDelete: summary.canHardDelete,
    blockers,
    refusalMessage: summary.refusalMessage,
    confirmationHint: 'email_or_display_name',
  };
}

export { USER_HARD_DELETE_REFUSED_MESSAGE };
