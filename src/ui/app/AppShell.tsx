import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { BP, useMediaQuery } from '../hooks/useMediaQuery';
import { BottomTabs } from './BottomTabs';
import { Sidebar } from './Sidebar';
import { requestHeadingFocus } from './headingFocus';

export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useMediaQuery(BP.mobile);
  const isDesktop = useMediaQuery(BP.desktop);
  const [desktopCollapsed, setDesktopCollapsed] = useLocalStorage('nav-collapsed', false);
  const [tabletExpanded, setTabletExpanded] = useLocalStorage('nav-tablet-expanded', false);
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);

  // Move focus to the new page's heading on navigation (not on first load).
  useEffect(() => {
    // Only on a real navigation (not the first load, and not StrictMode's effect re-run).
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    window.scrollTo(0, 0);
    requestHeadingFocus();
  }, [pathname]);

  const collapsed = isDesktop ? desktopCollapsed : !tabletExpanded;
  const toggle = () => (isDesktop ? setDesktopCollapsed(!desktopCollapsed) : setTabletExpanded(!tabletExpanded));

  return (
    <div className={`shell ${isMobile ? 'shell--mobile' : collapsed ? 'shell--rail' : 'shell--sidebar'}`}>
      <a href="#main" className="skip-link" onClick={(e) => {
        e.preventDefault();
        const m = document.getElementById('main');
        m?.focus();
        m?.scrollIntoView();
      }}>
        Skip to content
      </a>
      {!isMobile && <Sidebar collapsed={collapsed} onToggle={toggle} />}
      <main id="main" className="shell__main" tabIndex={-1}>
        {children}
      </main>
      {isMobile && <BottomTabs />}
    </div>
  );
}
