/** T/F glyph: letter + shape, so value never depends on color alone. */
export function TruthValue({ value }: { value: boolean }) {
  return (
    <span className={`tv tv--${value ? 't' : 'f'}`} aria-label={value ? 'true' : 'false'}>
      <span aria-hidden="true">{value ? 'T' : 'F'}</span>
    </span>
  );
}
