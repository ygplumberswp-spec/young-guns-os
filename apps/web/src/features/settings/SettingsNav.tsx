import { CompactTabs } from '../../components/ux';

/** Phase 1 settings workspace — accessed via header identity link, not main sidebar. */
const tabs = [
  { href: '/settings/company', label: 'Company' },
  { href: '/settings/team', label: 'Team & Access' },
  { href: '/settings/billing', label: 'Finance & Pricing' },
  { href: '/settings/dashboard', label: 'Jobs & Scheduling' },
  { href: '/settings/cartrack', label: 'Fleet' },
  { href: '/inventory/products', label: 'Inventory' },
  { href: '/settings/notifications', label: 'Communications' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/settings/documents-records', label: 'Documents' },
  { href: '/aura/business-rules', label: 'AURA & Automations' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/advanced/platform-health', label: 'Platform Health' },
  { href: '/settings/about', label: 'Company Setup' },
];

export function SettingsNav() {
  return <CompactTabs tabs={tabs} ariaLabel="Settings" maxVisible={5} />;
}
