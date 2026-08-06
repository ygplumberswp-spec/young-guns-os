type HeaderSearchTriggerProps = {
  onClick: () => void;
};

function SearchIcon() {
  return (
    <svg
      className="header-search-trigger__icon"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function HeaderSearchTrigger({ onClick }: HeaderSearchTriggerProps) {
  return (
    <button
      type="button"
      className="header-search-trigger"
      onClick={onClick}
      aria-label="Search TITAN (Command K)"
    >
      <SearchIcon />
      <span className="header-search-trigger__label">Search TITAN</span>
      <kbd className="header-search-trigger__kbd" aria-hidden="true">
        ⌘K
      </kbd>
    </button>
  );
}
