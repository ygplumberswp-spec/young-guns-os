import { CompactTabs } from '../../components/ux';

const tabs = [
  { href: '/fleet/live-map', label: 'Live Map' },
  { href: '/fleet/vehicles', label: 'Vehicles' },
  { href: '/fleet/trips', label: 'Trips' },
  { href: '/fleet/alerts', label: 'Alerts' },
  { href: '/fleet/drivers', label: 'Drivers' },
  { href: '/fleet/geofences', label: 'Geofences' },
  { href: '/fleet/route-history', label: 'Route History' },
  { href: '/fleet/events', label: 'Events' },
  { href: '/fleet/maintenance', label: 'Maintenance' },
  { href: '/fleet/reports', label: 'Reports' },
];

export function FleetSectionNav() {
  return <CompactTabs tabs={tabs} ariaLabel="Fleet" maxVisible={4} />;
}
