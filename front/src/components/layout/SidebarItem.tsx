import { NavLink } from 'react-router-dom';
import type { NavigationItem } from '../../config/navigation.ts';
import styles from './SidebarItem.module.css';

type SidebarItemProps = {
  item: NavigationItem;
  onNavigate?: () => void;
};

export function SidebarItem({ item, onNavigate }: SidebarItemProps) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        [styles.item, isActive ? styles.itemActive : ''].filter(Boolean).join(' ')
      }
      onClick={onNavigate}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}
