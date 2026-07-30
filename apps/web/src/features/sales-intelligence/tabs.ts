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
    tabs: [
      { id: 'leads', label: 'Leads' },
      { id: 'opportunities', label: 'Opportunities' },
      { id: 'pipelines', label: 'Pipelines' },
      { id: 'activities', label: 'Activities' },
      { id: 'quotes', label: 'Quotes & Proposals' },
      { id: 'forecasts', label: 'Forecasts' },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    tabs: [
      { id: 'accounts', label: 'Accounts' },
      { id: 'renewals', label: 'Renewals' },
    ],
  },
  {
    id: 'revenue',
    label: 'Revenue',
    tabs: [
      { id: 'pricing', label: 'Pricing & Discounts' },
      { id: 'commissions', label: 'Commissions' },
      { id: 'targets', label: 'Targets' },
      { id: 'leakage', label: 'Revenue Leakage' },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    tabs: [
      { id: 'growth', label: 'Customer Growth' },
      { id: 'retention', label: 'Retention' },
      { id: 'marketing', label: 'Marketing Attribution' },
      { id: 'partners', label: 'Partners & Referrals' },
      { id: 'tenders', label: 'Tenders' },
      { id: 'winloss', label: 'Win/Loss' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    tabs: [
      { id: 'alerts', label: 'Alerts' },
      { id: 'assistant', label: 'AI Assistant' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    tabs: [
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
