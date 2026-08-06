import { useId } from 'react';

type TitanWordmarkProps = {
  /** Full auth/hero mark vs compact app-shell mark */
  variant?: 'hero' | 'compact' | 'mono';
  className?: string;
  title?: string;
};

/**
 * Original TITAN wordmark — metallic chrome SVG (not browser text).
 * Wide geometric chamfered forms with an open angular A (no crossbar).
 * Not copied from any third-party trademark.
 */
export function TitanWordmark({
  variant = 'hero',
  className,
  title = 'TITAN',
}: TitanWordmarkProps) {
  const uid = useId().replace(/:/g, '');
  const fillId = `titanChromeFill-${uid}`;
  const edgeId = `titanChromeEdge-${uid}`;
  const sheenId = `titanChromeSheen-${uid}`;
  const isCompact = variant === 'compact';
  const isMono = variant === 'mono';
  const classes = ['titan-wordmark', `titan-wordmark--${variant}`, className].filter(Boolean).join(' ');

  return (
    <svg
      className={classes}
      viewBox="0 0 560 88"
      role="img"
      aria-label={title}
      focusable="false"
    >
      <title>{title}</title>
      <defs>
        {!isMono ? (
          <>
            <linearGradient id={fillId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f4f7fb" />
              <stop offset="22%" stopColor="#d7dee8" />
              <stop offset="48%" stopColor="#8b98ab" />
              <stop offset="72%" stopColor="#c9d2de" />
              <stop offset="100%" stopColor="#5b6b80" />
            </linearGradient>
            <linearGradient id={sheenId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="35%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="70%" stopColor="#94a3b8" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
            </linearGradient>
            <linearGradient id={edgeId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1f7aec" stopOpacity="0.7" />
              <stop offset="45%" stopColor="#e2e8f0" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#54a6ff" stopOpacity="0.45" />
            </linearGradient>
          </>
        ) : null}
      </defs>

      {/* Wide geometric letterforms — chamfered, open A */}
      <g
        fill={isMono ? 'currentColor' : `url(#${fillId})`}
        stroke={isMono ? 'currentColor' : `url(#${edgeId})`}
        strokeWidth={isCompact ? 1.35 : 1.25}
        strokeLinejoin="miter"
        strokeLinecap="butt"
      >
        {/* T — wide bar, chamfered ends, stout stem */}
        <path d="M12 20 H104 L108 28 H68 V70 H48 V28 H8 Z" />
        {/* I — stout pillar with slight chamfer */}
        <path d="M128 20 H152 L154 24 V66 L152 70 H128 L126 66 V24 Z" />
        {/* T */}
        <path d="M172 20 H264 L268 28 H228 V70 H208 V28 H168 Z" />
        {/* A — open angular chevron, no crossbar (reference-led) */}
        <path d="M286 70 L324 16 H340 L378 70 H354 L332 36 L310 70 Z" />
        {/* N — wide geometric N */}
        <path d="M396 70 V20 H418 L470 52 V20 H492 V70 H470 L418 38 V70 Z" />
      </g>

      {!isMono ? (
        <g fill={`url(#${sheenId})`} opacity="0.55" pointerEvents="none">
          <path d="M12 20 H104 L108 28 H68 V36 H48 V28 H8 Z" />
          <path d="M128 20 H152 L154 24 V34 H126 Z" />
          <path d="M172 20 H264 L268 28 H228 V36 H208 V28 H168 Z" />
          <path d="M286 70 L324 16 H340 L338 22 L324 22 L300 58 Z" />
          <path d="M396 20 H418 L430 28 H396 Z" />
        </g>
      ) : null}
    </svg>
  );
}
