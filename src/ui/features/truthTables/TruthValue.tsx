/**
 * A truth value, drawn as a small pill (bold T / F) so it never reads as the
 * sentence letter T. role="img" carries the spoken word ("true"/"false");
 * the visible letter stays the element's text content.
 */
export function TruthValue({ value }: { value: boolean }) {
  return (
    <span className={`tv tv--${value ? 't' : 'f'}`} role="img" aria-label={value ? 'true' : 'false'}>
      {value ? 'T' : 'F'}
    </span>
  );
}
