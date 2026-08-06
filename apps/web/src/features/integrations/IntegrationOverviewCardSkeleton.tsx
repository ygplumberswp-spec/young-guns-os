type IntegrationOverviewCardSkeletonProps = {
  providerKey?: string;
};

export function IntegrationOverviewCardSkeleton({
  providerKey = 'loading',
}: IntegrationOverviewCardSkeletonProps) {
  return (
    <article
      className="integration-overview-card integration-overview-card--loading"
      data-provider={providerKey}
      aria-busy="true"
      aria-label="Loading integration"
    >
      <div className="integration-overview-card__mark integration-overview-card__mark--skeleton" />
      <div className="integration-overview-card__body">
        <div className="integration-overview-card__skeleton integration-overview-card__skeleton--title" />
        <div className="integration-overview-card__skeleton integration-overview-card__skeleton--status" />
        <div className="integration-overview-card__skeleton integration-overview-card__skeleton--line" />
        <div className="integration-overview-card__skeleton integration-overview-card__skeleton--line short" />
      </div>
      <div className="integration-overview-card__action">
        <div className="integration-overview-card__skeleton integration-overview-card__skeleton--button" />
      </div>
    </article>
  );
}
