import type { TabGroup } from '@titan/ui';

export const SALES_INTELLIGENCE_TAB_GROUPS: TabGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    tabs: [{ id: 'overview', label: 'Overview' }],
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    tabs: [{ id: 'opportunities', label: 'Pipeline' }],
  },
  {
    id: 'leads',
    label: 'Leads',
    tabs: [{ id: 'leads', label: 'Leads' }],
  },
  {
    id: 'quotes',
    label: 'Quotes',
    tabs: [{ id: 'quotes', label: 'Quotes' }],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    tabs: [{ id: 'accounts', label: 'Accounts' }],
  },
  {
    id: 'forecast',
    label: 'Forecast',
    tabs: [{ id: 'forecasts', label: 'Forecast' }],
  },
  {
    id: 'recommendations',
    label: 'Recommendations',
    tabs: [{ id: 'assistant', label: 'Recommendations' }],
  },
];

export const SALES_INTELLIGENCE_ADVANCED_TAB_GROUPS: TabGroup[] = [
  {
    id: 'administration',
    label: 'Administration',
    tabs: [
      { id: 'pipelines', label: 'Pipelines' },
      { id: 'activities', label: 'Activities' },
      { id: 'renewals', label: 'Renewals' },
      { id: 'pricing', label: 'Pricing' },
      { id: 'commissions', label: 'Commissions' },
      { id: 'targets', label: 'Targets' },
      { id: 'leakage', label: 'Revenue Leakage' },
      { id: 'growth', label: 'Customer Growth' },
      { id: 'retention', label: 'Retention' },
      { id: 'marketing', label: 'Marketing Attribution' },
      { id: 'partners', label: 'Partners' },
      { id: 'tenders', label: 'Tenders' },
      { id: 'winloss', label: 'Win/Loss' },
      { id: 'alerts', label: 'Alerts' },
      { id: 'providers', label: 'Providers' },
      { id: 'settings', label: 'Settings' },
    ],
  },
];

export type SalesIntelligenceTab =
  | 'overview'
  | 'leads'
  | 'opportunities'
  | 'pipelines'
  | 'activities'
  | 'quotes'
  | 'forecasts'
  | 'accounts'
  | 'renewals'
  | 'growth'
  | 'retention'
  | 'pricing'
  | 'commissions'
  | 'targets'
  | 'leakage'
  | 'marketing'
  | 'partners'
  | 'tenders'
  | 'winloss'
  | 'alerts'
  | 'providers'
  | 'settings'
  | 'assistant';
