import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/Toast';
import { AppShell } from './AppShell';
import { SettingsProvider } from './settings';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { PlaceholderPage } from '../features/placeholders/PlaceholderPage';

const ProofsPage = lazy(() => import('../features/proofs/ProofsPage'));
const TruthTablesPage = lazy(() => import('../features/truthTables/TruthTablesPage'));
const CountermodelsPage = lazy(() => import('../features/countermodels/CountermodelsPage'));
const ReferencePage = lazy(() => import('../features/reference/ReferencePage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));

function Page({ label, children }: { label: string; children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname} label={label}>
      <Suspense fallback={<div className="page-loading" role="status">Loading {label}…</div>}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Page label="Dashboard"><DashboardPage /></Page>} />
      <Route path="/practice" element={<Page label="Practice"><PlaceholderPage kind="practice" /></Page>} />
      <Route path="/proofs" element={<Page label="Proofs"><ProofsPage /></Page>} />
      <Route path="/truth-tables" element={<Page label="Truth Tables"><TruthTablesPage /></Page>} />
      <Route path="/symbolization" element={<Page label="Symbolization"><PlaceholderPage kind="symbolization" /></Page>} />
      <Route path="/countermodels" element={<Page label="Countermodels"><CountermodelsPage /></Page>} />
      <Route path="/reference" element={<Page label="Reference"><ReferencePage /></Page>} />
      <Route path="/progress" element={<Page label="Progress"><PlaceholderPage kind="progress" /></Page>} />
      <Route path="/settings" element={<Page label="Settings"><SettingsPage /></Page>} />
      <Route path="*" element={<Page label="Not found"><PlaceholderPage kind="notFound" /></Page>} />
    </Routes>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <HashRouter>
          <AppShell>
            <AppRoutes />
          </AppShell>
        </HashRouter>
      </ToastProvider>
    </SettingsProvider>
  );
}
