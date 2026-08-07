import { FormEvent, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button, Input } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import { ApiClientError } from '../../lib/api-client';
import { GuestRoute } from '../../components/ProtectedRoute';

export function SignupPage() {
  return (
    <GuestRoute>
      <SignupForm />
    </GuestRoute>
  );
}

function SignupForm() {
  const { signup } = useAuth();
  const [, setLocation] = useLocation();
  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signup({ companyName, firstName, lastName, email, password });
      setLocation('/onboarding');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <h2 className="auth-card__title">Create your workspace</h2>
        <p className="auth-card__subtitle">
          Register your company and become the first admin. TITAN starts empty — no demo data.
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <Input
            label="Company Name"
            name="companyName"
            placeholder="Acme Services"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            required
          />
          <div className="auth-form__row">
            <Input
              label="First Name"
              name="firstName"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
            />
            <Input
              label="Last Name"
              name="lastName"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              required
            />
          </div>
          <Input
            label="Work Email"
            name="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            label="Password"
            name="password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? <p className="auth-error">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating workspace...' : 'Create workspace'}
          </Button>
        </form>
        <p className="auth-card__footer">
          Already have an account? <Link href="/auth/login">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
