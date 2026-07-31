/**
 * Standalone scheduler process — reuses API service graph without serving HTTP.
 * Requires SCHEDULERS_ENABLED=true (or AUTOMATIONS_ENABLED=true).
 */
process.env.TITAN_RUNTIME_MODE = 'scheduler';
void import('../index.js');
