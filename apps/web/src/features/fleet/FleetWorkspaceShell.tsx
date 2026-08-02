import type { ReactNode } from 'react';
import { FleetSectionNav } from './FleetSectionNav';
import { PageHeader } from '../../components/ux';

type FleetWorkspaceShellProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

/** Shared fleet workspace chrome — tab nav + page header. */
export function FleetWorkspaceShell({
  title,
  description,
  actions,
  children,
}: FleetWorkspaceShellProps) {
  return (
    <div className="page-stack fleet-page">
      <FleetSectionNav />
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}
