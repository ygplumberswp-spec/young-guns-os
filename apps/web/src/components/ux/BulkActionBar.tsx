import { type ReactNode } from 'react';

type BulkActionBarProps = {
  totalCount: number;
  selectedCount: number;
  onSelectAll: (selected: boolean) => void;
  allSelected: boolean;
  actions?: ReactNode;
};

export function BulkActionBar({
  totalCount,
  selectedCount,
  onSelectAll,
  allSelected,
  actions,
}: BulkActionBarProps) {
  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="ux-bulk-bar" role="region" aria-label="Bulk actions">
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(event) => onSelectAll(event.target.checked)}
          aria-label="Select all rows"
        />
        Select all
      </label>
      <span className="ux-bulk-bar__count">
        {selectedCount > 0 ? `${selectedCount} selected` : `${totalCount} item(s)`}
      </span>
      {selectedCount > 0 && actions ? actions : null}
    </div>
  );
}
