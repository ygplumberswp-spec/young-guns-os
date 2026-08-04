import { useId } from 'react';
import { AI_NAME } from '@titan/shared';

type AuraMarkProps = {
  /** sm = message avatar, md = page header, lg = empty-state hero */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
};

/**
 * AURA mark — teal-accent ring with compact wordmark (same palette as TITAN chrome accents).
 */
export function AuraMark({ size = 'md', className, title = AI_NAME }: AuraMarkProps) {
  const uid = useId().replace(/:/g, '');
  const ringId = `auraRing-${uid}`;
  const glowId = `auraGlow-${uid}`;
  const classes = ['aura-mark', `aura-mark--${size}`, className].filter(Boolean).join(' ');

  return (
    <svg
      className={classes}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      focusable="false"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={ringId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1f7aec" />
          <stop offset="45%" stopColor="#3e9bff" />
          <stop offset="100%" stopColor="#54a6ff" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#1f7aec" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1f7aec" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="var(--titan-surface, #0f172a)" />
      <circle cx="32" cy="32" r="30" fill={`url(#${glowId})`} />
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke={`url(#${ringId})`}
        strokeWidth="2.5"
      />
      <text
        x="32"
        y="36"
        textAnchor="middle"
        fill="var(--titan-text, #e2e8f0)"
        fontSize="11"
        fontWeight="700"
        letterSpacing="0.14em"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {AI_NAME}
      </text>
    </svg>
  );
}
