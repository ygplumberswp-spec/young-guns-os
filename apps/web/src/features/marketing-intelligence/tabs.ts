import type { TabGroup } from '@titan/ui';

export const MARKETING_INTELLIGENCE_TAB_GROUPS: TabGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    tabs: [{ id: 'overview', label: 'Overview' }],
  },
  {
    id: 'strategy',
    label: 'Strategy',
    tabs: [
      { id: 'strategy', label: 'Strategy' },
      { id: 'audiences', label: 'Audiences' },
      { id: 'calendar', label: 'Calendar' },
      { id: 'market', label: 'Market Intelligence' },
    ],
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    tabs: [
      { id: 'campaigns', label: 'Campaigns' },
      { id: 'experiments', label: 'Experiments' },
      { id: 'leads', label: 'Lead Generation' },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    tabs: [
      { id: 'content', label: 'Content Studio' },
      { id: 'brand', label: 'Brand' },
      { id: 'assets', label: 'Asset Library' },
    ],
  },
  {
    id: 'channels',
    label: 'Channels',
    tabs: [
      { id: 'social', label: 'Social Media' },
      { id: 'listening', label: 'Social Listening' },
      { id: 'advertising', label: 'Paid Advertising' },
      { id: 'email', label: 'Email' },
      { id: 'messaging', label: 'SMS & WhatsApp' },
      { id: 'website', label: 'Website & Landing Pages' },
      { id: 'seo', label: 'SEO & Local Presence' },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    tabs: [
      { id: 'journeys', label: 'Customer Journeys' },
      { id: 'growth', label: 'Customer Growth' },
      { id: 'referrals', label: 'Referrals & Partners' },
      { id: 'reviews', label: 'Reviews & Reputation' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    tabs: [
      { id: 'attribution', label: 'Attribution' },
      { id: 'roi', label: 'ROI & Profitability' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    tabs: [
      { id: 'alerts', label: 'Alerts' },
      { id: 'providers', label: 'Providers' },
      { id: 'settings', label: 'Settings' },
      { id: 'assistant', label: 'AI Assistant' },
    ],
  },
];

export type MarketingIntelligenceTab =
  | 'overview'
  | 'strategy'
  | 'campaigns'
  | 'calendar'
  | 'audiences'
  | 'content'
  | 'brand'
  | 'assets'
  | 'social'
  | 'listening'
  | 'reviews'
  | 'advertising'
  | 'email'
  | 'messaging'
  | 'website'
  | 'seo'
  | 'journeys'
  | 'leads'
  | 'attribution'
  | 'roi'
  | 'growth'
  | 'referrals'
  | 'experiments'
  | 'market'
  | 'alerts'
  | 'providers'
  | 'settings'
  | 'assistant';
