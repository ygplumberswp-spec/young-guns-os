import { Redirect } from 'wouter';

/** Central settings entry — routes to company profile by default. */
export function SettingsIndexPage() {
  return <Redirect to="/settings/company" />;
}
