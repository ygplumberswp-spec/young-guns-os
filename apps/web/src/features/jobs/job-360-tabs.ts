export type Job360TabId =
  | 'overview'
  | 'property-map'
  | 'schedule'
  | 'job-card'
  | 'checklist'
  | 'photos'
  | 'notes'
  | 'materials'
  | 'time'
  | 'quote'
  | 'invoice'
  | 'payment'
  | 'profitability'
  | 'signature'
  | 'coc'
  | 'documents'
  | 'communications'
  | 'activity';

export const JOB_360_TABS: Array<{ id: Job360TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'property-map', label: 'Property Map' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'job-card', label: 'Job Card' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'photos', label: 'Photos' },
  { id: 'notes', label: 'Notes' },
  { id: 'materials', label: 'Materials' },
  { id: 'time', label: 'Time' },
  { id: 'quote', label: 'Quote' },
  { id: 'invoice', label: 'Invoice' },
  { id: 'payment', label: 'Payment' },
  { id: 'profitability', label: 'Profitability' },
  { id: 'signature', label: 'Signature' },
  { id: 'coc', label: 'COC' },
  { id: 'documents', label: 'Documents' },
  { id: 'communications', label: 'Communications' },
  { id: 'activity', label: 'Activity' },
];
