type CacheStaleNoticeProps = {
  isStale: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function CacheStaleNotice({ isStale, error, onRetry }: CacheStaleNoticeProps) {
  if (!isStale && !error) {
    return null;
  }

  return (
    <div className="cache-stale-notice" role="status" aria-live="polite">
      <span className="cache-stale-notice__text">
        {error ? 'Showing saved data while refresh failed.' : 'Refreshing in background…'}
      </span>
      {error && onRetry ? (
        <button type="button" className="cache-stale-notice__retry" onClick={() => void onRetry()}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
