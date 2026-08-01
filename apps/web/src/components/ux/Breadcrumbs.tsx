import { Link } from 'wouter';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="ux-breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="ux-breadcrumbs__segment">
            {index > 0 ? <span className="ux-breadcrumbs__sep" aria-hidden="true"> / </span> : null}
            {isLast || !item.href ? (
              <span className="ux-breadcrumbs__current" aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="ux-breadcrumbs__link">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
