import { CompactTabs } from '../../components/ux/CompactTabs';
import { NAV_LABELS } from '@titan/shared';

export function AuraSectionNav() {
  return (
    <CompactTabs
      ariaLabel="AURA sections"
      className="aura-section-nav"
      tabs={[
        { href: '/aura', label: NAV_LABELS.auraExecutiveChat },
        { href: '/aura/operations', label: 'Operations Manager' },
        { href: '/aura/todays-plan', label: "Today's Plan" },
        { href: '/aura/business-rules', label: 'Business Rules' },
        { href: '/aura/agents', label: NAV_LABELS.auraTeam },
      ]}
    />
  );
}
