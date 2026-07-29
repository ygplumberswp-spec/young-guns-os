import type { DeveloperApiExplorerEndpoint } from '@titan/shared';

export const TITAN_API_EXPLORER_ENDPOINTS: DeveloperApiExplorerEndpoint[] = [
  { method: 'GET', path: '/api/v1/crm/customers', summary: 'List customers', tag: 'CRM', requiredPermissions: ['customers:read'] },
  { method: 'POST', path: '/api/v1/crm/customers', summary: 'Create customer', tag: 'CRM', requiredPermissions: ['customers:write'] },
  { method: 'GET', path: '/api/v1/jobs', summary: 'List jobs', tag: 'Jobs', requiredPermissions: ['jobs:read'] },
  { method: 'POST', path: '/api/v1/jobs', summary: 'Create job', tag: 'Jobs', requiredPermissions: ['jobs:write'] },
  { method: 'GET', path: '/api/v1/scheduling/calendar', summary: 'Scheduling calendar', tag: 'Dispatch', requiredPermissions: ['dispatch:read'] },
  { method: 'GET', path: '/api/v1/finance/invoices', summary: 'List invoices', tag: 'Finance', requiredPermissions: ['finance:read'] },
  { method: 'GET', path: '/api/v1/fleet/vehicles', summary: 'List vehicles', tag: 'Fleet', requiredPermissions: ['fleet:read'] },
  { method: 'GET', path: '/api/v1/inventory/items', summary: 'List inventory items', tag: 'Inventory', requiredPermissions: ['inventory:read'] },
  { method: 'GET', path: '/api/v1/automation/workflows', summary: 'List workflows', tag: 'Automation', requiredPermissions: ['automation:read'] },
  { method: 'GET', path: '/api/v1/integration-platform/dashboard', summary: 'Integration platform dashboard', tag: 'Integrations', requiredPermissions: ['integrations:read'] },
  { method: 'GET', path: '/api/v1/mission-control/dashboard', summary: 'Mission control dashboard', tag: 'Mission Control', requiredPermissions: ['executive:read'] },
  { method: 'GET', path: '/api/v1/evolution/dashboard', summary: 'Evolution dashboard', tag: 'Evolution', requiredPermissions: ['intelligence:read'] },
  { method: 'GET', path: '/api/v1/developer-platform/dashboard', summary: 'Developer platform dashboard', tag: 'Developer', requiredPermissions: ['integrations:manage'] },
];

export function buildOpenApiSpec(baseUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const endpoint of TITAN_API_EXPLORER_ENDPOINTS) {
    paths[endpoint.path] ??= {};
    paths[endpoint.path]![endpoint.method.toLowerCase()] = {
      summary: endpoint.summary,
      tags: [endpoint.tag],
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      responses: {
        '200': { description: 'Success' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden' },
        '429': { description: 'Rate limit exceeded' },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'TITAN Business OS API',
      version: '1.0.0',
      description:
        'Enterprise REST API for TITAN Business OS. Authenticate with Bearer JWT, developer API keys, or personal access tokens.',
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-Titan-Api-Key' },
      },
    },
    paths,
  };
}

export function buildDefaultChangelog(): Array<{
  version: string;
  title: string;
  description: string;
  changeType: string;
  releasedAt: Date;
}> {
  return [
    {
      version: '1.0.0',
      title: 'Developer Platform launch',
      description: 'Initial developer platform with API explorer, SDK generation, webhooks, and extension framework.',
      changeType: 'feature',
      releasedAt: new Date('2026-01-01'),
    },
    {
      version: '0.9.0',
      title: 'Integration Hub API management',
      description: 'Developer API keys, webhook deliveries, and integration health monitoring.',
      changeType: 'feature',
      releasedAt: new Date('2025-12-01'),
    },
  ];
}
