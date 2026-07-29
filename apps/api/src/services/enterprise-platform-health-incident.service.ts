import type { CreatePhIncidentRequest, ItoIncidentSummary, UpdatePhIncidentRequest } from '@titan/shared';
import type { EnterpriseItOperationsService } from './enterprise-it-operations.service.js';

type StaffScope = { companyId: string; userId: string };

export class EnterprisePlatformHealthIncidentService {
  constructor(private readonly itOperationsService: EnterpriseItOperationsService) {}

  listIncidents(companyId: string): Promise<ItoIncidentSummary[]> {
    return this.itOperationsService.listIncidents(companyId);
  }

  getIncident(companyId: string, incidentId: string): Promise<ItoIncidentSummary | null> {
    return this.itOperationsService.getIncident(companyId, incidentId);
  }

  createIncident(scope: StaffScope, input: CreatePhIncidentRequest): Promise<ItoIncidentSummary> {
    return this.itOperationsService.createIncident(scope, {
      title: input.title,
      description: input.description,
      severity: input.severity,
      sourceModule: input.sourceModule ?? 'platform_health',
      assignedUserId: input.assignedUserId,
    });
  }

  updateIncident(scope: StaffScope, incidentId: string, input: UpdatePhIncidentRequest): Promise<ItoIncidentSummary> {
    return this.itOperationsService.updateIncident(scope, incidentId, {
      title: input.title,
      description: input.description,
      severity: input.severity,
      status: input.status,
      assignedUserId: input.assignedUserId,
      ...(input.status === 'resolved' ? { resolvedAt: new Date().toISOString() } : {}),
      ...(input.status === 'mitigated' ? { mitigatedAt: new Date().toISOString() } : {}),
    });
  }
}
