/** Development-only route to verify the top-level error boundary. */
export function DevErrorBoundaryTestPage(): never {
  throw new Error('Phase 2 error boundary verification');
}
