import { PageHeader } from '../../components/ux';
import { useEffect, useState } from 'react';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { CxReviewFeedbackSummary } from '@titan/shared';
import {
  PortalApiClientError,
  fetchCxPortalReviews,
  submitCxPortalReview,
} from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalFeedbackPage() {
  const { accessToken } = usePortalAuth();
  const [reviews, setReviews] = useState<CxReviewFeedbackSummary[]>([]);
  const [subject, setSubject] = useState('');
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchCxPortalReviews(accessToken)
      .then(setReviews)
      .catch((err) =>
        setError(err instanceof PortalApiClientError ? err.message : 'Unable to load feedback'),
      );
  }, [accessToken]);

  async function submitReview() {
    if (!accessToken || !subject.trim() || !feedback.trim()) return;
    try {
      const review = await submitCxPortalReview(accessToken, {
        reviewType: 'job_rating',
        subject: subject.trim(),
        feedback: feedback.trim(),
        rating,
      });
      setReviews((current) => [review, ...current]);
      setSubject('');
      setFeedback('');
      setSuccess('Feedback submitted — thank you');
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to submit feedback');
    }
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Reviews & Feedback"
        description="Rate your experience and submit feedback."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Submit Feedback">
        <div className="form-stack">
          <input
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            placeholder="Your feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
          />
          <label>
            Rating
            <input
              type="number"
              min={1}
              max={5}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
            />
          </label>
          <Button onClick={() => void submitReview()}>Submit Feedback</Button>
        </div>
      </Panel>

      <Panel title="Your Submissions">
        {reviews.length === 0 ? (
          <EmptyState
            title="No Feedback Yet"
            description="Your submitted reviews and feedback will appear here."
          />
        ) : (
          <ul className="portal-list">
            {reviews.map((review) => (
              <li key={review.id}>
                <strong>{review.subject}</strong>
                <span>
                  {review.reviewType.replace(/_/g, ' ')} · {review.status}
                  {review.rating != null ? ` · ${review.rating}/5` : ''}
                </span>
                <p>{review.feedback}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
