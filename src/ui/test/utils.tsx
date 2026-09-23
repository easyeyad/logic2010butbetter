import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsProvider } from '../app/settings';
import { ToastProvider } from '../components/Toast';

export function renderWithProviders(ui: ReactElement) {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </SettingsProvider>,
  );
}
