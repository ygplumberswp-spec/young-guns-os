import { useSmartBack } from '../../hooks/useSmartBack';

type BackButtonProps = {
  fallbackHref?: string;
  label?: string;
  onNavigate?: () => void;
  className?: string;
};

function BackArrowIcon() {
  return (
    <svg
      className="ux-back-button__icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 3L5 8l5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BackButton({
  fallbackHref,
  label = 'Back',
  onNavigate,
  className,
}: BackButtonProps) {
  const { goBack } = useSmartBack(fallbackHref);

  function handleClick() {
    if (onNavigate) {
      onNavigate();
      return;
    }
    goBack();
  }

  return (
    <button
      type="button"
      className={`ux-back-button ${className ?? ''}`.trim()}
      onClick={handleClick}
      aria-label={label}
    >
      <BackArrowIcon />
      <span className="ux-back-button__label">{label}</span>
    </button>
  );
}
