import { generateExercise, getHints, getSolution, checkAnswer, TOPICS, TERMINOLOGY_EXERCISES, DERIVATION_EXERCISES, SYMBOLIZATION_EXERCISES } from '../../learning';
test('p', () => {
  for (const t of TOPICS) for (const d of [1, 4] as const) {
    const ex = generateExercise(t, d, 7);
    const { id, kind, topic, difficulty, tags, source, ...rest } = ex as any;
    console.log('##', t, d, JSON.stringify(rest).slice(0, 700));
  }
  console.log('TERM formats', [...new Set(TERMINOLOGY_EXERCISES.map(e => e.format))], TERMINOLOGY_EXERCISES.length);
  console.log('DER', DERIVATION_EXERCISES.length, DERIVATION_EXERCISES.map(e=>e.difficulty).join(''), JSON.stringify(DERIVATION_EXERCISES[0]).slice(0,400));
  console.log('SYM', SYMBOLIZATION_EXERCISES.length, [...new Set(SYMBOLIZATION_EXERCISES.flatMap(e=>e.tags))].join(','));
  const s = generateExercise('symbolization', 2, 3) as any;
  console.log(JSON.stringify(checkAnswer(s, { kind: 'symbolization', formula: 'P -> Q' })));
  console.log(JSON.stringify(getHints(s)), JSON.stringify(getSolution(s)));
  const w = generateExercise('wff', 3, 11) as any;
  console.log(JSON.stringify(w), JSON.stringify(checkAnswer(w, { kind: 'wff', wellFormed: false, errorAt: 0 })));
});
