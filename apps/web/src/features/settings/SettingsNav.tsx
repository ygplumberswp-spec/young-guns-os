import { CompactTabs } from '../../components/ux';

const tabs = [
  { href: '/settings/company', label: 'Company' },
  { href: '/settings/team', label: 'Team & Access' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/documents-records', label: 'Documents' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/advanced/data-protection', label: 'Data protection' },
  { href: '/settings/advanced/platform-health', label: 'Platform health' },
  { href: '/settings/portal', label: 'Portal' },
  { href: '/settings/billing', label: 'Billing' },
  { href: '/settings/about', label: 'About' },
];

export function SettingsNav() {
  return <CompactTabs tabs={tabs} ariaLabel="Settings" maxVisible={5} />;
}
