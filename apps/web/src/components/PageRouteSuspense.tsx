import { LoadingState } from '@titan/ui';

export function PageRouteSuspense() {
  return (
    <div className="page-route-suspense" aria-live="polite">
      <LoadingState label="Opening page…" />
    </div>
  );
}
