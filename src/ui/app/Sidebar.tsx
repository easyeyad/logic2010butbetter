import { NavLink } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Brand } from './Brand';
import { NAV, SETTINGS_ITEM, type NavItem } from './nav';

function Item({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <li>
      <NavLink
        to={item.path}
        end={item.path === '/'}
        className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
        title={collapsed ? item.label : undefined}
        onClick={onNavigate}
      >
        <Icon name={item.icon} />
        <span className="nav-link__label">{collapsed ? item.short : item.label}</span>
      </NavLink>
    </li>
  );
}

/**
 * Desktop sidebar (≥1024px) and tablet icon rail (768–1023px). `collapsed`
 * renders the compact rail; `expanded` temporarily shows the full sidebar
 * over the content on tablets.
 */
export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  return (
    <nav className={`sidebar ${collapsed ? 'sidebar--rail' : ''}`} aria-label="Main">
      <div className="sidebar__top">
        <Brand compact={collapsed} />
      </div>
      <ul className="sidebar__list">
        {NAV.map((n) => (
          <Item key={n.path} item={n} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </ul>
      <ul className="sidebar__list sidebar__list--bottom">
        <Item item={SETTINGS_ITEM} collapsed={collapsed} onNavigate={onNavigate} />
        <li>
          <button
            type="button"
            className="nav-link nav-link--button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} />
            <span className="nav-link__label">{collapsed ? 'Expand' : 'Collapse'}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
