import {
  listenerProfiles,
  matrixComparisons,
  orderedContrasts,
  orderedMeans,
  significance,
  FrozenListeningRating,
  ChartCondition,
  conditionLabel,
  conditionTickLabel,
} from './listening-chart-data';

const conditions: ChartCondition[] = [
  { id: 'b', name: 'B', module_index: 1 },
  { id: 'a', name: 'A', module_index: 0 },
  { id: 'c', name: 'C', module_index: 2 },
];
const pair = { first: 'a', second: 'b', effect: -12, ci95: [-15, -9] as [number, number], p: 0.001, p_adjusted: 0.02 };
const row = (patch: Partial<FrozenListeningRating> = {}): FrozenListeningRating => ({
  session_id: 'p1',
  session_status: 'completed',
  track_id: 'track-a',
  excerpt_id: 'e1',
  trial_id: 't1',
  condition_id: 'a',
  included: true,
  answered: true,
  score: 0,
  ...patch,
});

describe('Listening visualization transformations', () => {
  it('orients differences/intervals in configured order without changing p-values', () => {
    expect(orderedContrasts(conditions, [pair])[0]).toEqual({
      ...pair,
      first: 'b',
      second: 'a',
      effect: 12,
      ci95: [9, 15],
    });
    expect(pair.effect).toBe(-12);
  });
  it('builds symmetric probabilities, signed row-minus-column effects, blank diagonal and missing cells', () => {
    const cells = matrixComparisons(conditions, [pair]);
    expect(cells.length).toBe(9);
    expect(cells[0].diagonal).toBeTrue();
    expect(cells[0].pair).toBeUndefined();
    expect(cells[1].pair?.effect).toBe(12);
    expect(cells[3].pair?.effect).toBe(-12);
    expect(cells[1].pair?.p_adjusted).toBe(cells[3].pair?.p_adjusted);
    expect(cells[2].pair).toBeUndefined();
    expect(significance(cells[2].pair?.p_adjusted)).toBe('Unavailable');
  });
  it('uses exact significance boundaries including zero and rejects invalid p-values', () => {
    expect([0, 0.001, 0.01, 0.05, 1, -1, NaN, undefined].map(significance)).toEqual([
      '***',
      '**',
      '*',
      'ns',
      'ns',
      'Unavailable',
      'Unavailable',
      'Unavailable',
    ]);
  });
  it('orders valid model means, rejecting absent/nonfinite/reversed intervals rather than fabricating them', () => {
    expect(
      orderedMeans(conditions, [
        { id: 'a', mean: 50, se: 2, ci95: [46, 54] },
        { id: 'b', mean: 0, se: 1, ci95: [-2, 2] },
        { id: 'c', mean: 60, se: NaN, ci95: [62, 58] },
      ]).map((mean) => mean.id),
    ).toEqual(['b', 'a']);
    expect(orderedMeans(conditions, [{ id: 'a', mean: 50, se: 2 } as never])).toEqual([]);
  });
  it('preserves listener identity, genuine zero, and missing-condition gaps', () => {
    const profiles = listenerProfiles([row(), row({ session_id: 'p2', score: 80, condition_id: 'b' })], conditions);
    expect(profiles).toEqual([
      { sessionId: 'p1', scores: [null, 0, null] },
      { sessionId: 'p2', scores: [80, null, null] },
    ]);
  });
  it('averages repetitions then excerpts then tracks equally, not raw ratings', () => {
    const profiles = listenerProfiles(
      [
        row({ score: 0 }),
        row({ score: 20, trial_id: 'repeat' }),
        row({ score: 90, excerpt_id: 'e2' }),
        ...Array.from({ length: 5 }, (_, index) => row({ score: 100, track_id: 'track-b', excerpt_id: `b-${index}` })),
      ],
      conditions,
    );
    expect(profiles[0].scores[1]).toBe(75); // track A: (10 + 90)/2 = 50; track B: 100
  });
  it('supports explicitly selected QC identities, endpoint scores and labels without fake module indexes', () => {
    const anchor: ChartCondition = { id: 'actual-anchor', name: 'Anchor · QC', module_index: -1, role: 'anchor' };
    const reference: ChartCondition = {
      id: 'actual-ref',
      name: 'Hidden reference · QC',
      module_index: -1,
      role: 'hidden_reference',
    };
    const all = [anchor, ...conditions, reference];
    expect(conditionLabel(anchor)).toBe('Anchor · QC');
    expect(conditionTickLabel(reference)).toBe('Hidden reference · QC');
    expect(
      listenerProfiles(
        [row(), row({ condition_id: anchor.id }), row({ condition_id: reference.id, score: 100 })],
        all,
      )[0].scores,
    ).toEqual([0, null, 0, null, 100]);
    const contrast = orderedContrasts(all, [
      { ...pair, first: reference.id, second: anchor.id, effect: 100, ci95: [95, 105] },
    ])[0];
    expect(contrast.first).toBe(anchor.id);
    expect(contrast.effect).toBe(-100);
    expect(contrast.ci95).toEqual([-105, -95]);
    expect(contrast.p_adjusted).toBe(pair.p_adjusted);
  });
  it('excludes QC, unfinished/excluded/unanswered/invalid scores without dropping valid listeners', () => {
    const invalid: Partial<FrozenListeningRating>[] = [
      { condition_id: 'reference' },
      { condition_id: 'anchor35' },
      { included: false },
      { session_status: 'draft' },
      { answered: false },
      { score: null },
      { score: NaN },
      { score: Infinity },
      { score: -1 },
      { score: 101 },
    ];
    expect(
      listenerProfiles([row(), ...invalid.map((patch) => row({ session_id: 'invalid', ...patch }))], conditions),
    ).toEqual([{ sessionId: 'p1', scores: [null, 0, null] }]);
  });
});
