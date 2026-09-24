import { useState } from 'react';
import { TOPIC_INFO, type Difficulty } from '../../../learning';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useProgress } from '../../learning/progress';
import { attempt } from '../../engine/safe';
import { PREDICATE_PICKER, SENTENTIAL_PICKER, TOPIC_ICON, type PracticeTopic } from './topics';

export interface SetupChoice {
  topic: PracticeTopic;
  /** null = adaptive. */
  difficulty: Difficulty | null;
  count: number;
}

const LENGTHS = [5, 10, 20];

export function topicTitle(t: PracticeTopic) {
  return t === 'mixed' ? 'Mixed review' : t === 'mixed-predicate' ? 'Mixed predicate review' : TOPIC_INFO[t].title;
}

/** Topic + difficulty (Adaptive by default) + length, and the recommended next practice. */
export function PracticeSetup({ onStart }: { onStart: (c: SetupChoice) => void }) {
  const [store] = useProgress();
  const [topic, setTopic] = useState<PracticeTopic>('wff');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [count, setCount] = useState(10);
  const rec = attempt(() => store.recommendNext());
  const adaptiveLevel = topic === 'mixed' || topic === 'mixed-predicate' ? null : attempt(() => store.recommendedDifficulty(topic));

  return (
    <div className="stack stack--lg">
      {rec.ok && (
        <section className="card rec" aria-labelledby="rec-h">
          <div className="rec__text">
            <div className="problem__label">Recommended next</div>
            <h2 id="rec-h" className="rec__title">
              {TOPIC_INFO[rec.value.topic].title} · Level {rec.value.difficulty}
            </h2>
            <p className="subtle">{rec.value.reason}</p>
          </div>
          <Button variant="primary" icon="play" onClick={() => onStart({ topic: rec.value.topic, difficulty: rec.value.difficulty, count: 5 })}>
            Start recommended
          </Button>
        </section>
      )}

      <section className="card stack" aria-labelledby="setup-h">
        <h2 id="setup-h" className="card__title">Build a practice session</h2>
        <fieldset className="plain-fieldset">
          <legend className="field__label">Topic</legend>
          {[
            { title: 'Sentential logic', list: SENTENTIAL_PICKER },
            { title: 'Predicate logic', list: PREDICATE_PICKER },
          ].map((g) => (
            <div key={g.title} className="topic-group">
              <h3 className="topic-group__h">{g.title}</h3>
              <div className="topic-grid">
                {g.list.map((t) => (
                  <label key={t} className={`topic-card ${topic === t ? 'is-selected' : ''}`}>
                    <input type="radio" name="practice-topic" value={t} checked={topic === t} onChange={() => setTopic(t)} />
                    <span className="topic-card__icon"><Icon name={TOPIC_ICON[t]} size={20} /></span>
                    <span className="topic-card__text">
                      <span className="topic-card__title">{topicTitle(t)}</span>
                      <span className="topic-card__desc">{t === 'mixed' ? 'A bit of every sentential topic, each at your level.' : t === 'mixed-predicate' ? 'Symbolization, models, countermodels and derivations with quantifiers.' : TOPIC_INFO[t].description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        <div className="setup-row">
          <div className="field">
            <span className="field__label" id="diff-label">Difficulty</span>
            <div className="segmented" role="radiogroup" aria-labelledby="diff-label">
              <button type="button" role="radio" aria-checked={difficulty === null} onClick={() => setDifficulty(null)}>
                Adaptive{adaptiveLevel && adaptiveLevel.ok ? ` (${adaptiveLevel.value})` : ''}
              </button>
              {([1, 2, 3, 4, 5] as Difficulty[]).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={difficulty === d} aria-label={`Level ${d}`} onClick={() => setDifficulty(d)}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field__label" id="len-label">Number of exercises</span>
            <div className="segmented" role="radiogroup" aria-labelledby="len-label">
              {LENGTHS.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={count === n} aria-label={`${n} exercises`} onClick={() => setCount(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <Button variant="primary" icon="play" onClick={() => onStart({ topic, difficulty, count })}>
            Start practice
          </Button>
        </div>
      </section>
    </div>
  );
}
