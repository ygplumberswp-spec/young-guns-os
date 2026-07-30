type SimpleAdvancedToggleProps = {
  mode: 'simple' | 'advanced';
  onChange: (mode: 'simple' | 'advanced') => void;
  canAccessAdvanced?: boolean;
};

export function SimpleAdvancedToggle({
  mode,
  onChange,
  canAccessAdvanced = false,
}: SimpleAdvancedToggleProps) {
  if (!canAccessAdvanced) {
    return null;
  }

  return (
    <div className="simple-advanced-toggle" role="group" aria-label="View mode">
      <button
        type="button"
        className={`simple-advanced-toggle__btn ${mode === 'simple' ? 'simple-advanced-toggle__btn--active' : ''}`}
        onClick={() => onChange('simple')}
      >
        Simple
      </button>
      <button
        type="button"
        className={`simple-advanced-toggle__btn ${mode === 'advanced' ? 'simple-advanced-toggle__btn--active' : ''}`}
        onClick={() => onChange('advanced')}
      >
        Advanced
      </button>
    </div>
  );
}
