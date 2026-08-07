import type { ReactNode } from 'react';
import { Button } from '@titan/ui';

export type BulkAction = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
};

type BulkActionBarProps = {
  selectedCount: number;
  totalCount: number;
  onSelectAll: (checked: boolean) => void;
  allSelected: boolean;
  actions: BulkAction[];
  children?: ReactNode;
};

/** Checkbox select-all with role-filtered bulk actions. */
export function BulkActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  allSelected,
  actions,
  children,
}: BulkActionBarProps) {
  if (totalCount === 0) {
    return null;
  }

  const visibleActions = actions.filter((action) => !action.disabled);

  return (
    <div className="ux-bulk-bar" role="toolbar" aria-label="Bulk Actions">
      <label className="titan-checkbox ux-bulk-bar__select">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(event) => onSelectAll(event.target.checked)}
          aria-label="Select All Rows"
        />
        <span className="ux-bulk-bar__count">
          {selectedCount > 0 ? `${selectedCount} selected` : `${totalCount} items`}
        </span>
      </label>
      {selectedCount > 0 && visibleActions.length > 0 ? (
        <div className="ux-bulk-bar__actions">
          {visibleActions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant ?? 'secondary'}
              size="sm"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}
