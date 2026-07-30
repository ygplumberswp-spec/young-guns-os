import { Link, useLocation } from 'wouter';

const providerLinks = [
  { href: '/integrations/xero', label: 'Xero' },
  { href: '/integrations/whatsapp', label: 'WhatsApp' },
  { href: '/integrations/email', label: 'Google / Email' },
  { href: '/integrations/cartrack', label: 'Cartrack' },
  { href: '/integrations/yoco', label: 'Yoco' },
];

export function IntegrationsNav() {
  const [location] = useLocation();
  const onMainPage = location === '/integrations';

  if (!onMainPage) {
    return null;
  }

  return (
    <nav className="integrations-nav integrations-nav--compact" aria-label="Quick provider links">
      {providerLinks.map((link) => (
        <Link key={link.href} href={link.href} className="integrations-nav__link">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
