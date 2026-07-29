export type AuraMessageRole = 'user' | 'assistant' | 'system';

export type AuraChatMessage = {
  role: AuraMessageRole;
  content: string;
};

export type AuraGenerateContext = {
  companyId: string;
  companyName: string;
  userName: string;
  industry: string | null;
  businessType: string | null;
  preferences: {
    timezone?: string;
    currency?: string;
    locale?: string;
    aiTone?: 'professional' | 'friendly' | 'concise';
    notes?: string;
  };
  crm?: {
    customerCount: number;
    customers: Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      status: string;
    }>;
    focusedCustomer: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      status: string;
      notes: string | null;
      recentActivities: Array<{
        content: string;
        authorName: string;
        createdAt: string;
      }>;
    } | null;
  };
  jobs?: {
    totalCount: number;
    activeCount: number;
    jobs: Array<{
      id: string;
      title: string;
      status: string;
      customerId: string;
      customerName: string;
      scheduledAt: string | null;
      scheduledEndAt: string | null;
      assignedUserId: string | null;
      assignedUserName: string | null;
    }>;
    focusedJob: {
      id: string;
      title: string;
      status: string;
      description: string | null;
      notes: string | null;
      scheduledAt: string | null;
      scheduledEndAt: string | null;
      customerId: string;
      customerName: string;
      assignedUserId: string | null;
      assignedUserName: string | null;
    } | null;
  };
  scheduling?: {
    scheduledCount: number;
    upcomingEvents: Array<{
      id: string;
      title: string;
      status: string;
      customerName: string;
      scheduledAt: string;
      scheduledEndAt: string | null;
      assignedUserName: string | null;
    }>;
    assigneeWorkload: Array<{
      userId: string;
      userName: string;
      scheduledJobCount: number;
    }>;
  };
  finance?: {
    openQuoteCount: number;
    revenueMtdCents: number;
    currency: string;
    quoteCount: number;
    invoiceCount: number;
    paymentCount: number;
    recentQuotes: Array<{
      quoteNumber: string;
      title: string;
      status: string;
      customerName: string;
      amountCents: number;
      currency: string;
    }>;
    recentInvoices: Array<{
      invoiceNumber: string;
      title: string;
      status: string;
      customerName: string;
      amountCents: number;
      amountPaidCents: number;
      currency: string;
    }>;
    recentPayments: Array<{
      invoiceNumber: string;
      customerName: string;
      amountCents: number;
      currency: string;
      paidAt: string;
    }>;
  };
  inventory?: {
    itemCount: number;
    locationCount: number;
    lowStockCount: number;
    totalUnitsOnHand: number;
    locations: Array<{
      name: string;
      code: string | null;
      isDefault: boolean;
    }>;
    items: Array<{
      sku: string;
      name: string;
      status: string;
      unit: string;
      reorderLevel: number;
      totalQuantityOnHand: number;
      isLowStock: boolean;
    }>;
    stockLevels: Array<{
      itemSku: string;
      itemName: string;
      locationName: string;
      quantityOnHand: number;
      isLowStock: boolean;
    }>;
  };
  fleet?: {
    totalCount: number;
    availableCount: number;
    inUseCount: number;
    maintenanceCount: number;
    assignedCount: number;
    vehicles: Array<{
      name: string;
      licensePlate: string;
      status: string;
      make: string | null;
      model: string | null;
      assignedUserName: string | null;
    }>;
    focusedVehicle: {
      name: string;
      licensePlate: string;
      status: string;
      make: string | null;
      model: string | null;
      year: number | null;
      vin: string | null;
      assignedUserName: string | null;
      notes: string | null;
    } | null;
    tracking?: {
      cartrackStatus: string;
      cartrackConnected: boolean;
      mappedVehicleCount: number;
      unmappedVehicleCount: number;
      positionCount: number;
      lastSyncAt: string | null;
      latestPositions: Array<{
        vehicleName: string | null;
        licensePlate: string | null;
        latitude: number;
        longitude: number;
        speedKmh: number | null;
        recordedAt: string;
      }>;
    };
  };
  communications?: {
    messageCount: number;
    templateCount: number;
    recentMessages: Array<{
      customerName: string;
      channel: string;
      direction: string;
      subject: string | null;
      bodyPreview: string;
      authorName: string;
      occurredAt: string;
    }>;
    templates: Array<{
      name: string;
      channel: string;
    }>;
    focusedCustomerMessages: Array<{
      channel: string;
      direction: string;
      subject: string | null;
      bodyPreview: string;
      authorName: string;
      occurredAt: string;
    }> | null;
  };
  documents?: {
    documentCount: number;
    categoryCount: number;
    categories: Array<{
      name: string;
      documentCount: number;
    }>;
    recentDocuments: Array<{
      title: string;
      fileName: string;
      fileType: string | null;
      categoryName: string | null;
      customerName: string | null;
      jobTitle: string | null;
      uploadedByName: string;
      createdAt: string;
    }>;
    focusedCustomerDocuments: Array<{
      title: string;
      fileName: string;
      categoryName: string | null;
      uploadedByName: string;
      createdAt: string;
    }> | null;
    focusedJobDocuments: Array<{
      title: string;
      fileName: string;
      categoryName: string | null;
      uploadedByName: string;
      createdAt: string;
    }> | null;
  };
  automation?: {
    workflowCount: number;
    activeWorkflowCount: number;
    executionCount: number;
    runCount: number;
    pendingApprovalCount: number;
    engineActive: boolean;
    availableTriggers: string[];
    availableActions: string[];
    workflows: Array<{
      name: string;
      status: string;
      triggerCount: number;
      actionCount: number;
      triggers: string[];
      actions: string[];
    }>;
    recentExecutions: Array<{
      workflowName: string | null;
      triggerType: string;
      status: string;
      startedAt: string;
      errorMessage: string | null;
    }>;
    focusedWorkflow: {
      name: string;
      status: string;
      description: string | null;
      triggers: string[];
      actions: string[];
      recentExecutions: Array<{
        triggerType: string;
        status: string;
        startedAt: string;
        errorMessage: string | null;
      }>;
    } | null;
  };
  agents?: {
    availableAgentCount: number;
    configuredProfileCount: number;
    activeProfileCount: number;
    executionCount: number;
    registry: Array<{
      agentKey: string;
      name: string;
      configured: boolean;
      foundationOnly: boolean;
    }>;
    profiles: Array<{
      name: string;
      agentKey: string;
      status: string;
      permissionCount: number;
      enabledToolCount: number;
    }>;
    recentExecutions: Array<{
      agentProfileName: string | null;
      agentKey: string | null;
      status: string;
      executionMode: string;
      startedAt: string;
      errorMessage: string | null;
    }>;
    focusedProfile: {
      name: string;
      agentKey: string;
      status: string;
      description: string | null;
      permissions: string[];
      enabledTools: string[];
      foundationOnly: boolean;
    } | null;
  };
  portal?: {
    portalUserCount: number;
    activePortalUserCount: number;
    linkedCustomerCount: number;
    portalUsers: Array<{
      customerName: string;
      email: string;
      isActive: boolean;
      permissionCount: number;
    }>;
    accessPermissions: string[];
  };
  customerPortalExperience?: {
    customerName: string;
    activeJobCount: number;
    pendingQuoteCount: number;
    outstandingInvoiceCount: number;
    outstandingBalanceCents: number;
    unreadNotificationCount: number;
    upcomingAppointmentCount: number;
    recentRequests: Array<{
      requestType: string;
      status: string;
      subject: string;
      createdAt: string;
    }>;
  };
  mobileWorkforceExperience?: {
    summary: string;
    assignedJobCount: number;
    nextJobTitle: string | null;
    routeStopCount: number;
    pendingRequestCount: number;
    inventoryAlertCount: number;
    unreadNotificationCount: number;
    cartrackConnected: boolean;
  };
  qualityAssurance?: {
    summary: string;
    openComebackCount: number;
    openWarrantyCount: number;
    firstTimeFixRatePercent: number | null;
    totalQualityCostCents: number;
    currency: string;
    pendingActionCount: number;
    topRootCause: string | null;
  };
  communicationsIntelligence?: {
    summary: string;
    totalCommunications: number;
    missedCallCount: number;
    pendingDraftCount: number;
    openSupportCount: number;
    whatsappMessageCount: number;
    topChannel: string | null;
  };
  assetEquipment?: {
    summary: string;
    totalAssets: number;
    activeAssetCount: number;
    pendingMaintenanceCount: number;
    overdueInspectionCount: number;
    expiringCalibrationCount: number;
    pendingActionCount: number;
    totalMaintenanceCostCents: number;
    currency: string;
  };
  aiOrchestration?: {
    summary: string;
    providerCount: number;
    healthyProviderCount: number;
    pendingActionCount: number;
    totalCostCents: number;
    evaluationCount: number;
    routingRuleCount: number;
  };
  dispatchIntelligence?: {
    summary: string;
    liveQueueCount: number;
    pendingCallbackCount: number;
    pendingActionCount: number;
    emergencyAssessmentCount: number;
    scheduledJobCount: number;
  };
  fleetIntelligence?: {
    summary: string;
    totalVehicles: number;
    activeVehicles: number;
    totalKilometres: number;
    totalOperatingCostCents: number;
    pendingActionCount: number;
    cartrackConnected: boolean;
  };
  personalCommunications?: {
    summary: string;
    totalBusinessConversations: number;
    pendingFollowUpCount: number;
    pendingActionCount: number;
    newLeadsDetected: number;
    whatsappConnected: boolean;
  };
  security?: {
    summary: string;
    securityScore: number | null;
    activeSessionCount: number;
    riskAlertCount: number;
    pendingActionCount: number;
    failedLoginCount24h: number;
  };
  integrationPlatform?: {
    summary: string;
    connectedServiceCount: number;
    errorServiceCount: number;
    activeSyncJobCount: number;
    failedRequestCount24h: number;
    pendingActionCount: number;
  };
  enterpriseAnalytics?: {
    summary: string;
    activeKpiCount: number;
    pendingInsightCount: number;
    pendingActionCount: number;
    moduleCount: number;
    snapshotCount: number;
  };
  enterpriseAutomationStudio?: {
    summary: string;
    workflowCount: number;
    activeWorkflowCount: number;
    pendingApprovalCount: number;
    failedRunCount: number;
    recommendationCount: number;
  };
  integrationHub?: {
    providerCount: number;
    configuredConnectionCount: number;
    connectedCount: number;
    errorCount: number;
    syncJobCount: number;
    webhookEndpointCount: number;
    webhookEventCount: number;
    providers: Array<{
      name: string;
      provider: string;
      connectionStatus: string;
      isConfigured: boolean;
      lastSyncAt: string | null;
    }>;
    recentSyncJobs: Array<{
      provider: string;
      status: string;
      startedAt: string;
      errorMessage: string | null;
    }>;
  };
  integrationApiManagement?: {
    registryCount: number;
    enabledCount: number;
    connectedCount: number;
    unhealthyCount: number;
    pendingWebhookDeliveries: number;
    developerApiKeyCount: number;
    providers: Array<{
      name: string;
      provider: string;
      enabled: boolean;
      healthStatus: string;
      connectionStatus: string;
      lastSyncAt: string | null;
    }>;
    recentHealth: Array<{
      provider: string;
      healthStatus: string;
      summary: string;
      checkedAt: string;
    }>;
  };
  xeroAccounting?: {
    connected: boolean;
    organisationName: string | null;
    baseCurrency: string | null;
    syncedCustomerCount: number;
    syncedInvoiceCount: number;
    syncedQuoteCount: number;
    syncedPaymentCount: number;
    outstandingAmountCents: number;
    unpaidInvoiceCount: number;
    customersWithOutstandingCount: number;
    currency: string;
    unpaidInvoices: Array<{
      invoiceNumber: string;
      customerName: string;
      amountCents: number;
      amountPaidCents: number;
      amountDueCents: number;
      status: string;
      dueDate: string | null;
    }>;
    customersOwing: Array<{
      customerName: string;
      outstandingAmountCents: number;
      unpaidInvoiceCount: number;
    }>;
  };
  whatsapp?: {
    connectionStatus: string;
    isConnected: boolean;
    displayPhoneNumber: string | null;
    messageCount: number;
    incomingCount: number;
    outgoingCount: number;
    draftCount: number;
    pendingReplyCount: number;
    templateCount: number;
    recentConversations: Array<{
      customerId: string | null;
      customerName: string | null;
      lastMessagePreview: string;
      direction: string;
      deliveryStatus: string;
      isDraft: boolean;
      occurredAt: string;
    }>;
    pendingReplies: Array<{
      customerId: string | null;
      customerName: string | null;
      messagePreview: string;
      receivedAt: string;
    }>;
    focusedCustomerMessages: Array<{
      direction: string;
      messagePreview: string;
      deliveryStatus: string;
      isDraft: boolean;
      occurredAt: string;
    }> | null;
    automationExamples: string[];
  };
  recruiting?: {
    candidateCount: number;
    applicationCount: number;
    newCount: number;
    interviewCount: number;
    candidates: Array<{
      id: string;
      name: string;
      roleTitle: string | null;
      status: string;
      applicationCount: number;
    }>;
  };
  intelligence?: {
    greeting: { message: string; generatedAt: string };
    todaysJobCount: number;
    upcomingScheduleCount: number;
    outstandingInvoiceCount: number;
    customerFollowUpCount: number;
    pendingApprovalCount: number;
    automationFailureCount: number;
    fleetIssueCount: number;
    lowStockCount: number;
    revenueMtdCents: number;
    currency: string;
  };
  memory?: {
    memoryCount: number;
    memories: Array<{
      category: string;
      information: string;
      importance: number;
    }>;
  };
  recommendations?: {
    count: number;
    items: Array<{
      category: string;
      priority: string;
      title: string;
      description: string;
    }>;
  };
  analytics?: {
    period: 'daily' | 'weekly' | 'monthly';
    revenueCents: number;
    jobCount: number;
    newCustomers: number;
    outstandingCents: number;
    completionRatePercent: number | null;
    summary: string;
  };
  mobile?: {
    role: 'owner' | 'technician' | 'customer';
    summary: string;
    details: Record<string, unknown>;
  };
  orchestration?: {
    activeOrchestrationCount: number;
    activeRunCount: number;
    pendingApprovalCount: number;
    recentRuns: Array<{
      id: string;
      orchestrationName: string | null;
      status: string;
      triggerEvent: string | null;
      startedAt: string | null;
    }>;
  };
  sales?: {
    openOpportunityCount: number;
    pendingRecommendationCount: number;
    pipelineValueCents: number;
    topOpportunities: Array<{
      id: string;
      title: string;
      customerName: string | null;
      status: string;
      estimatedValueCents: number | null;
    }>;
    detectedSignals: Array<{
      opportunityType: string;
      customerId: string;
      customerName: string;
      title: string;
      description: string;
      priority: string;
    }>;
    summary: string;
  };
  marketing?: {
    activeCampaignCount: number;
    pendingRecommendationCount: number;
    topSegments: Array<{
      segmentKey: string;
      name: string;
      customerCount: number;
      segmentType: string;
    }>;
    topRecommendations: Array<{
      title: string;
      recommendationType: string;
      priority: string;
    }>;
    contentSuggestions: Array<{
      title: string;
      description: string;
      channel: string;
      messagingGuidance: string;
    }>;
    summary: string;
  };
  leads?: {
    activeLeadCount: number;
    qualifiedLeadCount: number;
    pendingRecommendationCount: number;
    averageScore: number;
    topLeads: Array<{
      id: string;
      title: string;
      contactName: string;
      status: string;
      score: number;
    }>;
    acquisitionInsights: Array<{
      insightType: string;
      title: string;
      description: string;
      priority: string;
    }>;
    summary: string;
  };
  voice?: {
    activeSessionCount: number;
    followUpRequiredCount: number;
    pendingFollowUpCount: number;
    recentSessions: Array<{
      id: string;
      callerName: string | null;
      enquiryType: string;
      status: string;
      summary: string | null;
      followUpRequired: boolean;
    }>;
    waitingEnquiries: Array<{
      insightType: string;
      title: string;
      description: string;
      priority: string;
    }>;
    summary: string;
  };
  customerSupport?: {
    openConversationCount: number;
    pendingEscalationCount: number;
    unresolvedConversationCount: number;
    recentConversations: Array<{
      id: string;
      customerName: string | null;
      subject: string;
      status: string;
      channel: string;
    }>;
    attentionInsights: Array<{
      insightType: string;
      title: string;
      description: string;
      priority: string;
    }>;
    summary: string;
  };
  workforce?: {
    candidateCount: number;
    activePipelineCount: number;
    pendingRecommendationCount: number;
    skillGapCount: number;
    pipelineStages: Array<{ status: string; label: string; count: number }>;
    topRecommendations: Array<{ title: string; recommendationType: string; priority: string }>;
    staffingInsights: Array<{
      insightType: string;
      title: string;
      description: string;
      priority: string;
    }>;
    summary: string;
  };
  procurement?: {
    supplierCount: number;
    pendingApprovalCount: number;
    openOrderCount: number;
    lowStockCount: number;
    pendingRecommendationCount: number;
    stockSignals: Array<{
      signalType: string;
      itemSku: string;
      itemName: string;
      quantityOnHand: number;
      priority: string;
      description: string;
    }>;
    supplierInsights: Array<{
      supplierName: string;
      insightType: string;
      title: string;
      description: string;
      priority: string;
    }>;
    topRecommendations: Array<{ title: string; recommendationType: string; priority: string }>;
    summary: string;
  };
  executive?: {
    healthScore: number | null;
    healthTrend: string;
    pendingAlertCount: number;
    pendingRecommendationCount: number;
    topAlerts: Array<{ title: string; alertType: string; priority: string }>;
    topRecommendations: Array<{ title: string; recommendationType: string; priority: string }>;
    businessSummary: {
      period: string;
      headline: string;
      revenueCents: number;
      currency: string;
      revenueChangePercent: number | null;
      activeJobs: number;
      completedJobs: number;
      outstandingInvoiceCents: number;
      lowStockCount: number;
      pendingAlertCount: number;
      healthScore: number | null;
      highlights: string[];
    };
    summary: string;
  };
  financeIntelligence?: {
    cashFlow: {
      currentPositionCents: number;
      inflowCents: number;
      outflowCents: number;
      outstandingReceivableCents: number;
      outstandingPayableCents: number;
      weeklyForecastCents: number;
      monthlyForecastCents: number;
      cashShortageWarning: boolean;
      currency: string;
      summary: string;
    };
    profitability: {
      grossMarginPercent: number | null;
      netMarginPercent: number | null;
      totalRevenueCents: number;
      totalProfitCents: number | null;
      currency: string;
      summary: string;
    };
    receivables: {
      overdueCount: number;
      overdueAmountCents: number;
      currency: string;
      summary: string;
    };
    expenses: {
      totalOutflowCents: number;
      supplierSpendingCents: number;
      currency: string;
      summary: string;
    };
    forecast: {
      forecastType: string;
      netPositionCents: number;
      cashShortageWarning: boolean;
      summary: string;
    };
    pendingRecommendationCount: number;
    topRecommendations: Array<{ title: string; recommendationType: string; priority: string }>;
    riskSignals: Array<{ riskType: string; title: string; priority: string; description: string }>;
    summary: string;
  };
  knowledge?: {
    stats: {
      articleCount: number;
      publishedArticleCount: number;
      sopCount: number;
      publishedSopCount: number;
      trainingCourseCount: number;
      activeTrainingCourseCount: number;
      policyCount: number;
      publishedPolicyCount: number;
      pendingRecommendationCount: number;
      expiredCertificationCount: number;
    };
    recentArticles: Array<{ title: string; articleType: string; status: string }>;
    recentSops: Array<{ title: string; department: string | null; status: string }>;
    activeTrainingCourses: Array<{ title: string; contentType: string; skillTags: string[] }>;
    publishedPolicies: Array<{ title: string; policyType: string }>;
    topRecommendations: Array<{ title: string; recommendationType: string; priority: string }>;
    summary: string;
  };
  businessIntelligence?: {
    stats: {
      activeKpiCount: number;
      dashboardCount: number;
      pendingInsightCount: number;
      scheduledReportCount: number;
      latestForecastCount: number;
    };
    topKpis: Array<{ kpiKey: string; name: string; value: number | null; unit: string }>;
    dataLakeModules: Array<{ module: string; recordCount: number; lastActivityAt: string | null }>;
    topInsights: Array<{ title: string; insightType: string; priority: string }>;
    recentForecasts: Array<{ forecastType: string; summary: string }>;
    summary: string;
  };
};

export type AuraGenerateRequest = {
  messages: AuraChatMessage[];
  context: AuraGenerateContext;
};

export interface AuraProvider {
  readonly name: string;
  generate(request: AuraGenerateRequest): Promise<string>;
}

export class AuraProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AuraProviderError';
  }
}
