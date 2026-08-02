import { CompactTabs } from '../../components/ux';

/** Phase 1 settings workspace — accessed via header identity link, not main sidebar. */
const tabs = [
  { href: '/settings/company', label: 'Company', icon: 'Company' },
  { href: '/settings/team', label: 'Team & Access', icon: 'Team & Access' },
  { href: '/settings/billing', label: 'Finance & Pricing', icon: 'Finance & Pricing' },
  { href: '/settings/dashboard', label: 'Jobs & Scheduling', icon: 'Jobs & Scheduling' },
  { href: '/settings/cartrack', label: 'Fleet', icon: 'Fleet' },
  { href: '/inventory/products', label: 'Inventory', icon: 'Inventory' },
  { href: '/settings/notifications', label: 'Communications', icon: 'Communications' },
  { href: '/integrations', label: 'Integrations', icon: 'Integrations' },
  { href: '/settings/documents-records', label: 'Documents', icon: 'Documents' },
  { href: '/aura/business-rules', label: 'AURA & Automations', icon: 'AURA & Automations' },
  { href: '/settings/security', label: 'Security', icon: 'Security' },
  { href: '/settings/advanced/platform-health', label: 'Platform Health', icon: 'Platform Health' },
  { href: '/settings/about', label: 'Company Setup', icon: 'Company Setup' },
];

export function SettingsNav() {
  return <CompactTabs tabs={tabs} ariaLabel="Settings" maxVisible={5} />;
}
