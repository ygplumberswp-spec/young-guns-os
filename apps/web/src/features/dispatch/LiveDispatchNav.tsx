import { CompactTabs } from '../../components/ux';
import { NAV_LABELS } from '@titan/shared';

const tabs = [
  { href: '/mobile-platform/dispatcher', label: 'Console' },
  { href: '/fleet/live-map', label: 'Fleet map' },
  { href: '/dispatch-intelligence', label: 'Intelligence' },
  { href: '/scheduling', label: 'Scheduling' },
];

export function LiveDispatchNav() {
  return <CompactTabs tabs={tabs} ariaLabel={NAV_LABELS.liveDispatch} maxVisible={4} />;
}
