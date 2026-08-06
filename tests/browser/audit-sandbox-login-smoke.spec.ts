import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(process.cwd());

test.describe('Audit sandbox login selectors (QA-0)', () => {
  test('staff login page exposes email, password and submit selectors', async () => {
    const source = readFileSync(join(repoRoot, 'apps/web/src/pages/auth/LoginPage.tsx'), 'utf8');
    expect(source).toMatch(/name="email"/);
    expect(source).toMatch(/type="email"/);
    expect(source).toMatch(/name="password"/);
    expect(source).toMatch(/type="password"/);
    expect(source).toMatch(/type="submit"/);
    expect(source).toMatch(/className="auth-form"/);
  });

  test('portal login page exposes email, password and submit selectors', async () => {
    const source = readFileSync(join(repoRoot, 'apps/web/src/pages/portal/PortalLoginPage.tsx'), 'utf8');
    expect(source).toMatch(/type="email"/);
    expect(source).toMatch(/type="password"/);
    expect(source).toMatch(/type="submit"/);
    expect(source).toMatch(/className="auth-form"/);
  });

  test('audit sandbox banner component exists for staff shell', async () => {
    const source = readFileSync(join(repoRoot, 'apps/web/src/components/AuditSandboxBanner.tsx'), 'utf8');
    expect(source).toMatch(/audit-sandbox-banner/);
  });
});
