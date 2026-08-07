import { Link } from 'wouter';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav className={`ux-breadcrumbs ${className}`.trim()} aria-label="Breadcrumb">
      <ol className="ux-breadcrumbs__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}:${index}`} className="ux-breadcrumbs__item">
              {item.href && !isLast ? (
                <Link href={item.href} className="ux-breadcrumbs__link">
                  {item.label}
                </Link>
              ) : (
                <span className="ux-breadcrumbs__current" aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!isLast ? <span className="ux-breadcrumbs__sep" aria-hidden="true">/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
