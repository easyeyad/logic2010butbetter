import type { IconName } from '../components/Icon';

export interface NavItem {
  path: string;
  label: string;
  /** Short label for the mobile tab bar / rail. */
  short: string;
  icon: IconName;
  description: string;
}

export const NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', short: 'Home', icon: 'home', description: 'Your starting point' },
  { path: '/practice', label: 'Practice', short: 'Practice', icon: 'practice', description: 'Guided exercise sets' },
  { path: '/proofs', label: 'Proofs', short: 'Proofs', icon: 'proof', description: 'Build and check derivations' },
  { path: '/truth-tables', label: 'Truth Tables', short: 'Tables', icon: 'table', description: 'Compute or practice truth tables' },
  { path: '/symbolization', label: 'Symbolization', short: 'Symbolize', icon: 'symbol', description: 'Translate English into logic' },
  { path: '/countermodels', label: 'Countermodels', short: 'Models', icon: 'target', description: 'Test arguments for validity' },
  { path: '/reference', label: 'Reference', short: 'Rules', icon: 'book', description: 'Every inference rule, explained' },
  { path: '/progress', label: 'Progress', short: 'Progress', icon: 'progress', description: 'What you have mastered' },
];

export const SETTINGS_ITEM: NavItem = {
  path: '/settings',
  label: 'Settings',
  short: 'Settings',
  icon: 'settings',
  description: 'Theme, rules and data',
};

export const ALL_NAV = [...NAV, SETTINGS_ITEM];

/** Mobile bottom tab bar: five primary destinations; the rest live under "More". */
export const MOBILE_TABS = ['/', '/practice', '/proofs', '/truth-tables', '/reference'];

export function findNav(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV[0];
  return ALL_NAV.find((n) => n.path !== '/' && (pathname === n.path || pathname.startsWith(n.path + '/')));
}
