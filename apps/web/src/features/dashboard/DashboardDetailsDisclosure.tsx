import { useState, type ReactNode } from 'react';

type DashboardDetailsDisclosureProps = {
  children: ReactNode;
  label?: string;
};

/** Source and provider details — hidden until the Owner asks for them. */
export function DashboardDetailsDisclosure({
  children,
  label = 'View source',
}: DashboardDetailsDisclosureProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="exec-details-disclosure">
      <button
        type="button"
        className="exec-details-disclosure__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? 'Hide details' : label}
      </button>
      {open ? <div className="exec-details-disclosure__body">{children}</div> : null}
    </div>
  );
}
