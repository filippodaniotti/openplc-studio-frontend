import { EstimatedMarginalMean, PairwiseComparison, Study } from '../listening.models';

export type ChartCondition = Study['conditions'][number] & { role?: 'plc' | 'hidden_reference' | 'anchor' };
export interface FrozenListeningRating {
  session_id: string;
  session_status?: string;
  track_id: string;
  excerpt_id?: string;
  trial_id: string;
  condition_id: string;
  included: boolean;
  answered: boolean;
  score: number | null;
}
export interface ListenerProfile {
  sessionId: string;
  scores: (number | null)[];
}
export const isQualityControl = (condition: ChartCondition) =>
  condition.role === 'anchor' || condition.role === 'hidden_reference';
export const conditionLabel = (condition: ChartCondition) =>
  isQualityControl(condition) ? condition.name : `${condition.name} (#${condition.module_index + 1})`;
/** Keep axes usable; full identities remain in native tooltips and HTML tables. */
export const conditionTickLabel = (condition: ChartCondition, limit = 18) => {
  if (isQualityControl(condition)) return condition.name;
  return `#${condition.module_index + 1} ${condition.name.length > limit ? condition.name.slice(0, limit - 1) + '…' : condition.name}`;
};
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const validInterval = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(finite) && value[0] <= value[1];
export const validProbability = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1;
export const formatNumber = (value: number | null | undefined) =>
  finite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'Unavailable';
export const formatProbability = (value: number | null | undefined) =>
  !validProbability(value) ? 'Unavailable' : value < 0.000001 ? '< 0.000001' : value.toFixed(6);
export const formatInterval = (value: [number, number] | null | undefined) =>
  validInterval(value) ? `${formatNumber(value[0])} – ${formatNumber(value[1])}` : 'Unavailable';
export const significance = (p: number | undefined): string => {
  if (!validProbability(p)) return 'Unavailable';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return 'ns';
};

/** Reorient first-minus-second contrasts, never their probabilities. */
export function orderedContrasts(conditions: ChartCondition[], pairs: PairwiseComparison[]): PairwiseComparison[] {
  const result: PairwiseComparison[] = [];
  for (let first = 0; first < conditions.length; first++) {
    for (let second = first + 1; second < conditions.length; second++) {
      const a = conditions[first].id,
        b = conditions[second].id;
      const pair = pairs.find(
        (item) => (item.first === a && item.second === b) || (item.first === b && item.second === a),
      );
      if (!pair) continue;
      result.push(
        pair.first === a
          ? { ...pair }
          : {
              ...pair,
              first: a,
              second: b,
              effect: -pair.effect,
              ci95: validInterval(pair.ci95) ? [-pair.ci95[1], -pair.ci95[0]] : null,
            },
      );
    }
  }
  return result;
}

export interface MatrixComparison {
  row: number;
  column: number;
  diagonal: boolean;
  pair?: PairwiseComparison;
}
export function matrixComparisons(conditions: ChartCondition[], pairs: PairwiseComparison[]): MatrixComparison[] {
  const ordered = orderedContrasts(conditions, pairs);
  return conditions.flatMap((row, rowIndex) =>
    conditions.map((column, columnIndex) => {
      const pair = ordered.find(
        (item) =>
          (item.first === row.id && item.second === column.id) || (item.second === row.id && item.first === column.id),
      );
      return {
        row: rowIndex,
        column: columnIndex,
        diagonal: rowIndex === columnIndex,
        pair:
          !pair || pair.first === row.id
            ? pair
            : {
                ...pair,
                first: row.id,
                second: column.id,
                effect: -pair.effect,
                ci95: validInterval(pair.ci95) ? [-pair.ci95[1], -pair.ci95[0]] : null,
              },
      };
    }),
  );
}

export function orderedMeans(conditions: ChartCondition[], means: EstimatedMarginalMean[]): EstimatedMarginalMean[] {
  return conditions.flatMap((condition) => {
    const mean = means.find((item) => item.id === condition.id);
    return mean && finite(mean.mean) && finite(mean.se) && mean.se >= 0 && validInterval(mean.ci95) ? [mean] : [];
  });
}

/** Preserve session identity: repetitions -> excerpts -> equally weighted tracks. */
export function listenerProfiles(rows: FrozenListeningRating[], conditions: ChartCondition[]): ListenerProfile[] {
  const allowed = new Set(conditions.map((condition) => condition.id));
  const cells = new Map<string, { session: string; condition: string; excerpts: Map<string, number[]> }>();
  for (const row of rows) {
    if (
      !row.included ||
      !row.answered ||
      (row.session_status && row.session_status !== 'completed') ||
      !allowed.has(row.condition_id) ||
      !finite(row.score) ||
      row.score < 0 ||
      row.score > 100
    )
      continue;
    const key = JSON.stringify([row.session_id, row.track_id, row.condition_id]);
    const cell = cells.get(key) ?? {
      session: row.session_id,
      condition: row.condition_id,
      excerpts: new Map<string, number[]>(),
    };
    const excerpt = row.excerpt_id ?? row.trial_id;
    const scores = cell.excerpts.get(excerpt) ?? [];
    scores.push(row.score);
    cell.excerpts.set(excerpt, scores);
    cells.set(key, cell);
  }
  const average = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
  const people = new Map<string, Map<string, number[]>>();
  for (const cell of cells.values()) {
    const person = people.get(cell.session) ?? new Map<string, number[]>();
    const tracks = person.get(cell.condition) ?? [];
    tracks.push(average([...cell.excerpts.values()].map(average)));
    person.set(cell.condition, tracks);
    people.set(cell.session, person);
  }
  return [...people.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sessionId, values]) => ({
      sessionId,
      scores: conditions.map((condition) => {
        const tracks = values.get(condition.id);
        return tracks?.length ? average(tracks) : null;
      }),
    }));
}
