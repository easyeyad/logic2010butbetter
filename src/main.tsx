import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles/index.css';
import { App } from './ui/app/App';

// Path URLs like /proofs (no #) would silently show the dashboard with the
// HashRouter; redirect them to the hash route instead.
(() => {
  const { pathname, hash, search } = window.location;
  if (hash) return;
  const m = pathname.match(/\/(practice|proofs|truth-tables|symbolization|countermodels|reference|progress|settings)\/?$/);
  if (m) window.location.replace(`${pathname.slice(0, m.index)}/${search}#/${m[1]}`);
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
