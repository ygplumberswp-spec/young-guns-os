import { AURA_SYSTEM_PROMPT } from './responder.js';
import type { AuraGenerateContext } from './types.js';

function formatOptional(value: string | null | undefined, label: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? `- ${label}: ${trimmed}` : null;
}

function formatPreferences(context: AuraGenerateContext): string[] {
  const lines: string[] = [];
  const { preferences } = context;

  if (preferences.timezone?.trim()) {
    lines.push(`- Timezone: ${preferences.timezone.trim()}`);
  }

  if (preferences.currency?.trim()) {
    lines.push(`- Currency: ${preferences.currency.trim()}`);
  }

  if (preferences.locale?.trim()) {
    lines.push(`- Locale: ${preferences.locale.trim()}`);
  }

  if (preferences.aiTone) {
    lines.push(`- Preferred AI tone: ${preferences.aiTone}`);
  }

  if (preferences.notes?.trim()) {
    lines.push(`- Company notes: ${preferences.notes.trim()}`);
  }

  return lines;
}

function formatCrmContext(context: AuraGenerateContext): string | null {
  const crm = context.crm;

  if (!crm) {
    return null;
  }

  const lines = [`- Total customers: ${crm.customerCount}`];

  if (crm.customers.length > 0) {
    lines.push('- Customer directory (most recently updated first):');

    for (const customer of crm.customers) {
      const details = [
        customer.email ? `email ${customer.email}` : null,
        customer.phone ? `phone ${customer.phone}` : null,
        `status ${customer.status}`,
      ]
        .filter(Boolean)
        .join(', ');

      lines.push(`  - ${customer.name} (id ${customer.id}${details ? `; ${details}` : ''})`);
    }
  } else {
    lines.push('- No customers have been added yet.');
  }

  if (crm.focusedCustomer) {
    const customer = crm.focusedCustomer;
    lines.push('');
    lines.push('Focused customer (user is viewing this record):');
    lines.push(`- Name: ${customer.name}`);
    lines.push(`- ID: ${customer.id}`);
    lines.push(`- Status: ${customer.status}`);

    if (customer.email) {
      lines.push(`- Email: ${customer.email}`);
    }

    if (customer.phone) {
      lines.push(`- Phone: ${customer.phone}`);
    }

    if (customer.notes) {
      lines.push(`- Notes: ${customer.notes}`);
    }

    if (customer.recentActivities.length > 0) {
      lines.push('- Recent activity notes:');

      for (const activity of customer.recentActivities) {
        lines.push(`  - ${activity.createdAt} (${activity.authorName}): ${activity.content}`);
      }
    } else {
      lines.push('- Recent activity notes: none yet');
    }
  }

  return lines.join('\n');
}

function formatJobsContext(context: AuraGenerateContext): string | null {
  const jobsContext = context.jobs;

  if (!jobsContext) {
    return null;
  }

  const lines = [
    `- Total jobs: ${jobsContext.totalCount}`,
    `- Active jobs (new, scheduled, in progress): ${jobsContext.activeCount}`,
  ];

  if (jobsContext.jobs.length > 0) {
    lines.push('- Job list (most recently updated first):');

    for (const job of jobsContext.jobs) {
      const details = [
        `status ${job.status}`,
        `customer ${job.customerName} (id ${job.customerId})`,
        job.scheduledAt ? `scheduled ${job.scheduledAt}` : null,
        job.assignedUserName ? `assigned to ${job.assignedUserName}` : null,
      ]
        .filter(Boolean)
        .join(', ');

      lines.push(`  - ${job.title} (id ${job.id}; ${details})`);
    }
  } else {
    lines.push('- No jobs have been created yet.');
  }

  if (jobsContext.focusedJob) {
    const job = jobsContext.focusedJob;
    lines.push('');
    lines.push('Focused job (user is viewing this record):');
    lines.push(`- Title: ${job.title}`);
    lines.push(`- ID: ${job.id}`);
    lines.push(`- Status: ${job.status}`);
    lines.push(`- Customer: ${job.customerName} (id ${job.customerId})`);

    if (job.scheduledAt) {
      lines.push(`- Scheduled: ${job.scheduledAt}`);
    }

    if (job.scheduledEndAt) {
      lines.push(`- Scheduled end: ${job.scheduledEndAt}`);
    }

    if (job.assignedUserName) {
      lines.push(`- Assigned to: ${job.assignedUserName}`);
    }

    if (job.description) {
      lines.push(`- Description: ${job.description}`);
    }

    if (job.notes) {
      lines.push(`- Notes: ${job.notes}`);
    }
  }

  return lines.join('\n');
}

function formatSchedulingContext(context: AuraGenerateContext): string | null {
  const scheduling = context.scheduling;

  if (!scheduling) {
    return null;
  }

  const lines = [`- Scheduled jobs: ${scheduling.scheduledCount}`];

  if (scheduling.upcomingEvents.length > 0) {
    lines.push('- Upcoming scheduled jobs:');

    for (const event of scheduling.upcomingEvents) {
      const details = [
        `customer ${event.customerName}`,
        `status ${event.status}`,
        event.assignedUserName ? `assigned to ${event.assignedUserName}` : 'unassigned',
        event.scheduledEndAt ? `ends ${event.scheduledEndAt}` : null,
      ]
        .filter(Boolean)
        .join(', ');

      lines.push(`  - ${event.title} at ${event.scheduledAt} (id ${event.id}; ${details})`);
    }
  } else {
    lines.push('- No jobs are scheduled yet.');
  }

  if (scheduling.assigneeWorkload.length > 0) {
    lines.push('- Assignee workload (scheduled jobs):');

    for (const assignee of scheduling.assigneeWorkload) {
      lines.push(`  - ${assignee.userName}: ${assignee.scheduledJobCount} scheduled job(s)`);
    }
  }

  return lines.join('\n');
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
}

function formatFinanceContext(context: AuraGenerateContext): string | null {
  const finance = context.finance;

  if (!finance) {
    return null;
  }

  const lines = [
    `- Open quotes: ${finance.openQuoteCount}`,
    `- Revenue month-to-date: ${formatMoney(finance.revenueMtdCents, finance.currency)}`,
    `- Total quotes: ${finance.quoteCount}`,
    `- Total invoices: ${finance.invoiceCount}`,
    `- Total payments: ${finance.paymentCount}`,
  ];

  if (finance.recentQuotes.length > 0) {
    lines.push('- Recent quotes:');

    for (const quote of finance.recentQuotes) {
      lines.push(
        `  - ${quote.quoteNumber} ${quote.title} (${quote.status}) · ${quote.customerName} · ${formatMoney(quote.amountCents, quote.currency)}`,
      );
    }
  } else {
    lines.push('- No quotes have been created yet.');
  }

  if (finance.recentInvoices.length > 0) {
    lines.push('- Recent invoices:');

    for (const invoice of finance.recentInvoices) {
      lines.push(
        `  - ${invoice.invoiceNumber} ${invoice.title} (${invoice.status}) · ${invoice.customerName} · ${formatMoney(invoice.amountCents, invoice.currency)} paid ${formatMoney(invoice.amountPaidCents, invoice.currency)}`,
      );
    }
  } else {
    lines.push('- No invoices have been created yet.');
  }

  if (finance.recentPayments.length > 0) {
    lines.push('- Recent payments:');

    for (const payment of finance.recentPayments) {
      lines.push(
        `  - ${payment.invoiceNumber} · ${payment.customerName} · ${formatMoney(payment.amountCents, payment.currency)} on ${payment.paidAt}`,
      );
    }
  } else {
    lines.push('- No payments have been recorded yet.');
  }

  return lines.join('\n');
}

function formatFinanceIntelligenceContext(context: AuraGenerateContext): string | null {
  const financeIntelligence = context.financeIntelligence;

  if (!financeIntelligence) {
    return null;
  }

  const lines = [
    `- Summary: ${financeIntelligence.summary}`,
    `- Cash flow: ${financeIntelligence.cashFlow.summary}`,
    `- Profitability: ${financeIntelligence.profitability.summary}`,
    `- Receivables: ${financeIntelligence.receivables.summary}`,
    `- Expenses: ${financeIntelligence.expenses.summary}`,
    `- Forecast: ${financeIntelligence.forecast.summary}`,
    `- Pending recommendations: ${financeIntelligence.pendingRecommendationCount}`,
  ];

  if (financeIntelligence.cashFlow.cashShortageWarning) {
    lines.push('- Cash shortage warning: active');
  }

  if (financeIntelligence.topRecommendations.length > 0) {
    lines.push('- Top recommendations:');
    for (const recommendation of financeIntelligence.topRecommendations.slice(0, 5)) {
      lines.push(
        `  - [${recommendation.priority}] ${recommendation.title} (${recommendation.recommendationType})`,
      );
    }
  }

  if (financeIntelligence.riskSignals.length > 0) {
    lines.push('- Risk signals:');
    for (const risk of financeIntelligence.riskSignals.slice(0, 5)) {
      lines.push(`  - [${risk.priority}] ${risk.title} (${risk.riskType})`);
    }
  }

  return lines.join('\n');
}

function formatKnowledgeContext(context: AuraGenerateContext): string | null {
  const knowledge = context.knowledge;

  if (!knowledge) {
    return null;
  }

  const lines = [
    `- Summary: ${knowledge.summary}`,
    `- Articles: ${knowledge.stats.publishedArticleCount}/${knowledge.stats.articleCount} published`,
    `- SOPs: ${knowledge.stats.publishedSopCount}/${knowledge.stats.sopCount} published`,
    `- Training courses: ${knowledge.stats.activeTrainingCourseCount}/${knowledge.stats.trainingCourseCount} active`,
    `- Policies: ${knowledge.stats.publishedPolicyCount}/${knowledge.stats.policyCount} published`,
    `- Pending recommendations: ${knowledge.stats.pendingRecommendationCount}`,
    `- Expired certifications: ${knowledge.stats.expiredCertificationCount}`,
  ];

  if (knowledge.recentArticles.length > 0) {
    lines.push('- Recent articles:');
    for (const article of knowledge.recentArticles.slice(0, 5)) {
      lines.push(`  - ${article.title} (${article.articleType}, ${article.status})`);
    }
  }

  if (knowledge.topRecommendations.length > 0) {
    lines.push('- Knowledge recommendations:');
    for (const recommendation of knowledge.topRecommendations.slice(0, 5)) {
      lines.push(
        `  - [${recommendation.priority}] ${recommendation.title} (${recommendation.recommendationType})`,
      );
    }
  }

  return lines.join('\n');
}

function formatBusinessIntelligenceContext(context: AuraGenerateContext): string | null {
  const businessIntelligence = context.businessIntelligence;

  if (!businessIntelligence) {
    return null;
  }

  const lines = [
    `- Summary: ${businessIntelligence.summary}`,
    `- Active KPIs: ${businessIntelligence.stats.activeKpiCount}`,
    `- Dashboards: ${businessIntelligence.stats.dashboardCount}`,
    `- Pending insights: ${businessIntelligence.stats.pendingInsightCount}`,
    `- Scheduled reports: ${businessIntelligence.stats.scheduledReportCount}`,
    `- Forecasts: ${businessIntelligence.stats.latestForecastCount}`,
    `- Data lake modules: ${businessIntelligence.dataLakeModules.length}`,
  ];

  if (businessIntelligence.topKpis.length > 0) {
    lines.push('- Top KPIs:');
    for (const kpi of businessIntelligence.topKpis.slice(0, 8)) {
      lines.push(`  - ${kpi.name} (${kpi.kpiKey}): ${kpi.value ?? 'n/a'} ${kpi.unit}`);
    }
  }

  if (businessIntelligence.topInsights.length > 0) {
    lines.push('- Business insights:');
    for (const insight of businessIntelligence.topInsights.slice(0, 5)) {
      lines.push(`  - [${insight.priority}] ${insight.title} (${insight.insightType})`);
    }
  }

  if (businessIntelligence.recentForecasts.length > 0) {
    lines.push('- Recent forecasts:');
    for (const forecast of businessIntelligence.recentForecasts.slice(0, 5)) {
      lines.push(`  - ${forecast.forecastType}: ${forecast.summary}`);
    }
  }

  return lines.join('\n');
}

function formatInventoryContext(context: AuraGenerateContext): string | null {
  const inventory = context.inventory;

  if (!inventory) {
    return null;
  }

  const lines = [
    `- Products: ${inventory.itemCount}`,
    `- Locations: ${inventory.locationCount}`,
    `- Low stock items: ${inventory.lowStockCount}`,
    `- Total units on hand: ${inventory.totalUnitsOnHand}`,
  ];

  if (inventory.locations.length > 0) {
    lines.push('- Locations:');

    for (const location of inventory.locations) {
      lines.push(
        `  - ${location.name}${location.code ? ` (${location.code})` : ''}${location.isDefault ? ' · default' : ''}`,
      );
    }
  } else {
    lines.push('- No inventory locations have been created yet.');
  }

  if (inventory.items.length > 0) {
    lines.push('- Products:');

    for (const item of inventory.items) {
      lines.push(
        `  - ${item.sku} ${item.name} (${item.status}) · ${item.totalQuantityOnHand} ${item.unit} on hand${item.isLowStock ? ' · low stock' : ''}`,
      );
    }
  } else {
    lines.push('- No products have been created yet.');
  }

  if (inventory.stockLevels.length > 0) {
    lines.push('- Stock by location:');

    for (const level of inventory.stockLevels) {
      lines.push(
        `  - ${level.itemSku} ${level.itemName} @ ${level.locationName}: ${level.quantityOnHand}${level.isLowStock ? ' · low stock' : ''}`,
      );
    }
  } else {
    lines.push('- No stock levels have been recorded yet.');
  }

  return lines.join('\n');
}

function formatFleetContext(context: AuraGenerateContext): string | null {
  const fleet = context.fleet;

  if (!fleet) {
    return null;
  }

  const lines = [
    `- Total vehicles: ${fleet.totalCount}`,
    `- Available: ${fleet.availableCount}`,
    `- In use: ${fleet.inUseCount}`,
    `- Maintenance: ${fleet.maintenanceCount}`,
    `- Assigned to drivers/technicians: ${fleet.assignedCount}`,
  ];

  if (fleet.focusedVehicle) {
    const vehicle = fleet.focusedVehicle;
    lines.push('- Focused vehicle:');
    lines.push(
      `  - ${vehicle.name} (${vehicle.licensePlate}) · ${vehicle.status}` +
        (vehicle.make || vehicle.model
          ? ` · ${[vehicle.make, vehicle.model].filter(Boolean).join(' ')}`
          : '') +
        (vehicle.year ? ` ${vehicle.year}` : '') +
        (vehicle.assignedUserName ? ` · assigned to ${vehicle.assignedUserName}` : ''),
    );

    if (vehicle.vin) {
      lines.push(`  - VIN: ${vehicle.vin}`);
    }

    if (vehicle.notes) {
      lines.push(`  - Notes: ${vehicle.notes}`);
    }
  }

  if (fleet.vehicles.length > 0) {
    lines.push('- Vehicles:');

    for (const vehicle of fleet.vehicles) {
      lines.push(
        `  - ${vehicle.name} (${vehicle.licensePlate}) · ${vehicle.status}` +
          (vehicle.make || vehicle.model
            ? ` · ${[vehicle.make, vehicle.model].filter(Boolean).join(' ')}`
            : '') +
          (vehicle.assignedUserName ? ` · ${vehicle.assignedUserName}` : ''),
      );
    }
  } else {
    lines.push('- No vehicles have been added yet.');
  }

  if (fleet.tracking) {
    lines.push('- Cartrack GPS tracking:');
    lines.push(`  - Connection status: ${fleet.tracking.cartrackStatus}`);

    if (!fleet.tracking.cartrackConnected) {
      lines.push('  - Cartrack is not connected. No live GPS positions are available.');
    } else {
      lines.push(`  - Mapped vehicles: ${fleet.tracking.mappedVehicleCount}`);
      lines.push(`  - Unmapped external vehicles: ${fleet.tracking.unmappedVehicleCount}`);
      lines.push(`  - Stored GPS positions: ${fleet.tracking.positionCount}`);

      if (fleet.tracking.lastSyncAt) {
        lines.push(`  - Last sync: ${fleet.tracking.lastSyncAt}`);
      }

      if (fleet.tracking.latestPositions.length > 0) {
        lines.push('  - Latest GPS positions:');

        for (const position of fleet.tracking.latestPositions) {
          lines.push(
            `    - ${position.vehicleName ?? position.licensePlate ?? 'Unknown'} · ${position.latitude}, ${position.longitude}` +
              (position.speedKmh !== null ? ` · ${position.speedKmh} km/h` : '') +
              ` · ${position.recordedAt}`,
          );
        }
      } else {
        lines.push('  - No GPS positions have been synced yet.');
      }
    }
  }

  return lines.join('\n');
}

function formatCommunicationsContext(context: AuraGenerateContext): string | null {
  const communications = context.communications;

  if (!communications) {
    return null;
  }

  const lines = [
    `- Communication records: ${communications.messageCount}`,
    `- Message templates: ${communications.templateCount}`,
  ];

  if (communications.focusedCustomerMessages && communications.focusedCustomerMessages.length > 0) {
    lines.push('- Focused customer communications:');

    for (const message of communications.focusedCustomerMessages) {
      lines.push(
        `  - ${message.direction} ${message.channel}${message.subject ? ` · ${message.subject}` : ''} · ${message.authorName} · ${message.occurredAt}`,
      );
      lines.push(`    ${message.bodyPreview}`);
    }
  }

  if (communications.recentMessages.length > 0) {
    lines.push('- Recent communications:');

    for (const message of communications.recentMessages) {
      lines.push(
        `  - ${message.customerName} · ${message.direction} ${message.channel}${message.subject ? ` · ${message.subject}` : ''} · ${message.authorName} · ${message.occurredAt}`,
      );
      lines.push(`    ${message.bodyPreview}`);
    }
  } else {
    lines.push('- No customer communications have been logged yet.');
  }

  if (communications.templates.length > 0) {
    lines.push('- Message templates:');

    for (const template of communications.templates) {
      lines.push(`  - ${template.name} (${template.channel})`);
    }
  } else {
    lines.push('- No message templates have been created yet.');
  }

  return lines.join('\n');
}

function formatDocumentsContext(context: AuraGenerateContext): string | null {
  const documents = context.documents;

  if (!documents) {
    return null;
  }

  const lines = [
    `- Document records: ${documents.documentCount}`,
    `- Document categories: ${documents.categoryCount}`,
  ];

  if (documents.focusedCustomerDocuments && documents.focusedCustomerDocuments.length > 0) {
    lines.push('- Focused customer documents:');

    for (const document of documents.focusedCustomerDocuments) {
      lines.push(
        `  - ${document.title} (${document.fileName})${document.categoryName ? ` [${document.categoryName}]` : ''} — uploaded by ${document.uploadedByName}`,
      );
    }
  }

  if (documents.focusedJobDocuments && documents.focusedJobDocuments.length > 0) {
    lines.push('- Focused job documents:');

    for (const document of documents.focusedJobDocuments) {
      lines.push(
        `  - ${document.title} (${document.fileName})${document.categoryName ? ` [${document.categoryName}]` : ''} — uploaded by ${document.uploadedByName}`,
      );
    }
  }

  if (documents.recentDocuments.length > 0) {
    lines.push('- Recent documents:');

    for (const document of documents.recentDocuments) {
      const links = [
        document.customerName ? `customer: ${document.customerName}` : null,
        document.jobTitle ? `job: ${document.jobTitle}` : null,
      ]
        .filter(Boolean)
        .join(', ');

      lines.push(
        `  - ${document.title} (${document.fileName})${document.categoryName ? ` [${document.categoryName}]` : ''}${links ? ` — ${links}` : ''}`,
      );
    }
  } else {
    lines.push('- No documents have been registered yet.');
  }

  if (documents.categories.length > 0) {
    lines.push('- Document categories:');

    for (const category of documents.categories) {
      lines.push(`  - ${category.name} (${category.documentCount} documents)`);
    }
  } else {
    lines.push('- No document categories have been created yet.');
  }

  return lines.join('\n');
}

function formatAutomationContext(context: AuraGenerateContext): string | null {
  const automation = context.automation;

  if (!automation) {
    return null;
  }

  const lines = [
    `- Workflows: ${automation.workflowCount}`,
    `- Active workflows: ${automation.activeWorkflowCount}`,
    `- Execution history records: ${automation.executionCount}`,
    `- Workflow runs: ${automation.runCount}`,
    `- Pending step approvals: ${automation.pendingApprovalCount}`,
    `- Automation engine: ${automation.engineActive ? 'active' : 'inactive'}`,
  ];

  if (automation.availableTriggers.length > 0) {
    lines.push(`- Available triggers: ${automation.availableTriggers.join(', ')}`);
  }

  if (automation.availableActions.length > 0) {
    lines.push(`- Available actions: ${automation.availableActions.join(', ')}`);
  }

  lines.push(
    '- Workflow actions that send messages or change financial/job/customer data always create drafts requiring user approval before execution.',
  );
  lines.push(
    '- AURA can propose workflow drafts (trigger + conditions + actions). Users must review and activate workflows in /automation.',
  );

  if (automation.focusedWorkflow) {
    lines.push(`- Focused workflow: ${automation.focusedWorkflow.name} (${automation.focusedWorkflow.status})`);

    if (automation.focusedWorkflow.description) {
      lines.push(`  Description: ${automation.focusedWorkflow.description}`);
    }

    if (automation.focusedWorkflow.triggers.length > 0) {
      lines.push(`  Triggers: ${automation.focusedWorkflow.triggers.join(', ')}`);
    }

    if (automation.focusedWorkflow.actions.length > 0) {
      lines.push(`  Actions: ${automation.focusedWorkflow.actions.join(', ')}`);
    }

    if (automation.focusedWorkflow.recentExecutions.length > 0) {
      lines.push('  Recent executions for this workflow:');

      for (const execution of automation.focusedWorkflow.recentExecutions) {
        lines.push(
          `    - ${execution.triggerType} (${execution.status}) at ${execution.startedAt}${execution.errorMessage ? ` — ${execution.errorMessage}` : ''}`,
        );
      }
    }
  }

  if (automation.workflows.length > 0) {
    lines.push('- Configured workflows:');

    for (const workflow of automation.workflows) {
      lines.push(
        `  - ${workflow.name} (${workflow.status}) — ${workflow.triggerCount} trigger(s), ${workflow.actionCount} action(s)`,
      );

      if (workflow.triggers.length > 0) {
        lines.push(`    Triggers: ${workflow.triggers.join(', ')}`);
      }

      if (workflow.actions.length > 0) {
        lines.push(`    Actions: ${workflow.actions.join(', ')}`);
      }
    }
  } else {
    lines.push('- No workflows have been configured yet.');
  }

  if (automation.recentExecutions.length > 0) {
    lines.push('- Recent workflow executions:');

    for (const execution of automation.recentExecutions) {
      lines.push(
        `  - ${execution.workflowName ?? 'Unknown workflow'} via ${execution.triggerType} (${execution.status}) at ${execution.startedAt}${execution.errorMessage ? ` — ${execution.errorMessage}` : ''}`,
      );
    }
  } else {
    lines.push('- No workflow executions have been recorded yet.');
  }

  return lines.join('\n');
}

function formatAgentsContext(context: AuraGenerateContext): string | null {
  const agents = context.agents;

  if (!agents) {
    return null;
  }

  const lines = [
    `- Available agent types: ${agents.availableAgentCount}`,
    `- Configured agent profiles: ${agents.configuredProfileCount}`,
    `- Active agent profiles: ${agents.activeProfileCount}`,
    `- Agent execution records: ${agents.executionCount}`,
  ];

  if (agents.focusedProfile) {
    lines.push(
      `- Focused agent profile: ${agents.focusedProfile.name} (${agents.focusedProfile.agentKey}, ${agents.focusedProfile.status})`,
    );

    if (agents.focusedProfile.description) {
      lines.push(`  Description: ${agents.focusedProfile.description}`);
    }

    if (agents.focusedProfile.foundationOnly) {
      lines.push('  Note: This agent type is foundation-only and does not run autonomously yet.');
    }

    if (agents.focusedProfile.permissions.length > 0) {
      lines.push(`  Permissions: ${agents.focusedProfile.permissions.join(', ')}`);
    }

    if (agents.focusedProfile.enabledTools.length > 0) {
      lines.push(`  Enabled tools: ${agents.focusedProfile.enabledTools.join(', ')}`);
    }
  }

  if (agents.registry.length > 0) {
    lines.push('- Agent registry (operational agents require user approval before executing write actions):');

    for (const entry of agents.registry) {
      lines.push(
        `  - ${entry.name} (${entry.agentKey}) — ${entry.configured ? 'configured' : 'not configured'}${entry.foundationOnly ? ' [foundation only]' : ''}`,
      );
    }
  } else if (agents.minimalOverview) {
    lines.push(
      '- Platform overview mode: specialist agents cover CRM, jobs, finance, scheduling, fleet, communications, documents, automation, analytics, recruiting, integrations, and executive intelligence. Route follow-up questions to the relevant module instead of listing every agent type.',
    );
  }

  if (agents.profiles.length > 0) {
    lines.push('- Configured profiles:');

    for (const profile of agents.profiles) {
      lines.push(
        `  - ${profile.name} (${profile.agentKey}, ${profile.status}) — ${profile.permissionCount} permission(s), ${profile.enabledToolCount} enabled tool(s)`,
      );
    }
  } else {
    lines.push('- No agent profiles have been configured yet.');
  }

  if (agents.recentExecutions.length > 0) {
    lines.push('- Recent agent executions:');

    for (const execution of agents.recentExecutions) {
      lines.push(
        `  - ${execution.agentProfileName ?? 'Unknown profile'} (${execution.agentKey ?? 'unknown'}) via ${execution.executionMode} (${execution.status}) at ${execution.startedAt}${execution.errorMessage ? ` — ${execution.errorMessage}` : ''}`,
      );
    }
  } else {
    lines.push('- No agent executions have been recorded yet.');
  }

  return lines.join('\n');
}

function formatTenantCapabilitiesContext(context: AuraGenerateContext): string | null {
  const tenantCapabilities = context.tenantCapabilities;

  if (!tenantCapabilities) {
    return null;
  }

  const lines: string[] = [];

  if (tenantCapabilities.activeCapabilities.length > 0) {
    lines.push('- Active tenant capabilities:');
    for (const capability of tenantCapabilities.activeCapabilities) {
      lines.push(
        `  - ${capability.name} (${capability.department}) — ${capability.purpose}${capability.baseAgentKey ? ` [base: ${capability.baseAgentKey}]` : ''}`,
      );
    }
  } else {
    lines.push('- No custom tenant capabilities are active yet.');
  }

  if (tenantCapabilities.matchedCapability) {
    lines.push(
      `- Best match for this request: ${tenantCapabilities.matchedCapability.name} (${tenantCapabilities.matchedCapability.department})`,
    );
    lines.push(
      '  Route operational questions to this tenant capability when appropriate. Do not expose internal prompts or tool grants.',
    );
  }

  if (tenantCapabilities.createCapabilityGuidance) {
    lines.push(`- Capability builder guidance: ${tenantCapabilities.createCapabilityGuidance}`);
  }

  return lines.join('\n');
}

function formatPortalContext(context: AuraGenerateContext): string | null {
  const portal = context.portal;

  if (!portal) {
    return null;
  }

  const lines = [
    `- Portal users: ${portal.portalUserCount}`,
    `- Active portal users: ${portal.activePortalUserCount}`,
    `- Customers with portal access: ${portal.linkedCustomerCount}`,
  ];

  if (portal.portalUsers.length > 0) {
    lines.push('- Portal user accounts:');

    for (const user of portal.portalUsers) {
      lines.push(
        `  - ${user.customerName} (${user.email}) — ${user.isActive ? 'active' : 'inactive'}, ${user.permissionCount} permission(s)`,
      );
    }
  } else {
    lines.push('- No customer portal users have been provisioned yet.');
  }

  if (portal.accessPermissions.length > 0) {
    lines.push(`- Available portal access permissions: ${portal.accessPermissions.join(', ')}`);
  }

  return lines.join('\n');
}

function formatCustomerPortalExperienceContext(context: AuraGenerateContext): string | null {
  const experience = context.customerPortalExperience;

  if (!experience) {
    return null;
  }

  const lines = [
    `- Customer: ${experience.customerName}`,
    `- Active jobs: ${experience.activeJobCount}`,
    `- Pending quotes: ${experience.pendingQuoteCount}`,
    `- Outstanding invoices: ${experience.outstandingInvoiceCount}`,
    `- Outstanding balance (cents): ${experience.outstandingBalanceCents}`,
    `- Unread notifications: ${experience.unreadNotificationCount}`,
    `- Upcoming appointments: ${experience.upcomingAppointmentCount}`,
  ];

  if (experience.recentRequests.length > 0) {
    lines.push('- Recent customer portal requests:');
    for (const request of experience.recentRequests) {
      lines.push(`  - ${request.requestType} (${request.status}): ${request.subject}`);
    }
  }

  return lines.join('\n');
}

function formatMobileWorkforceExperienceContext(context: AuraGenerateContext): string | null {
  const experience = context.mobileWorkforceExperience;

  if (!experience) {
    return null;
  }

  const lines = [
    `- Summary: ${experience.summary}`,
    `- Assigned jobs: ${experience.assignedJobCount}`,
    `- Next job: ${experience.nextJobTitle ?? 'None scheduled'}`,
    `- Route stops: ${experience.routeStopCount}`,
    `- Pending workforce requests: ${experience.pendingRequestCount}`,
    `- Inventory alerts: ${experience.inventoryAlertCount}`,
    `- Unread notifications: ${experience.unreadNotificationCount}`,
    `- Cartrack connected: ${experience.cartrackConnected ? 'yes' : 'no'}`,
  ];

  return lines.join('\n');
}

function formatQualityAssuranceContext(context: AuraGenerateContext): string | null {
  const quality = context.qualityAssurance;

  if (!quality) {
    return null;
  }

  const lines = [
    `- Summary: ${quality.summary}`,
    `- Open comebacks: ${quality.openComebackCount}`,
    `- Open warranty claims: ${quality.openWarrantyCount}`,
    `- First-time fix rate: ${quality.firstTimeFixRatePercent ?? 'N/A'}%`,
    `- Total quality cost (cents): ${quality.totalQualityCostCents}`,
    `- Currency: ${quality.currency}`,
    `- Pending quality actions: ${quality.pendingActionCount}`,
    `- Top root cause: ${quality.topRootCause ?? 'None recorded'}`,
  ];

  return lines.join('\n');
}

function formatCommunicationsIntelligenceContext(context: AuraGenerateContext): string | null {
  const comms = context.communicationsIntelligence;

  if (!comms) {
    return null;
  }

  const lines = [
    `- Summary: ${comms.summary}`,
    `- Total communications: ${comms.totalCommunications}`,
    `- Missed calls: ${comms.missedCallCount}`,
    `- Pending communication drafts: ${comms.pendingDraftCount}`,
    `- Open support conversations: ${comms.openSupportCount}`,
    `- WhatsApp messages: ${comms.whatsappMessageCount}`,
    `- Top channel: ${comms.topChannel ?? 'None recorded'}`,
  ];

  return lines.join('\n');
}

function formatAssetEquipmentContext(context: AuraGenerateContext): string | null {
  const assets = context.assetEquipment;

  if (!assets) {
    return null;
  }

  const lines = [
    `- Summary: ${assets.summary}`,
    `- Total assets: ${assets.totalAssets}`,
    `- Active assets: ${assets.activeAssetCount}`,
    `- Pending maintenance records: ${assets.pendingMaintenanceCount}`,
    `- Overdue inspections: ${assets.overdueInspectionCount}`,
    `- Expiring calibrations: ${assets.expiringCalibrationCount}`,
    `- Pending asset actions: ${assets.pendingActionCount}`,
    `- Total maintenance cost (cents): ${assets.totalMaintenanceCostCents}`,
    `- Currency: ${assets.currency}`,
  ];

  return lines.join('\n');
}

function formatAiOrchestrationContext(context: AuraGenerateContext): string | null {
  const ai = context.aiOrchestration;

  if (!ai) {
    return null;
  }

  const lines = [
    `- Summary: ${ai.summary}`,
    `- Providers: ${ai.providerCount} (${ai.healthyProviderCount} healthy)`,
    `- Pending configuration actions: ${ai.pendingActionCount}`,
    `- Total AI cost (cents): ${ai.totalCostCents}`,
    `- Quality evaluations: ${ai.evaluationCount}`,
    `- Routing rules: ${ai.routingRuleCount}`,
  ];

  return lines.join('\n');
}

function formatDispatchIntelligenceContext(context: AuraGenerateContext): string | null {
  const dispatch = context.dispatchIntelligence;

  if (!dispatch) {
    return null;
  }

  const lines = [
    `- Summary: ${dispatch.summary}`,
    `- Live call queue: ${dispatch.liveQueueCount}`,
    `- Pending callbacks: ${dispatch.pendingCallbackCount}`,
    `- Pending dispatch actions: ${dispatch.pendingActionCount}`,
    `- Emergency assessments: ${dispatch.emergencyAssessmentCount}`,
    `- Scheduled jobs: ${dispatch.scheduledJobCount}`,
  ];

  return lines.join('\n');
}

function formatFleetIntelligenceContext(context: AuraGenerateContext): string | null {
  const fleetIntel = context.fleetIntelligence;

  if (!fleetIntel) {
    return null;
  }

  const lines = [
    `- Summary: ${fleetIntel.summary}`,
    `- Total vehicles: ${fleetIntel.totalVehicles}`,
    `- Active vehicles: ${fleetIntel.activeVehicles}`,
    `- Total kilometres (GPS-derived): ${fleetIntel.totalKilometres}`,
    `- Operating costs (cents): ${fleetIntel.totalOperatingCostCents}`,
    `- Pending fleet actions: ${fleetIntel.pendingActionCount}`,
    `- Cartrack connected: ${fleetIntel.cartrackConnected ? 'yes' : 'no'}`,
  ];

  return lines.join('\n');
}

function formatPersonalCommunicationsContext(context: AuraGenerateContext): string | null {
  const personal = context.personalCommunications;

  if (!personal) {
    return null;
  }

  const lines = [
    `- Summary: ${personal.summary}`,
    `- Business conversations: ${personal.totalBusinessConversations}`,
    `- Pending follow-ups: ${personal.pendingFollowUpCount}`,
    `- Pending actions: ${personal.pendingActionCount}`,
    `- New leads detected: ${personal.newLeadsDetected}`,
    `- WhatsApp connected: ${personal.whatsappConnected ? 'yes' : 'no'}`,
  ];

  return lines.join('\n');
}

function formatSecurityContext(context: AuraGenerateContext): string | null {
  const security = context.security;

  if (!security) {
    return null;
  }

  const lines = [
    `- Summary: ${security.summary}`,
    `- Security score: ${security.securityScore ?? 'n/a'}`,
    `- Active sessions: ${security.activeSessionCount}`,
    `- Risk alerts: ${security.riskAlertCount}`,
    `- Pending security actions: ${security.pendingActionCount}`,
    `- Failed logins (24h): ${security.failedLoginCount24h}`,
  ];

  return lines.join('\n');
}

function formatIntegrationPlatformContext(context: AuraGenerateContext): string | null {
  const platform = context.integrationPlatform;

  if (!platform) {
    return null;
  }

  const lines = [
    `- Summary: ${platform.summary}`,
    `- Connected services: ${platform.connectedServiceCount}`,
    `- Services in error: ${platform.errorServiceCount}`,
    `- Active sync jobs: ${platform.activeSyncJobCount}`,
    `- Failed requests (24h): ${platform.failedRequestCount24h}`,
    `- Pending integration actions: ${platform.pendingActionCount}`,
  ];

  return lines.join('\n');
}

function formatEnterpriseAnalyticsContext(context: AuraGenerateContext): string | null {
  const analytics = context.enterpriseAnalytics;

  if (!analytics) {
    return null;
  }

  const lines = [
    `- Summary: ${analytics.summary}`,
    `- Active KPIs: ${analytics.activeKpiCount}`,
    `- Pending insights: ${analytics.pendingInsightCount}`,
    `- Pending analytics actions: ${analytics.pendingActionCount}`,
    `- Data warehouse modules: ${analytics.moduleCount}`,
    `- Historical snapshots: ${analytics.snapshotCount}`,
  ];

  return lines.join('\n');
}

function formatEnterpriseAutomationStudioContext(context: AuraGenerateContext): string | null {
  const studio = context.enterpriseAutomationStudio;

  if (!studio) {
    return null;
  }

  const lines = [
    `- Summary: ${studio.summary}`,
    `- Workflows: ${studio.workflowCount}`,
    `- Active workflows: ${studio.activeWorkflowCount}`,
    `- Pending approvals: ${studio.pendingApprovalCount}`,
    `- Failed runs: ${studio.failedRunCount}`,
    `- Pending recommendations: ${studio.recommendationCount}`,
  ];

  return lines.join('\n');
}

function formatEnterpriseDigitalTwinContext(context: AuraGenerateContext): string | null {
  const twin = context.enterpriseDigitalTwin;

  if (!twin) {
    return null;
  }

  const lines = [
    `- Summary: ${twin.summary}`,
    `- Health score: ${twin.healthScore ?? '—'}`,
    `- Active scenarios: ${twin.activeScenarioCount}`,
    `- Completed simulations: ${twin.completedSimulationCount}`,
    `- Pending recommendations: ${twin.pendingRecommendationCount}`,
    `- Operational risk: ${twin.operationalRiskLevel}`,
    `- Pending actions: ${twin.pendingActionCount}`,
  ];

  return lines.join('\n');
}

function formatEnterpriseKnowledgeGraphContext(context: AuraGenerateContext): string | null {
  const graph = context.enterpriseKnowledgeGraph;

  if (!graph) {
    return null;
  }

  const lines = [
    `- Summary: ${graph.summary}`,
    `- Indexed entities: ${graph.entityCount}`,
    `- Relationships: ${graph.relationshipCount}`,
    `- Memory entries: ${graph.memoryEntryCount}`,
    `- Semantic index records: ${graph.indexedCount}`,
    `- Pending recommendations: ${graph.pendingRecommendationCount}`,
    `- Pending actions: ${graph.pendingActionCount}`,
  ];

  return lines.join('\n');
}

function formatEnterpriseMissionControlContext(context: AuraGenerateContext): string | null {
  const missionControl = context.enterpriseMissionControl;

  if (!missionControl) {
    return null;
  }

  const lines = [
    `- Summary: ${missionControl.summary}`,
    `- Business health score: ${missionControl.businessHealthScore ?? '—'}`,
    `- Pending alerts: ${missionControl.pendingAlertCount}`,
    `- Critical alerts: ${missionControl.criticalAlertCount}`,
    `- Active incidents: ${missionControl.activeIncidentCount}`,
    `- Pending recommendations: ${missionControl.pendingRecommendationCount}`,
    `- Pending command actions: ${missionControl.pendingActionCount}`,
  ];

  return lines.join('\n');
}

function formatEnterpriseEvolutionContext(context: AuraGenerateContext): string | null {
  const evolution = context.enterpriseEvolution;

  if (!evolution) {
    return null;
  }

  const lines = [
    `- Summary: ${evolution.summary}`,
    `- Optimization score: ${evolution.optimizationScore ?? '—'}`,
    `- Learning progress: ${evolution.learningProgressPercent ?? '—'}%`,
    `- AI confidence: ${evolution.aiConfidenceScore ?? '—'}`,
    `- Pending recommendations: ${evolution.pendingRecommendationCount}`,
    `- Pending optimizations: ${evolution.pendingOptimizationCount}`,
    `- Patterns detected: ${evolution.patternCount}`,
  ];

  return lines.join('\n');
}

function formatEnterpriseDeveloperPlatformContext(context: AuraGenerateContext): string | null {
  const developerPlatform = context.enterpriseDeveloperPlatform;

  if (!developerPlatform) {
    return null;
  }

  const lines = [
    `- Summary: ${developerPlatform.summary}`,
    `- API requests tracked: ${developerPlatform.apiRequestCount}`,
    `- Installed extensions: ${developerPlatform.installedExtensionCount}`,
    `- Webhook subscriptions: ${developerPlatform.webhookSubscriptionCount}`,
    `- SDK packages generated: ${developerPlatform.sdkPackageCount}`,
    `- Pending platform actions: ${developerPlatform.pendingActionCount}`,
  ];

  return lines.join('\n');
}

function formatEnterpriseSaasPlatformContext(context: AuraGenerateContext): string | null {
  const saasPlatform = context.enterpriseSaasPlatform;

  if (!saasPlatform) {
    return null;
  }

  const lines = [
    `- Summary: ${saasPlatform.summary}`,
    `- Platform owner tenant: ${saasPlatform.isPlatformOwner ? 'yes' : 'no'}`,
    `- Customer tenants: ${saasPlatform.tenantCount}`,
    `- Active subscriptions: ${saasPlatform.activeSubscriptionCount}`,
    `- Subscription status: ${saasPlatform.subscriptionStatus ?? 'none'}`,
    `- Pending platform actions: ${saasPlatform.pendingActionCount}`,
  ];

  return lines.join('\n');
}

function formatDocumentAiContext(context: AuraGenerateContext): string | null {
  const documentAi = context.documentAi;

  if (!documentAi) {
    return null;
  }

  const lines = [
    `- Summary: ${documentAi.summary}`,
    `- Pending OCR jobs: ${documentAi.pendingOcrCount}`,
    `- Failed OCR jobs: ${documentAi.failedOcrCount}`,
    `- Review backlog: ${documentAi.reviewBacklogCount}`,
    `- Open alerts: ${documentAi.openAlertCount}`,
    `- Health status: ${documentAi.overallDocumentAiHealthStatus}`,
  ];

  return lines.join('\n');
}

function formatBusinessContinuityContext(context: AuraGenerateContext): string | null {
  const businessContinuity = context.businessContinuity;

  if (!businessContinuity) {
    return null;
  }

  const lines = [
    `- Summary: ${businessContinuity.summary}`,
    `- Failed backups: ${businessContinuity.failedBackupCount}`,
    `- Restore readiness: ${businessContinuity.restoreReadinessStatus}`,
    `- Recovery readiness: ${businessContinuity.recoveryReadinessStatus}`,
    `- Open alerts: ${businessContinuity.openAlertCount}`,
    `- Health status: ${businessContinuity.overallBusinessContinuityHealthStatus}`,
  ];

  return lines.join('\n');
}

function formatSearchIntelligenceContext(context: AuraGenerateContext): string | null {
  const searchIntelligence = context.searchIntelligence;

  if (!searchIntelligence) {
    return null;
  }

  const lines = [
    `- Summary: ${searchIntelligence.summary}`,
    `- Indexed records: ${searchIntelligence.indexedCount}`,
    `- Failed index entries: ${searchIntelligence.failedIndexCount}`,
    `- Open alerts: ${searchIntelligence.openAlertCount}`,
    `- Health status: ${searchIntelligence.overallSearchHealthStatus}`,
  ];

  return lines.join('\n');
}

function formatMigrationIntelligenceContext(context: AuraGenerateContext): string | null {
  const migrationIntelligence = context.migrationIntelligence;

  if (!migrationIntelligence) {
    return null;
  }

  const lines = [
    `- Summary: ${migrationIntelligence.summary}`,
    `- Active imports: ${migrationIntelligence.activeImportCount}`,
    `- Failed imports: ${migrationIntelligence.failedImportCount}`,
    `- Rollback available: ${migrationIntelligence.rollbackAvailableCount}`,
    `- Open alerts: ${migrationIntelligence.openAlertCount}`,
    `- Health status: ${migrationIntelligence.overallMigrationHealthStatus}`,
  ];

  return lines.join('\n');
}

function formatNotificationIntelligenceContext(context: AuraGenerateContext): string | null {
  const notificationIntelligence = context.notificationIntelligence;

  if (!notificationIntelligence) {
    return null;
  }

  const lines = [
    `- Summary: ${notificationIntelligence.summary}`,
    `- Active alerts: ${notificationIntelligence.activeAlertCount}`,
    `- Failed deliveries: ${notificationIntelligence.failedDeliveryCount}`,
    `- Pending escalations: ${notificationIntelligence.pendingEscalationCount}`,
    `- Open platform alerts: ${notificationIntelligence.openAlertCount}`,
    `- Health status: ${notificationIntelligence.overallNotificationHealthStatus}`,
  ];

  return lines.join('\n');
}

function formatPlatformHealthContext(context: AuraGenerateContext): string | null {
  const platformHealth = context.platformHealth;

  if (!platformHealth) {
    return null;
  }

  const lines = [
    `- Summary: ${platformHealth.summary}`,
    `- Health score: ${platformHealth.overallHealthScore ?? '—'}`,
    `- Critical incidents: ${platformHealth.criticalIncidentCount}`,
    `- Failed diagnostics: ${platformHealth.failedDiagnosticCount}`,
    `- Open alerts: ${platformHealth.openAlertCount}`,
    `- Health status: ${platformHealth.overallPlatformHealthStatus}`,
  ];

  return lines.join('\n');
}

function formatLaunchReadinessContext(context: AuraGenerateContext): string | null {
  const launchReadiness = context.launchReadiness;

  if (!launchReadiness) {
    return null;
  }

  const lines = [
    `- Summary: ${launchReadiness.summary}`,
    `- Readiness score: ${launchReadiness.overallScore ?? '—'}`,
    `- Critical blockers: ${launchReadiness.criticalBlockerCount}`,
    `- Failed checks: ${launchReadiness.failedCheckCount}`,
    `- Pending approvals: ${launchReadiness.pendingApprovalCount}`,
    `- Open alerts: ${launchReadiness.openAlertCount}`,
    `- Launch status: ${launchReadiness.overallLaunchReadinessStatus}`,
  ];

  return lines.join('\n');
}

function formatReleaseCandidateContext(context: AuraGenerateContext): string | null {
  const releaseCandidate = context.releaseCandidate;

  if (!releaseCandidate) {
    return null;
  }

  const lines = [
    `- Summary: ${releaseCandidate.summary}`,
    `- Readiness score: ${releaseCandidate.readinessScore ?? '—'}`,
    `- Failed validations: ${releaseCandidate.failedValidationCount}`,
    `- Warnings: ${releaseCandidate.warningCount}`,
    `- Optimization opportunities: ${releaseCandidate.optimizationCount}`,
    `- Open alerts: ${releaseCandidate.openAlertCount}`,
    `- Release status: ${releaseCandidate.overallReleaseStatus}`,
  ];

  return lines.join('\n');
}

function formatProductionLaunchContext(context: AuraGenerateContext): string | null {
  const productionLaunch = context.productionLaunch;

  if (!productionLaunch) {
    return null;
  }

  const lines = [
    `- Summary: ${productionLaunch.summary}`,
    `- Launch status: ${productionLaunch.launchStatus}`,
    `- Failed providers: ${productionLaunch.failedProviderCount}`,
    `- Missing config: ${productionLaunch.missingConfigCount}`,
    `- Pending approvals: ${productionLaunch.pendingApprovalCount}`,
    `- Open alerts: ${productionLaunch.openAlertCount}`,
    `- Production status: ${productionLaunch.overallProductionStatus}`,
  ];

  return lines.join('\n');
}

function formatReleaseManagementContext(context: AuraGenerateContext): string | null {
  const releaseManagement = context.releaseManagement;

  if (!releaseManagement) {
    return null;
  }

  const lines = [
    `- Summary: ${releaseManagement.summary}`,
    `- Release status: ${releaseManagement.releaseStatus}`,
    `- Documentation completeness: ${releaseManagement.documentationCompleteness}%`,
    `- Pending checklist items: ${releaseManagement.pendingChecklistCount}`,
    `- Mobile ready: ${releaseManagement.mobileReady ? 'yes' : 'no'}`,
    `- Open alerts: ${releaseManagement.openAlertCount}`,
    `- Overall release status: ${releaseManagement.overallReleaseStatus}`,
  ];

  return lines.join('\n');
}

function formatIntegrationHubContext(context: AuraGenerateContext): string | null {
  const integrationHub = context.integrationHub;

  if (!integrationHub) {
    return null;
  }

  const lines = [
    `- Registered providers: ${integrationHub.providerCount}`,
    `- Configured connections: ${integrationHub.configuredConnectionCount}`,
    `- Connected integrations: ${integrationHub.connectedCount}`,
    `- Connections in error: ${integrationHub.errorCount}`,
    `- Sync jobs recorded: ${integrationHub.syncJobCount}`,
    `- Webhook endpoints: ${integrationHub.webhookEndpointCount}`,
    `- Webhook events logged: ${integrationHub.webhookEventCount}`,
  ];

  if (integrationHub.providers.length > 0) {
    lines.push('- Provider connection status:');

    for (const provider of integrationHub.providers) {
      lines.push(
        `  - ${provider.name} (${provider.provider}): ${provider.connectionStatus}${provider.isConfigured ? '' : ' — not configured'}${provider.lastSyncAt ? `, last sync ${provider.lastSyncAt}` : ''}`,
      );
    }
  } else {
    lines.push('- No integration providers are registered yet.');
  }

  if (integrationHub.recentSyncJobs.length > 0) {
    lines.push('- Recent sync jobs:');

    for (const job of integrationHub.recentSyncJobs) {
      lines.push(
        `  - ${job.provider} (${job.status}) at ${job.startedAt}${job.errorMessage ? ` — ${job.errorMessage}` : ''}`,
      );
    }
  } else {
    lines.push('- No sync jobs have been recorded yet.');
  }

  return lines.join('\n');
}

function formatIntegrationApiManagementContext(context: AuraGenerateContext): string | null {
  const integrationApiManagement = context.integrationApiManagement;

  if (!integrationApiManagement) {
    return null;
  }

  const lines = [
    `- Registry entries: ${integrationApiManagement.registryCount}`,
    `- Enabled integrations: ${integrationApiManagement.enabledCount}`,
    `- Connected integrations: ${integrationApiManagement.connectedCount}`,
    `- Unhealthy integrations: ${integrationApiManagement.unhealthyCount}`,
    `- Pending webhook deliveries: ${integrationApiManagement.pendingWebhookDeliveries}`,
    `- Developer API keys: ${integrationApiManagement.developerApiKeyCount}`,
  ];

  if (integrationApiManagement.providers.length > 0) {
    lines.push('- Registry provider status:');

    for (const provider of integrationApiManagement.providers) {
      lines.push(
        `  - ${provider.name} (${provider.provider}): enabled=${provider.enabled}, health=${provider.healthStatus}, connection=${provider.connectionStatus}${provider.lastSyncAt ? `, last sync ${provider.lastSyncAt}` : ''}`,
      );
    }
  }

  if (integrationApiManagement.recentHealth.length > 0) {
    lines.push('- Recent health snapshots:');

    for (const health of integrationApiManagement.recentHealth) {
      lines.push(`  - ${health.provider} (${health.healthStatus}): ${health.summary}`);
    }
  }

  return lines.join('\n');
}

function formatWhatsappContext(context: AuraGenerateContext): string | null {
  const whatsapp = context.whatsapp;

  if (!whatsapp) {
    return null;
  }

  const lines = [
    `- WhatsApp connection: ${whatsapp.connectionStatus}${whatsapp.displayPhoneNumber ? ` (${whatsapp.displayPhoneNumber})` : ''}`,
    `- Messages: ${whatsapp.messageCount} total (${whatsapp.incomingCount} incoming, ${whatsapp.outgoingCount} outgoing)`,
    `- Draft messages awaiting approval: ${whatsapp.draftCount}`,
    `- Pending customer replies: ${whatsapp.pendingReplyCount}`,
    `- Approved templates: ${whatsapp.templateCount}`,
    '- IMPORTANT: Never send WhatsApp messages automatically. Always draft first and ask the user to review and approve before sending.',
  ];

  if (whatsapp.focusedCustomerMessages && whatsapp.focusedCustomerMessages.length > 0) {
    lines.push('- Focused customer WhatsApp history:');

    for (const message of whatsapp.focusedCustomerMessages) {
      lines.push(
        `  - ${message.direction} · ${message.deliveryStatus}${message.isDraft ? ' (draft)' : ''} · ${message.occurredAt}`,
      );
      lines.push(`    ${message.messagePreview}`);
    }
  }

  if (whatsapp.pendingReplies.length > 0) {
    lines.push('- Pending replies:');

    for (const reply of whatsapp.pendingReplies) {
      lines.push(
        `  - ${reply.customerName ?? 'Unknown customer'} · ${reply.receivedAt}: ${reply.messagePreview}`,
      );
    }
  }

  if (whatsapp.recentConversations.length > 0) {
    lines.push('- Recent WhatsApp conversations:');

    for (const conversation of whatsapp.recentConversations) {
      lines.push(
        `  - ${conversation.customerName ?? 'Unknown'} · ${conversation.direction} · ${conversation.deliveryStatus}${conversation.isDraft ? ' (draft)' : ''} · ${conversation.occurredAt}`,
      );
      lines.push(`    ${conversation.lastMessagePreview}`);
    }
  }

  if (whatsapp.automationExamples.length > 0) {
    lines.push('- Automation examples (draft-only):');

    for (const example of whatsapp.automationExamples) {
      lines.push(`  - ${example}`);
    }
  }

  return lines.join('\n');
}

function formatRecruitingContext(context: AuraGenerateContext): string | null {
  const recruiting = context.recruiting;

  if (!recruiting) {
    return null;
  }

  const lines = [
    `- Candidates: ${recruiting.candidateCount}`,
    `- Applications: ${recruiting.applicationCount}`,
    `- New candidates: ${recruiting.newCount}`,
    `- In interview: ${recruiting.interviewCount}`,
  ];

  if (recruiting.candidates.length > 0) {
    lines.push('- Recent candidates:');

    for (const candidate of recruiting.candidates) {
      lines.push(
        `  - ${candidate.name}${candidate.roleTitle ? ` (${candidate.roleTitle})` : ''} — ${candidate.status}, ${candidate.applicationCount} application(s)`,
      );
    }
  } else {
    lines.push('- No recruiting candidates have been added yet.');
  }

  return lines.join('\n');
}

function formatXeroAccountingContext(context: AuraGenerateContext): string | null {
  const xero = context.xeroAccounting;

  if (!xero?.connected) {
    return null;
  }

  const lines = [
    `- Xero organisation: ${xero.organisationName ?? 'Connected'}`,
    `- Base currency: ${xero.baseCurrency ?? xero.currency}`,
    `- Synced customers: ${xero.syncedCustomerCount}`,
    `- Synced quotes: ${xero.syncedQuoteCount}`,
    `- Synced invoices: ${xero.syncedInvoiceCount}`,
    `- Synced payments: ${xero.syncedPaymentCount}`,
    `- Outstanding amount: ${(xero.outstandingAmountCents / 100).toFixed(2)} ${xero.currency}`,
    `- Unpaid invoices: ${xero.unpaidInvoiceCount}`,
    `- Customers owing: ${xero.customersWithOutstandingCount}`,
  ];

  if (xero.unpaidInvoices.length > 0) {
    lines.push('- Unpaid invoices (synced records only):');

    for (const invoice of xero.unpaidInvoices) {
      lines.push(
        `  - ${invoice.invoiceNumber} (${invoice.customerName}) — due ${(invoice.amountDueCents / 100).toFixed(2)} ${xero.currency}, status ${invoice.status}${invoice.dueDate ? `, due ${invoice.dueDate}` : ''}`,
      );
    }
  } else {
    lines.push('- No unpaid synced invoices are recorded.');
  }

  if (xero.customersOwing.length > 0) {
    lines.push('- Customers with outstanding balances:');

    for (const customer of xero.customersOwing) {
      lines.push(
        `  - ${customer.customerName} — ${(customer.outstandingAmountCents / 100).toFixed(2)} ${xero.currency} across ${customer.unpaidInvoiceCount} invoice(s)`,
      );
    }
  }

  return lines.join('\n');
}

function formatIntelligenceContext(context: AuraGenerateContext): string | null {
  const intelligence = context.intelligence;

  if (!intelligence) {
    return null;
  }

  return [
    `- Greeting: ${intelligence.greeting.message}`,
    `- Jobs today: ${intelligence.todaysJobCount}`,
    `- Upcoming schedule items: ${intelligence.upcomingScheduleCount}`,
    `- Outstanding invoices: ${intelligence.outstandingInvoiceCount}`,
    `- Customer follow-ups needed: ${intelligence.customerFollowUpCount}`,
    `- Pending approvals: ${intelligence.pendingApprovalCount}`,
    `- Automation failures: ${intelligence.automationFailureCount}`,
    `- Fleet issues: ${intelligence.fleetIssueCount}`,
    `- Low stock items: ${intelligence.lowStockCount}`,
    `- Revenue MTD: ${(intelligence.revenueMtdCents / 100).toFixed(2)} ${intelligence.currency}`,
  ].join('\n');
}

function formatMemoryContext(context: AuraGenerateContext): string | null {
  const memory = context.memory;

  if (!memory || memory.memories.length === 0) {
    return null;
  }

  const lines = [`- Saved company memories: ${memory.memoryCount}`];

  for (const entry of memory.memories) {
    lines.push(`  - [${entry.category}, importance ${entry.importance}] ${entry.information}`);
  }

  return lines.join('\n');
}

function formatRecommendationsContext(context: AuraGenerateContext): string | null {
  const recommendations = context.recommendations;

  if (!recommendations || recommendations.items.length === 0) {
    return null;
  }

  const lines = [`- Active recommendations: ${recommendations.count}`];

  for (const item of recommendations.items) {
    lines.push(`  - [${item.priority}] ${item.title}: ${item.description}`);
  }

  return lines.join('\n');
}

function formatAnalyticsContext(context: AuraGenerateContext): string | null {
  const analytics = context.analytics;

  if (!analytics) {
    return null;
  }

  return [
    `- Period: ${analytics.period}`,
    `- Revenue: ${(analytics.revenueCents / 100).toFixed(2)}`,
    `- Jobs: ${analytics.jobCount}`,
    `- New customers: ${analytics.newCustomers}`,
    `- Outstanding balance: ${(analytics.outstandingCents / 100).toFixed(2)}`,
    analytics.completionRatePercent !== null
      ? `- Completion rate: ${analytics.completionRatePercent}%`
      : '- Completion rate: not enough data',
    `- Summary: ${analytics.summary}`,
  ].join('\n');
}

function formatMobileContext(context: AuraGenerateContext): string | null {
  const mobile = context.mobile;

  if (!mobile) {
    return null;
  }

  const lines = [`- Mobile role: ${mobile.role}`, `- Summary: ${mobile.summary}`];

  for (const [key, value] of Object.entries(mobile.details)) {
    if (value === null || value === undefined) continue;
    lines.push(`- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
  }

  return lines.join('\n');
}

function formatOrchestrationContext(context: AuraGenerateContext): string | null {
  const orchestration = context.orchestration;

  if (!orchestration) {
    return null;
  }

  const lines = [
    `- Active orchestrations: ${orchestration.activeOrchestrationCount}`,
    `- Active runs: ${orchestration.activeRunCount}`,
    `- Pending approvals: ${orchestration.pendingApprovalCount}`,
  ];

  if (orchestration.recentRuns.length > 0) {
    lines.push('- Recent runs:');
    for (const run of orchestration.recentRuns.slice(0, 5)) {
      lines.push(
        `  - ${run.orchestrationName ?? 'Unnamed'} (${run.status})${run.triggerEvent ? ` — trigger: ${run.triggerEvent}` : ''}`,
      );
    }
  }

  return lines.join('\n');
}

function formatSalesContext(context: AuraGenerateContext): string | null {
  const sales = context.sales;

  if (!sales) {
    return null;
  }

  const lines = [
    `- Summary: ${sales.summary}`,
    `- Open opportunities: ${sales.openOpportunityCount}`,
    `- Pipeline value: ${(sales.pipelineValueCents / 100).toFixed(2)}`,
    `- Pending recommendations: ${sales.pendingRecommendationCount}`,
  ];

  if (sales.topOpportunities.length > 0) {
    lines.push('- Top opportunities:');
    for (const opportunity of sales.topOpportunities.slice(0, 5)) {
      lines.push(
        `  - ${opportunity.title}${opportunity.customerName ? ` (${opportunity.customerName})` : ''} — ${opportunity.status}`,
      );
    }
  }

  if (sales.detectedSignals.length > 0) {
    lines.push('- Detected signals:');
    for (const signal of sales.detectedSignals.slice(0, 5)) {
      lines.push(`  - [${signal.priority}] ${signal.title}: ${signal.description}`);
    }
  }

  return lines.join('\n');
}

function formatMarketingContext(context: AuraGenerateContext): string | null {
  const marketing = context.marketing;

  if (!marketing) {
    return null;
  }

  const lines = [
    `- Summary: ${marketing.summary}`,
    `- Active campaigns: ${marketing.activeCampaignCount}`,
    `- Pending recommendations: ${marketing.pendingRecommendationCount}`,
  ];

  if (marketing.topSegments.length > 0) {
    lines.push('- Top segments:');
    for (const segment of marketing.topSegments.slice(0, 5)) {
      lines.push(`  - ${segment.name} (${segment.customerCount} customers, ${segment.segmentType})`);
    }
  }

  if (marketing.topRecommendations.length > 0) {
    lines.push('- Top recommendations:');
    for (const recommendation of marketing.topRecommendations.slice(0, 5)) {
      lines.push(`  - [${recommendation.priority}] ${recommendation.title} (${recommendation.recommendationType})`);
    }
  }

  if (marketing.contentSuggestions.length > 0) {
    lines.push('- Content suggestions:');
    for (const suggestion of marketing.contentSuggestions.slice(0, 3)) {
      lines.push(`  - ${suggestion.title}: ${suggestion.description}`);
    }
  }

  return lines.join('\n');
}

function formatLeadsContext(context: AuraGenerateContext): string | null {
  const leads = context.leads;

  if (!leads) {
    return null;
  }

  const lines = [
    `- Summary: ${leads.summary}`,
    `- Active leads: ${leads.activeLeadCount}`,
    `- Qualified leads: ${leads.qualifiedLeadCount}`,
    `- Average score: ${leads.averageScore}`,
    `- Pending recommendations: ${leads.pendingRecommendationCount}`,
  ];

  if (leads.topLeads.length > 0) {
    lines.push('- Top leads:');
    for (const lead of leads.topLeads.slice(0, 5)) {
      lines.push(`  - ${lead.title} (${lead.contactName}) — ${lead.status}, score ${lead.score}`);
    }
  }

  if (leads.acquisitionInsights.length > 0) {
    lines.push('- Acquisition insights:');
    for (const insight of leads.acquisitionInsights.slice(0, 5)) {
      lines.push(`  - [${insight.priority}] ${insight.title}: ${insight.description}`);
    }
  }

  return lines.join('\n');
}

function formatVoiceContext(context: AuraGenerateContext): string | null {
  const voice = context.voice;

  if (!voice) {
    return null;
  }

  const lines = [
    `- Summary: ${voice.summary}`,
    `- Active sessions: ${voice.activeSessionCount}`,
    `- Follow-up required: ${voice.followUpRequiredCount}`,
    `- Pending follow-ups: ${voice.pendingFollowUpCount}`,
  ];

  if (voice.recentSessions.length > 0) {
    lines.push('- Recent calls:');
    for (const session of voice.recentSessions.slice(0, 5)) {
      lines.push(
        `  - ${session.callerName ?? 'Unknown caller'} (${session.enquiryType}, ${session.status})${session.followUpRequired ? ' — follow-up required' : ''}`,
      );
    }
  }

  if (voice.waitingEnquiries.length > 0) {
    lines.push('- Waiting enquiries:');
    for (const insight of voice.waitingEnquiries.slice(0, 5)) {
      lines.push(`  - [${insight.priority}] ${insight.title}: ${insight.description}`);
    }
  }

  return lines.join('\n');
}

function formatCustomerSupportContext(context: AuraGenerateContext): string | null {
  const customerSupport = context.customerSupport;

  if (!customerSupport) {
    return null;
  }

  const lines = [
    `- Summary: ${customerSupport.summary}`,
    `- Open conversations: ${customerSupport.openConversationCount}`,
    `- Pending escalations: ${customerSupport.pendingEscalationCount}`,
    `- Unresolved conversations: ${customerSupport.unresolvedConversationCount}`,
  ];

  if (customerSupport.recentConversations.length > 0) {
    lines.push('- Recent support conversations:');
    for (const conversation of customerSupport.recentConversations.slice(0, 5)) {
      lines.push(
        `  - ${conversation.customerName ?? 'Customer'} — ${conversation.subject} (${conversation.status}, ${conversation.channel})`,
      );
    }
  }

  if (customerSupport.attentionInsights.length > 0) {
    lines.push('- Attention needed:');
    for (const insight of customerSupport.attentionInsights.slice(0, 5)) {
      lines.push(`  - [${insight.priority}] ${insight.title}: ${insight.description}`);
    }
  }

  return lines.join('\n');
}

function formatWorkforceContext(context: AuraGenerateContext): string | null {
  const workforce = context.workforce;

  if (!workforce) {
    return null;
  }

  const lines = [
    `- Summary: ${workforce.summary}`,
    `- Candidates: ${workforce.candidateCount}`,
    `- Active pipeline: ${workforce.activePipelineCount}`,
    `- Skill gap signals: ${workforce.skillGapCount}`,
    `- Pending recommendations: ${workforce.pendingRecommendationCount}`,
  ];

  if (workforce.pipelineStages.length > 0) {
    lines.push('- Pipeline stages:');
    for (const stage of workforce.pipelineStages) {
      lines.push(`  - ${stage.label}: ${stage.count}`);
    }
  }

  if (workforce.staffingInsights.length > 0) {
    lines.push('- Staffing insights:');
    for (const insight of workforce.staffingInsights.slice(0, 5)) {
      lines.push(`  - [${insight.priority}] ${insight.title}: ${insight.description}`);
    }
  }

  if (workforce.topRecommendations.length > 0) {
    lines.push('- Top recommendations:');
    for (const recommendation of workforce.topRecommendations.slice(0, 5)) {
      lines.push(
        `  - [${recommendation.priority}] ${recommendation.title} (${recommendation.recommendationType})`,
      );
    }
  }

  return lines.join('\n');
}

function formatProcurementContext(context: AuraGenerateContext): string | null {
  const procurement = context.procurement;

  if (!procurement) {
    return null;
  }

  const lines = [
    `- Summary: ${procurement.summary}`,
    `- Suppliers: ${procurement.supplierCount}`,
    `- Open orders: ${procurement.openOrderCount}`,
    `- Low-stock items: ${procurement.lowStockCount}`,
    `- POs pending approval: ${procurement.pendingApprovalCount}`,
    `- Pending recommendations: ${procurement.pendingRecommendationCount}`,
  ];

  if (procurement.stockSignals.length > 0) {
    lines.push('- Stock signals:');
    for (const signal of procurement.stockSignals.slice(0, 5)) {
      lines.push(`  - [${signal.priority}] ${signal.itemName} (${signal.itemSku}): ${signal.description}`);
    }
  }

  if (procurement.supplierInsights.length > 0) {
    lines.push('- Supplier insights:');
    for (const insight of procurement.supplierInsights.slice(0, 5)) {
      lines.push(`  - [${insight.priority}] ${insight.title}: ${insight.description}`);
    }
  }

  if (procurement.topRecommendations.length > 0) {
    lines.push('- Top recommendations:');
    for (const recommendation of procurement.topRecommendations.slice(0, 5)) {
      lines.push(
        `  - [${recommendation.priority}] ${recommendation.title} (${recommendation.recommendationType})`,
      );
    }
  }

  return lines.join('\n');
}

function formatExecutiveContext(context: AuraGenerateContext): string | null {
  const executive = context.executive;

  if (!executive) {
    return null;
  }

  const lines = [
    `- Summary: ${executive.summary}`,
    `- Business health: ${executive.healthScore ?? 'n/a'}/100 (${executive.healthTrend})`,
    `- Pending alerts: ${executive.pendingAlertCount}`,
    `- Pending recommendations: ${executive.pendingRecommendationCount}`,
    `- Revenue: ${(executive.businessSummary.revenueCents / 100).toFixed(2)} ${executive.businessSummary.currency}${executive.businessSummary.revenueChangePercent !== null ? ` (${executive.businessSummary.revenueChangePercent}%)` : ''}`,
    `- Active jobs: ${executive.businessSummary.activeJobs}`,
    `- Completed jobs: ${executive.businessSummary.completedJobs}`,
    `- Outstanding invoices: ${(executive.businessSummary.outstandingInvoiceCents / 100).toFixed(2)} ${executive.businessSummary.currency}`,
  ];

  if (executive.topAlerts.length > 0) {
    lines.push('- Executive alerts:');
    for (const alert of executive.topAlerts.slice(0, 5)) {
      lines.push(`  - [${alert.priority}] ${alert.title} (${alert.alertType})`);
    }
  }

  if (executive.topRecommendations.length > 0) {
    lines.push('- Strategic recommendations:');
    for (const recommendation of executive.topRecommendations.slice(0, 5)) {
      lines.push(
        `  - [${recommendation.priority}] ${recommendation.title} (${recommendation.recommendationType})`,
      );
    }
  }

  if (executive.businessSummary.highlights.length > 0) {
    lines.push('- Highlights:');
    for (const highlight of executive.businessSummary.highlights.slice(0, 5)) {
      lines.push(`  - ${highlight}`);
    }
  }

  return lines.join('\n');
}

export function buildSystemPrompt(context: AuraGenerateContext): string {
  const profileLines = [
    `- Company ID: ${context.companyId}`,
    `- Company: ${context.companyName}`,
    `- User: ${context.userName}`,
    formatOptional(context.industry, 'Industry'),
    formatOptional(context.businessType, 'Business type'),
    ...formatPreferences(context),
  ].filter((line): line is string => Boolean(line));

  const crmSection = formatCrmContext(context);
  const jobsSection = formatJobsContext(context);
  const schedulingSection = formatSchedulingContext(context);
  const financeSection = formatFinanceContext(context);
  const financeIntelligenceSection = formatFinanceIntelligenceContext(context);
  const knowledgeSection = formatKnowledgeContext(context);
  const businessIntelligenceSection = formatBusinessIntelligenceContext(context);
  const inventorySection = formatInventoryContext(context);
  const fleetSection = formatFleetContext(context);
  const communicationsSection = formatCommunicationsContext(context);
  const documentsSection = formatDocumentsContext(context);
  const automationSection = formatAutomationContext(context);
  const agentsSection = formatAgentsContext(context);
  const tenantCapabilitiesSection = formatTenantCapabilitiesContext(context);
  const portalSection = formatPortalContext(context);
  const customerPortalExperienceSection = formatCustomerPortalExperienceContext(context);
  const mobileWorkforceExperienceSection = formatMobileWorkforceExperienceContext(context);
  const qualityAssuranceSection = formatQualityAssuranceContext(context);
  const communicationsIntelligenceSection = formatCommunicationsIntelligenceContext(context);
  const assetEquipmentSection = formatAssetEquipmentContext(context);
  const aiOrchestrationSection = formatAiOrchestrationContext(context);
  const dispatchIntelligenceSection = formatDispatchIntelligenceContext(context);
  const fleetIntelligenceSection = formatFleetIntelligenceContext(context);
  const personalCommunicationsSection = formatPersonalCommunicationsContext(context);
  const securitySection = formatSecurityContext(context);
  const integrationPlatformSection = formatIntegrationPlatformContext(context);
  const enterpriseAnalyticsSection = formatEnterpriseAnalyticsContext(context);
  const enterpriseAutomationStudioSection = formatEnterpriseAutomationStudioContext(context);
  const enterpriseDigitalTwinSection = formatEnterpriseDigitalTwinContext(context);
  const enterpriseKnowledgeGraphSection = formatEnterpriseKnowledgeGraphContext(context);
  const enterpriseMissionControlSection = formatEnterpriseMissionControlContext(context);
  const enterpriseEvolutionSection = formatEnterpriseEvolutionContext(context);
  const enterpriseDeveloperPlatformSection = formatEnterpriseDeveloperPlatformContext(context);
  const enterpriseSaasPlatformSection = formatEnterpriseSaasPlatformContext(context);
  const documentAiSection = formatDocumentAiContext(context);
  const businessContinuitySection = formatBusinessContinuityContext(context);
  const searchIntelligenceSection = formatSearchIntelligenceContext(context);
  const migrationIntelligenceSection = formatMigrationIntelligenceContext(context);
  const notificationIntelligenceSection = formatNotificationIntelligenceContext(context);
  const platformHealthSection = formatPlatformHealthContext(context);
  const launchReadinessSection = formatLaunchReadinessContext(context);
  const releaseCandidateSection = formatReleaseCandidateContext(context);
  const productionLaunchSection = formatProductionLaunchContext(context);
  const releaseManagementSection = formatReleaseManagementContext(context);
  const integrationHubSection = formatIntegrationHubContext(context);
  const integrationApiManagementSection = formatIntegrationApiManagementContext(context);
  const xeroAccountingSection = formatXeroAccountingContext(context);
  const whatsappSection = formatWhatsappContext(context);
  const recruitingSection = formatRecruitingContext(context);
  const intelligenceSection = formatIntelligenceContext(context);
  const memorySection = formatMemoryContext(context);
  const recommendationsSection = formatRecommendationsContext(context);
  const analyticsSection = formatAnalyticsContext(context);
  const mobileSection = formatMobileContext(context);
  const orchestrationSection = formatOrchestrationContext(context);
  const salesSection = formatSalesContext(context);
  const marketingSection = formatMarketingContext(context);
  const leadsSection = formatLeadsContext(context);
  const voiceSection = formatVoiceContext(context);
  const customerSupportSection = formatCustomerSupportContext(context);
  const workforceSection = formatWorkforceContext(context);
  const procurementSection = formatProcurementContext(context);
  const executiveSection = formatExecutiveContext(context);

  const connectedModules = [
    crmSection ? 'CRM' : null,
    jobsSection ? 'Jobs' : null,
    schedulingSection ? 'Scheduling' : null,
    financeSection ? 'Finance' : null,
    financeIntelligenceSection ? 'Finance Intelligence' : null,
    knowledgeSection ? 'Knowledge & Learning' : null,
    businessIntelligenceSection ? 'Business Intelligence' : null,
    inventorySection ? 'Inventory' : null,
    fleetSection ? 'Fleet' : null,
    communicationsSection ? 'Communications' : null,
    documentsSection ? 'Documents' : null,
    automationSection ? 'Automation' : null,
    agentsSection ? 'AURA Agents' : null,
    tenantCapabilitiesSection ? 'Tenant capabilities' : null,
    portalSection ? 'Customer Portal' : null,
    customerPortalExperienceSection ? 'Customer Portal Experience' : null,
    mobileWorkforceExperienceSection ? 'Mobile Workforce Experience' : null,
    qualityAssuranceSection ? 'Quality Assurance & Comeback Intelligence' : null,
    communicationsIntelligenceSection ? 'Voice & Communications Intelligence' : null,
    assetEquipmentSection ? 'Asset, Equipment & Maintenance Intelligence' : null,
    aiOrchestrationSection ? 'AI Orchestration & Multi-Model Intelligence' : null,
    dispatchIntelligenceSection ? 'AI Receptionist, Call Centre & Intelligent Dispatch' : null,
    fleetIntelligenceSection ? 'Fleet Intelligence & GPS Analytics' : null,
    personalCommunicationsSection ? 'Personal Communications Intelligence & WhatsApp Business Assistant' : null,
    securitySection ? 'Enterprise Security, Zero-Trust & Compliance Platform' : null,
    integrationPlatformSection ? 'Enterprise Integration Hub, API Gateway & Universal Connector Platform' : null,
    enterpriseAnalyticsSection ? 'Enterprise Analytics, Data Warehouse & Business Intelligence Platform' : null,
    enterpriseAutomationStudioSection
      ? 'Enterprise Automation Studio, Workflow Designer & AI Process Orchestration Platform'
      : null,
    enterpriseDigitalTwinSection
      ? 'Enterprise Digital Twin, Operational Simulation & Decision Intelligence Platform'
      : null,
    enterpriseKnowledgeGraphSection
      ? 'Enterprise Knowledge Graph, Semantic Search & Organizational Memory Platform'
      : null,
    enterpriseMissionControlSection
      ? 'Enterprise Command Center, Mission Control & Executive Operations Platform'
      : null,
    enterpriseEvolutionSection
      ? 'Enterprise Autonomous Optimization, Continuous Learning & Evolution Platform'
      : null,
    enterpriseDeveloperPlatformSection
      ? 'Enterprise Developer Platform, Extension Marketplace & SDK Ecosystem'
      : null,
    enterpriseSaasPlatformSection
      ? 'Enterprise White-Label, Multi-Tenant SaaS & Subscription Platform'
      : null,
    documentAiSection
      ? 'Enterprise Document AI, OCR & Intelligent Document Processing Platform'
      : null,
    businessContinuitySection
      ? 'Enterprise Backup, Disaster Recovery & Business Continuity Platform'
      : null,
    searchIntelligenceSection
      ? 'Enterprise Global Search, Universal Timeline & Cross-Module Activity Intelligence'
      : null,
    migrationIntelligenceSection
      ? 'Enterprise Data Import, Export & Migration Platform'
      : null,
    integrationHubSection ? 'Integration Hub' : null,
    integrationApiManagementSection ? 'Integration API Management' : null,
    xeroAccountingSection ? 'Xero Accounting' : null,
    whatsappSection ? 'WhatsApp' : null,
    recruitingSection ? 'Recruiting' : null,
    intelligenceSection ? 'Intelligence' : null,
    analyticsSection ? 'Analytics' : null,
    mobileSection ? 'Mobile' : null,
    orchestrationSection ? 'Agent Orchestration' : null,
    salesSection ? 'Sales Intelligence' : null,
    marketingSection ? 'Marketing Intelligence' : null,
    leadsSection ? 'Lead Generation' : null,
    voiceSection ? 'Voice Receptionist' : null,
    customerSupportSection ? 'Customer Support' : null,
    workforceSection ? 'Workforce Intelligence' : null,
    procurementSection ? 'Procurement Intelligence' : null,
    executiveSection ? 'Executive Command' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const moduleGuidance = connectedModules
    ? `${connectedModules} ${connectedModules.includes(',') ? 'are' : 'is'} connected. Use only the business data provided below — never invent customers, jobs, schedules, quotes, invoices, payments, products, stock levels, vehicles, GPS coordinates, communications, documents, workflows, agent profiles, portal users, or metrics. ` +
      `If Cartrack is disconnected, do not invent live GPS locations. ` +
      `Document records include metadata only — do not claim to read file contents, perform OCR, or run AI document processing unless that capability is explicitly listed. ` +
      `When automation context shows engineActive, workflows execute on business events via the TITAN automation engine. Actions that send messages or modify financial/customer/job data create approval drafts — never claim messages were sent or records were changed without explicit approval. AURA may propose workflow drafts for user review in /automation. ` +
      `When Intelligence context is present, AURA acts as a business intelligence command centre — use the greeting, KPIs, and recommendations shown below. Propose actions but never execute mutating changes without approval. Company memory records are saved business rules — follow them when relevant. ` +
      `When Analytics context is present, use only the real performance metrics shown below for revenue, jobs, customers, and outstanding balances. For profitability, technician workload, and detailed reports, explain that users can view /analytics or ask you to load analytics tools. Never invent metrics or scores. ` +
      `When Mobile context is present, AURA is assisting a mobile user in owner, technician, or customer mode — use only the mobile summary and details shown below. For owners, provide business updates from real data. For technicians, answer schedule and next-job questions from assigned job data only. For customers, explain repair status from their job records only. Never invent mobile actions or claim uploads, messages, or payments were completed without confirmation. ` +
      `When Agent Orchestration context is present, use only the active orchestration, run, and approval counts shown below. Multi-agent workflows coordinate specialist agents sequentially or in parallel — steps requiring approval pause until a human approves. Never claim orchestrations ran, agents collaborated, or approvals were granted without confirmation. Users can manage orchestrations and review the approval queue in agent orchestration settings. ` +
      `When Sales Intelligence context is present, use only the real opportunity, pipeline, and detected signal data shown below. The Sales Agent analyzes customers, quotes, jobs, and communications to identify revenue opportunities — never invent leads, opportunities, or conversion probabilities. Quote assistance and follow-up drafts require explicit user approval before sending or executing. ` +
      `When Marketing Intelligence context is present, use only the real segment, campaign, recommendation, and content suggestion data shown below. The Marketing Agent analyzes customer engagement, service history, and value segments — never invent campaigns, audiences, or performance metrics. All marketing drafts and communications require explicit user approval before publishing or sending. ` +
      `When Lead Generation context is present, use only the real lead, pipeline, score, and acquisition insight data shown below. The Lead Generation Agent identifies and qualifies opportunities from CRM, job, quote, and communication history — never invent leads, sources, or scores. Follow-up drafts and sales handoffs require explicit user approval before contacting leads or creating opportunities. ` +
      `When Voice Receptionist context is present, use only the real voice session, call history, follow-up, and enquiry data shown below. The Voice Receptionist Agent assists with customer enquiries and qualification from recorded sessions — never invent calls, callers, or appointments. Follow-up drafts, lead drafts, notes, and booking requests require explicit user approval before execution. No autonomous phone calls. ` +
      `When Customer Support context is present, use only the real support conversation, escalation, and feedback data shown below. The Customer Support Agent assists customers using authorised job, invoice, quote, and portal data — never invent tickets, promises, refunds, or resolutions. All customer responses and updates require explicit user approval before sending. Escalate to humans when needed. ` +
      `When Workforce Intelligence context is present, use only the real candidate pipeline, skill gap, staffing insight, and recommendation data shown below. The Workforce Intelligence Agent analyzes hiring, technician performance, and capacity — never invent candidates, employees, skills, or performance records. All recruitment communications, interview requests, hiring recommendations, and training plans require explicit user approval before execution. No autonomous hiring or employment decisions. ` +
      `When Procurement Intelligence context is present, use only the real stock signal, supplier insight, purchase order, and recommendation data shown below. The Procurement Intelligence Agent analyzes inventory and purchasing needs — never invent products, suppliers, purchase orders, or stock levels. All purchase order drafts and procurement actions require explicit user approval before execution. No autonomous ordering or stock modifications. ` +
      `When Executive Command context is present, use only the real business health score, alert, recommendation, and summary data shown below. The Executive Command Agent analyzes company-wide performance across finance, operations, sales, workforce, and procurement — never invent KPIs, dashboards, or metrics. All executive action drafts require explicit user approval before execution. No autonomous financial decisions, pricing changes, or business modifications. ` +
      `When Finance Intelligence context is present, use only the real cash flow, profitability, receivables, expense, budget, forecast, and risk data shown below. The Finance Controller Agent analyzes invoices, payments, jobs, and procurement data — never invent financial records, balances, or forecasts. All finance action drafts and recommendations require explicit user approval before execution. No automatic payments, refunds, reminders, or accounting changes. ` +
      `When Knowledge & Learning context is present, use only user-created knowledge articles, SOPs, training courses, and policies shown below — never invent documentation, SOPs, training material, or policies. All knowledge article drafts require explicit user approval before publish. No autonomous knowledge publishing. Permission-aware search applies to restricted content. ` +
      `When Business Intelligence context is present, use only the real KPI, dashboard, report metadata, insight, and forecast data shown below — never invent analytics, KPIs, dashboards, reports, or predictions. Business reports follow Draft → Approval → Generate; no autonomous report generation. Insights and forecasts are generated only on explicit API requests from historical tenant data. ` +
      `Agent profiles and operational agents can analyze business data, score candidates, and draft recommendations — never claim agents run autonomously, hire candidates, send messages, or modify records without explicit user approval. ` +
      `Customer portal records describe provisioned portal users and access permissions only — do not claim payment gateways, WhatsApp bots, AI customer support agents, marketing automation, or document uploads are connected unless that capability is explicitly listed. ` +
      `Integration hub records describe provider registry entries, connection status, sync job history, and webhook endpoint metadata only — do not claim marketing integrations, full webhook automation, autonomous agents, or recruiting automation are connected unless that capability is explicitly listed. ` +
      `When WhatsApp context is present, use conversation history and draft messages shown below. Never claim a WhatsApp message was sent unless delivery status confirms it — always offer to draft a message for user approval first. ` +
      `Connected business integrations (Xero, Email SMTP, Yoco) provide live connection verification and organisation/business metadata only — do not claim full invoice sync, payment processing flows, or automated email delivery are active unless that capability is explicitly listed. ` +
      `When Xero Accounting context is present, use only synced invoice, customer, quote, and payment records shown below — never invent accounting balances, unpaid invoices, or customer debts. ` +
      `If asked about marketing automation, voice AI, autonomous agents, recruiting automation, or modules not listed here, explain they are not connected yet.`
    : `You do not have access to CRM, jobs, finance, inventory, fleet, or other business modules yet. ` +
      `Do not invent customer names, job records, invoices, products, vehicles, or metrics. ` +
      `If asked for business data not in the profile, explain that those modules are not connected yet.`;

  return (
    `${AURA_SYSTEM_PROMPT}\n\n` +
    `You are assisting users inside the TITAN workspace for this company only. ` +
    `Always treat the company below as the active tenant context.\n\n` +
    `Company profile:\n${profileLines.join('\n')}\n\n` +
    (crmSection ? `CRM context:\n${crmSection}\n\n` : '') +
    (jobsSection ? `Jobs context:\n${jobsSection}\n\n` : '') +
    (schedulingSection ? `Scheduling context:\n${schedulingSection}\n\n` : '') +
    (financeSection ? `Finance context:\n${financeSection}\n\n` : '') +
    (financeIntelligenceSection ? `Finance intelligence:\n${financeIntelligenceSection}\n\n` : '') +
    (knowledgeSection ? `Knowledge & learning:\n${knowledgeSection}\n\n` : '') +
    (businessIntelligenceSection ? `Business intelligence:\n${businessIntelligenceSection}\n\n` : '') +
    (inventorySection ? `Inventory context:\n${inventorySection}\n\n` : '') +
    (fleetSection ? `Fleet context:\n${fleetSection}\n\n` : '') +
    (communicationsSection ? `Communications context:\n${communicationsSection}\n\n` : '') +
    (documentsSection ? `Documents context:\n${documentsSection}\n\n` : '') +
    (automationSection ? `Automation context:\n${automationSection}\n\n` : '') +
    (agentsSection ? `AURA Agents context:\n${agentsSection}\n\n` : '') +
    (tenantCapabilitiesSection
      ? `Tenant capabilities context:\n${tenantCapabilitiesSection}\n\n`
      : '') +
    (portalSection ? `Customer Portal context:\n${portalSection}\n\n` : '') +
    (customerPortalExperienceSection
      ? `Customer Portal experience:\n${customerPortalExperienceSection}\n\n`
      : '') +
    (mobileWorkforceExperienceSection
      ? `Mobile Workforce experience:\n${mobileWorkforceExperienceSection}\n\n`
      : '') +
    (qualityAssuranceSection ? `Quality assurance:\n${qualityAssuranceSection}\n\n` : '') +
    (communicationsIntelligenceSection
      ? `Communications intelligence:\n${communicationsIntelligenceSection}\n\n`
      : '') +
    (assetEquipmentSection ? `Asset & equipment intelligence:\n${assetEquipmentSection}\n\n` : '') +
    (aiOrchestrationSection ? `AI orchestration & multi-model intelligence:\n${aiOrchestrationSection}\n\n` : '') +
    (dispatchIntelligenceSection ? `Dispatch & call centre intelligence:\n${dispatchIntelligenceSection}\n\n` : '') +
    (fleetIntelligenceSection ? `Fleet intelligence & GPS analytics:\n${fleetIntelligenceSection}\n\n` : '') +
    (personalCommunicationsSection
      ? `Personal communications intelligence:\n${personalCommunicationsSection}\n\n`
      : '') +
    (securitySection ? `Enterprise security:\n${securitySection}\n\n` : '') +
    (integrationPlatformSection
      ? `Enterprise integration platform:\n${integrationPlatformSection}\n\n`
      : '') +
    (enterpriseAnalyticsSection
      ? `Enterprise analytics platform:\n${enterpriseAnalyticsSection}\n\n`
      : '') +
    (enterpriseAutomationStudioSection
      ? `Enterprise automation studio:\n${enterpriseAutomationStudioSection}\n\n`
      : '') +
    (enterpriseDigitalTwinSection
      ? `Enterprise digital twin:\n${enterpriseDigitalTwinSection}\n\n`
      : '') +
    (enterpriseKnowledgeGraphSection
      ? `Enterprise knowledge graph:\n${enterpriseKnowledgeGraphSection}\n\n`
      : '') +
    (enterpriseMissionControlSection
      ? `Enterprise mission control:\n${enterpriseMissionControlSection}\n\n`
      : '') +
    (enterpriseEvolutionSection
      ? `Enterprise evolution platform:\n${enterpriseEvolutionSection}\n\n`
      : '') +
    (enterpriseDeveloperPlatformSection
      ? `Enterprise developer platform:\n${enterpriseDeveloperPlatformSection}\n\n`
      : '') +
    (enterpriseSaasPlatformSection
      ? `Enterprise SaaS platform:\n${enterpriseSaasPlatformSection}\n\n`
      : '') +
    (documentAiSection ? `Enterprise document AI:\n${documentAiSection}\n\n` : '') +
    (businessContinuitySection
      ? `Enterprise business continuity:\n${businessContinuitySection}\n\n`
      : '') +
    (searchIntelligenceSection
      ? `Enterprise global search:\n${searchIntelligenceSection}\n\n`
      : '') +
    (migrationIntelligenceSection
      ? `Enterprise data migration:\n${migrationIntelligenceSection}\n\n`
      : '') +
    (notificationIntelligenceSection
      ? `Enterprise notification center:\n${notificationIntelligenceSection}\n\n`
      : '') +
    (platformHealthSection
      ? `Enterprise platform health:\n${platformHealthSection}\n\n`
      : '') +
    (launchReadinessSection
      ? `Enterprise launch readiness:\n${launchReadinessSection}\n\n`
      : '') +
    (releaseCandidateSection
      ? `Enterprise release candidate:\n${releaseCandidateSection}\n\n`
      : '') +
    (productionLaunchSection
      ? `Enterprise production launch:\n${productionLaunchSection}\n\n`
      : '') +
    (releaseManagementSection
      ? `Enterprise release management:\n${releaseManagementSection}\n\n`
      : '') +
    (integrationHubSection ? `Integration Hub context:\n${integrationHubSection}\n\n` : '') +
    (integrationApiManagementSection
      ? `Integration API Management context:\n${integrationApiManagementSection}\n\n`
      : '') +
    (xeroAccountingSection ? `Xero Accounting context:\n${xeroAccountingSection}\n\n` : '') +
    (whatsappSection ? `WhatsApp context:\n${whatsappSection}\n\n` : '') +
    (recruitingSection ? `Recruiting context:\n${recruitingSection}\n\n` : '') +
    (intelligenceSection ? `Business intelligence:\n${intelligenceSection}\n\n` : '') +
    (memorySection ? `Company memory:\n${memorySection}\n\n` : '') +
    (recommendationsSection ? `Recommendations:\n${recommendationsSection}\n\n` : '') +
    (analyticsSection ? `Analytics:\n${analyticsSection}\n\n` : '') +
    (mobileSection ? `Mobile context:\n${mobileSection}\n\n` : '') +
    (orchestrationSection ? `Agent orchestration:\n${orchestrationSection}\n\n` : '') +
    (salesSection ? `Sales intelligence:\n${salesSection}\n\n` : '') +
    (marketingSection ? `Marketing intelligence:\n${marketingSection}\n\n` : '') +
    (leadsSection ? `Lead generation:\n${leadsSection}\n\n` : '') +
    (voiceSection ? `Voice receptionist:\n${voiceSection}\n\n` : '') +
    (customerSupportSection ? `Customer support:\n${customerSupportSection}\n\n` : '') +
    (workforceSection ? `Workforce intelligence:\n${workforceSection}\n\n` : '') +
    (procurementSection ? `Procurement intelligence:\n${procurementSection}\n\n` : '') +
    (executiveSection ? `Executive command:\n${executiveSection}\n\n` : '') +
    `${moduleGuidance} ` +
    `Use the company profile above to tailor your tone and guidance.`
  );
}
