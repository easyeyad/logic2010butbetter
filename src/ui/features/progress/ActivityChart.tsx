import type { DayActivity } from '../../../learning';

/**
 * Single-series column chart of attempts per day (one hue; the count is
 * printed on each non-empty column; a table carries the same data for
 * screen readers). Hover shows the day's numbers.
 */
export function ActivityChart({ days }: { days: DayActivity[] }) {
  const max = Math.max(1, ...days.map((d) => d.attempts));
  const total = days.reduce((n, d) => n + d.attempts, 0);
  const fmt = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  return (
    <div>
      {total === 0 && <p className="subtle">No practice in the last two weeks yet.</p>}
      <div className="act" aria-hidden="true">
        {days.map((d) => (
          <div key={d.date} className="act__col" title={`${fmt(d.date)}: ${d.attempts} attempts, ${d.correct} correct`}>
            <span className="act__n">{d.attempts > 0 ? d.attempts : ''}</span>
            <span className="act__bar" style={{ height: `${(100 * d.attempts) / max}%` }} />
            <span className="act__day">{fmt(d.date).split(' ')[0].slice(0, 2)}</span>
          </div>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>Attempts per day</caption>
        <thead>
          <tr><th scope="col">Day</th><th scope="col">Attempts</th><th scope="col">Correct</th></tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}><th scope="row">{fmt(d.date)}</th><td>{d.attempts}</td><td>{d.correct}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
