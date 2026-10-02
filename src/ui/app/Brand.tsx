/** Wordmark: a stylized turnstile ⊢ in a rounded square. */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M7 5v14" />
          <path d="M7 12h10" />
        </svg>
      </span>
      {!compact && <span className="brand__name">Logic Studio</span>}
    </span>
  );
}
