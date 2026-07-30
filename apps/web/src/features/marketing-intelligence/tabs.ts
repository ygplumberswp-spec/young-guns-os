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
    tabs: [{ id: 'strategy', label: 'Strategy' }],
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    tabs: [{ id: 'campaigns', label: 'Campaigns' }],
  },
  {
    id: 'content',
    label: 'Content',
    tabs: [{ id: 'content', label: 'Content' }],
  },
  {
    id: 'channels',
    label: 'Channels',
    tabs: [{ id: 'social', label: 'Channels' }],
  },
  {
    id: 'audiences',
    label: 'Audiences',
    tabs: [{ id: 'audiences', label: 'Audiences' }],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    tabs: [{ id: 'roi', label: 'Analytics' }],
  },
];

export const MARKETING_INTELLIGENCE_ADVANCED_TAB_GROUPS: TabGroup[] = [
  {
    id: 'administration',
    label: 'Administration',
    tabs: [
      { id: 'calendar', label: 'Calendar' },
      { id: 'market', label: 'Market Intelligence' },
      { id: 'experiments', label: 'Experiments' },
      { id: 'brand', label: 'Brand' },
      { id: 'assets', label: 'Assets' },
      { id: 'listening', label: 'Social Listening' },
      { id: 'reviews', label: 'Reviews' },
      { id: 'advertising', label: 'Advertising' },
      { id: 'email', label: 'Email' },
      { id: 'messaging', label: 'Messaging' },
      { id: 'website', label: 'Website' },
      { id: 'seo', label: 'SEO' },
      { id: 'journeys', label: 'Journeys' },
      { id: 'leads', label: 'Lead Generation' },
      { id: 'attribution', label: 'Attribution' },
      { id: 'growth', label: 'Growth' },
      { id: 'referrals', label: 'Referrals' },
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
