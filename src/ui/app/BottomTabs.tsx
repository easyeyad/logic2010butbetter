import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { ALL_NAV, MOBILE_TABS, findNav } from './nav';

/** Mobile (<768px) bottom tab bar with a "More" sheet for secondary pages. */
export function BottomTabs() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const tabs = MOBILE_TABS.map((p) => ALL_NAV.find((n) => n.path === p)!);
  const others = ALL_NAV.filter((n) => !MOBILE_TABS.includes(n.path));
  const current = findNav(pathname);
  const inMore = current ? !MOBILE_TABS.includes(current.path) : false;

  return (
    <>
      <nav className="tabbar" aria-label="Main">
        <ul>
          {tabs.map((t) => (
            <li key={t.path}>
              <NavLink to={t.path} end={t.path === '/'} className={({ isActive }) => `tabbar__item ${isActive ? 'is-active' : ''}`}>
                <Icon name={t.icon} />
                <span>{t.short}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={`tabbar__item ${inMore ? 'is-active' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-current={inMore ? 'page' : undefined}
              onClick={() => setMoreOpen(true)}
            >
              <Icon name="more" />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>
      <BottomSheet open={moreOpen} title="More" onClose={() => setMoreOpen(false)}>
        <ul className="more-list">
          {others.map((n) => (
            <li key={n.path}>
              <NavLink
                to={n.path}
                className={({ isActive }) => `more-list__item ${isActive ? 'is-active' : ''}`}
                onClick={() => setMoreOpen(false)}
              >
                <Icon name={n.icon} />
                <span className="grow">
                  <span className="more-list__label">{n.label}</span>
                  <span className="more-list__desc">{n.description}</span>
                </span>
                <Icon name="chevronRight" />
              </NavLink>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
