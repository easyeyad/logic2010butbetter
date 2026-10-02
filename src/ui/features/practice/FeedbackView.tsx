import type { Exercise, Feedback } from '../../../learning';
import { describeValuation } from '../../../learning';
import { HighlightedText } from '../../components/HighlightedText';
import { Icon, type IconName } from '../../components/Icon';
import { attempt } from '../../engine/safe';

const META: Record<Feedback['severity'], { icon: IconName; tone: string; label: string }> = {
  success: { icon: 'checkCircle', tone: 'ok', label: 'Correct' },
  info: { icon: 'checkCircle', tone: 'ok', label: 'Correct' },
  warning: { icon: 'alert', tone: 'warn', label: 'Partly right' },
  error: { icon: 'xCircle', tone: 'err', label: 'Not quite' },
};

/** Renders a learning-system Feedback: verdict word + icon, headline, why, details, the row in English. */
export function FeedbackView({ feedback, exercise, answerText }: { feedback: Feedback; exercise: Exercise; answerText?: string }) {
  const m = META[feedback.severity];
  const answerSpans = feedback.highlight?.filter((h) => h.target === 'answer');
  const key = exercise.kind === 'symbolization' ? exercise.key : [];
  const english = feedback.valuation ? attempt(() => describeValuation(feedback.valuation!, key)) : null;
  return (
    <section className={`fb fb--${m.tone}`} role="status" aria-live="polite" aria-label="Feedback" data-testid="feedback">
      <div className="fb__head">
        <Icon name={m.icon} size={22} />
        <span className="fb__verdict">{m.label}</span>
        <span className="fb__headline">{feedback.headline}</span>
      </div>
      {answerText && answerSpans && answerSpans.length > 0 && (
        <p className="fb__answer">
          Your answer: <HighlightedText math text={answerText} spans={answerSpans} />
        </p>
      )}
      <p className="fb__expl">{feedback.explanation}</p>
      {feedback.details && feedback.details.length > 0 && (
        <ul className="fb__details">
          {feedback.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {english && english.ok && english.value && (
        <p className="fb__row">
          <Icon name="table" size={16} /> <span><strong>The row to look at:</strong> {english.value}.</span>
        </p>
      )}
    </section>
  );
}
