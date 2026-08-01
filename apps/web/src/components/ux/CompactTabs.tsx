import { MoreMenu, type MoreMenuItem } from './MoreMenu';

export type CompactTab = {
  id: string;
  label: string;
};

type CompactTabsProps<T extends string> = {
  tabs: CompactTab[];
  activeId: T;
  onChange: (id: T) => void;
  maxVisible?: number;
  moreLabel?: string;
};

export function CompactTabs<T extends string>({
  tabs,
  activeId,
  onChange,
  maxVisible = 5,
  moreLabel = 'More sections',
}: CompactTabsProps<T>) {
  const visible = tabs.slice(0, maxVisible);
  const overflow = tabs.slice(maxVisible);
  const overflowActive = overflow.some((tab) => tab.id === activeId);

  const overflowItems: MoreMenuItem[] = overflow.map((tab) => ({
    id: tab.id,
    label: tab.label,
    onSelect: () => onChange(tab.id as T),
  }));

  return (
    <div className="ux-compact-tabs" role="tablist">
      {visible.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
          className={
            activeId === tab.id
              ? 'ux-compact-tabs__tab ux-compact-tabs__tab--active'
              : 'ux-compact-tabs__tab'
          }
          onClick={() => onChange(tab.id as T)}
        >
          {tab.label}
        </button>
      ))}
      {overflow.length > 0 ? (
        <>
          {overflowActive ? (
            <span className="ux-compact-tabs__tab ux-compact-tabs__tab--active" aria-hidden="true">
              {tabs.find((tab) => tab.id === activeId)?.label}
            </span>
          ) : null}
          <MoreMenu label={moreLabel} items={overflowItems} />
        </>
      ) : null}
    </div>
  );
}
