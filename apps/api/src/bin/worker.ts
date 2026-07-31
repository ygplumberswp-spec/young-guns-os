/**
 * Standalone worker process — reuses API service graph without serving HTTP.
 * Requires WORKERS_ENABLED=true (or AUTOMATIONS_ENABLED=true).
 */
process.env.TITAN_RUNTIME_MODE = 'worker';
void import('../index.js');
