/** Documents the bright-blue active sidebar treatment applied via AppLayout link classes. */
export const ACTIVE_SIDEBAR_ITEM_CLASS = 'app-nav__link app-nav__link--active';

type ActiveSidebarItemProps = {
  active?: boolean;
  className?: string;
};

export function activeSidebarClassName({ active = false, className = '' }: ActiveSidebarItemProps): string {
  return ['app-nav__link', active ? 'app-nav__link--active' : '', className].filter(Boolean).join(' ');
}
