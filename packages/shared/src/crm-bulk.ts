export type BulkEntityResultStatus = 'deleted' | 'archived' | 'updated' | 'skipped' | 'blocked';

export type BulkEntityResult = {
  id: string;
  name: string;
  status: BulkEntityResultStatus;
  reason?: string;
};

export type BulkOperationSummary = {
  deleted: number;
  archived: number;
  updated: number;
  skipped: number;
  blocked: number;
  results: BulkEntityResult[];
};

export type CustomerBulkAction = 'archive' | 'delete' | 'set_status';

export type LeadBulkAction = 'archive' | 'delete' | 'set_status' | 'assign';
