import { PageHeader } from '../../components/ux';
import { useState, type FormEvent } from 'react';
import { Panel } from '@titan/ui';
import type { PortalKnowledgeArticleSummary } from '@titan/shared';
import { PortalApiClientError, searchPortalKnowledge } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalKnowledgePage() {
  const { accessToken } = usePortalAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PortalKnowledgeArticleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !query.trim()) return;
    setError(null);
    try {
      const data = await searchPortalKnowledge(accessToken, query.trim());
      setResults(data);
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Search failed');
    }
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Help & Self-Service"
        description="Search customer-visible articles, FAQs, and guides."
      />
      <form onSubmit={handleSearch}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search knowledge..."
        />
        <button type="submit">Search</button>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
      <Panel title="Results">
        <ul className="portal-list">
          {results.map((item) => (
            <li key={`${item.resultType}-${item.id}`}>
              <strong>{item.title}</strong>
              <span>{item.resultType}</span>
              {item.summary ? <p>{item.summary}</p> : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
