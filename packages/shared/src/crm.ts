export type CustomerStatus = 'active' | 'inactive' | 'lead';

export const CUSTOMER_STATUS_OPTIONS: Array<{ value: CustomerStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'lead', label: 'Lead' },
  { value: 'inactive', label: 'Inactive' },
];

export type CustomerSummary = {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  /** Primary property address when one exists */
  primaryAddressDisplay: string | null;
  /** Primary property suburb when known */
  primarySuburb: string | null;
  status: CustomerStatus;
  isSupplierOnly: boolean;
  doNotContact: boolean;
  createdAt: string;
  updatedAt: string;
  /** Most recent job for this customer, when available */
  lastJobAt: string | null;
  lastJobNumber: string | null;
  /** Latest CRM activity note timestamp */
  lastActivityAt: string | null;
  /** Open follow-up action text when scheduled */
  nextAction: string | null;
};

export type CustomerActivity = {
  id: string;
  customerId: string;
  content: string;
  authorName: string;
  createdAt: string;
};

export type CustomerDetail = CustomerSummary & {
  notes: string | null;
  activities: CustomerActivity[];
};

export type CrmStats = {
  customerCount: number;
};

export type CreateCustomerRequest = {
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: CustomerStatus;
  isSupplierOnly?: boolean;
  doNotContact?: boolean;
  notes?: string | null;
};

export type UpdateCustomerRequest = {
  name?: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: CustomerStatus;
  isSupplierOnly?: boolean;
  doNotContact?: boolean;
  notes?: string | null;
};

export type CreateCustomerActivityRequest = {
  content: string;
};

export type AuraFinanceDraftContext = {
  serviceCustomerName: string;
  billingCustomerName: string;
  recipientName: string | null;
  propertyId: string | null;
};

export type AuraPageContext = {
  customerId?: string;
  jobId?: string;
  vehicleId?: string;
  workflowId?: string;
  agentProfileId?: string;
  schedulingView?: boolean;
  mobileRole?: 'owner' | 'technician' | 'customer';
  recordType?: string;
  recordId?: string;
  quoteId?: string;
  invoiceId?: string;
  financeDraft?: AuraFinanceDraftContext;
};
