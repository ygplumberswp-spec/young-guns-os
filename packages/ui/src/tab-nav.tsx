import clsx from 'clsx';
import { type KeyboardEvent, useMemo } from 'react';

export type TabItem = {
  id: string;
  label: string;
};

export type TabGroup = {
  id: string;
  label: string;
  tabs: TabItem[];
};

export type TabNavProps = {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  ariaLabel?: string;
  className?: string;
};

export type GroupedTabNavProps = {
  groups: TabGroup[];
  activeTab: string;
  onChange: (tabId: string) => void;
  ariaLabel?: string;
  className?: string;
};

function handleTabKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  tabs: TabItem[],
  activeTab: string,
  onChange: (tabId: string) => void,
) {
  const index = tabs.findIndex((tab) => tab.id === activeTab);
  if (index < 0) return;

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    onChange(tabs[(index + 1) % tabs.length].id);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    onChange(tabs[(index - 1 + tabs.length) % tabs.length].id);
  }
}

export function TabNav({
  tabs,
  activeTab,
  onChange,
  ariaLabel = 'Sections',
  className,
}: TabNavProps) {
  return (
    <div className={clsx('titan-tab-nav', className)} role="tablist" aria-label={ariaLabel}>
      <div className="titan-tab-nav__scroll">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={clsx(
              'titan-tab-nav__tab',
              activeTab === tab.id && 'titan-tab-nav__tab--active',
            )}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, tabs, activeTab, onChange)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GroupedTabNav({
  groups,
  activeTab,
  onChange,
  ariaLabel = 'Sections',
  className,
}: GroupedTabNavProps) {
  const flatTabs = useMemo(() => groups.flatMap((group) => group.tabs), [groups]);
  const activeGroup = groups.find((group) => group.tabs.some((tab) => tab.id === activeTab));

  return (
    <div className={clsx('titan-tab-nav titan-tab-nav--grouped', className)}>
      <div className="titan-tab-nav__groups" role="tablist" aria-label={`${ariaLabel} categories`}>
        <div className="titan-tab-nav__scroll">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={clsx(
                'titan-tab-nav__group',
                activeGroup?.id === group.id && 'titan-tab-nav__group--active',
              )}
              onClick={() => {
                if (!group.tabs.some((tab) => tab.id === activeTab)) {
                  onChange(group.tabs[0]?.id ?? activeTab);
                }
              }}
            >
              {group.label}
            </button>
          ))}
        </div>
      </div>
      {activeGroup ? (
        <div className="titan-tab-nav__sub" role="tablist" aria-label={ariaLabel}>
          <div className="titan-tab-nav__scroll">
            {activeGroup.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={clsx(
                  'titan-tab-nav__tab',
                  activeTab === tab.id && 'titan-tab-nav__tab--active',
                )}
                onClick={() => onChange(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, flatTabs, activeTab, onChange)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
