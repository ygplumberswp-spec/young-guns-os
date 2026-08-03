import { Link, useLocation } from 'wouter';

const providerLinks = [
  { href: '/integrations/xero', label: 'Xero' },
  { href: '/integrations/whatsapp', label: 'Business WhatsApp' },
  { href: '/integrations/email', label: 'Email (SMTP)' },
  { href: '/integrations/resend', label: 'Resend' },
  { href: '/integrations/cartrack', label: 'Cartrack' },
  { href: '/integrations/google-maps', label: 'Google Maps' },
  { href: '/integrations/yoco', label: 'Yoco' },
];

export function IntegrationsNav() {
  const [location] = useLocation();
  const onMainPage = location === '/integrations';

  if (!onMainPage) {
    return null;
  }

  return (
    <nav className="integrations-nav integrations-nav--compact" aria-label="Quick Provider Links">
      {providerLinks.map((link) => (
        <Link key={link.href} href={link.href} className="integrations-nav__link">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
