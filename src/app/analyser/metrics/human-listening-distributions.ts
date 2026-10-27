export interface ListeningRating {
  session_id: string;
  track_id: string;
  excerpt_id?: string;
  trial_id: string;
  condition_id: string;
  included: boolean;
  answered: boolean;
  score: number | null;
}
export interface ListeningDistribution {
  trackId: string | null;
  values: Record<string, number[]>;
}

/** One observation per listener/condition; repetitions, excerpts, then tracks
 * are averaged in that order. Never treat repeated ratings as independent people.
 */
export function listeningDistributions(rows: ListeningRating[], conditions: string[]): ListeningDistribution[] {
  const cells = new Map<
    string,
    { session: string; track: string; condition: string; excerpts: Map<string, number[]> }
  >();
  const allowed = new Set(conditions);
  for (const row of rows) {
    if (
      !row.included ||
      !row.answered ||
      !allowed.has(row.condition_id) ||
      typeof row.score !== 'number' ||
      !Number.isFinite(row.score) ||
      row.score < 0 ||
      row.score > 100
    )
      continue;
    const key = JSON.stringify([row.session_id, row.track_id, row.condition_id]);
    const cell = cells.get(key) ?? {
      session: row.session_id,
      track: row.track_id,
      condition: row.condition_id,
      excerpts: new Map<string, number[]>(),
    };
    const excerpt = row.excerpt_id ?? row.trial_id;
    cell.excerpts.set(excerpt, [...(cell.excerpts.get(excerpt) ?? []), row.score]);
    cells.set(key, cell);
  }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const tracks = [...new Set([...cells.values()].map((cell) => cell.track))].sort();
  const make = (trackId: string | null): ListeningDistribution => ({
    trackId,
    values: Object.fromEntries(conditions.map((id) => [id, []])),
  });
  const overall = make(null),
    perTrack = new Map(tracks.map((id) => [id, make(id)]));
  const people = new Map<string, { condition: string; tracks: number[] }>();
  for (const cell of cells.values()) {
    const value = mean([...cell.excerpts.values()].map(mean));
    perTrack.get(cell.track)!.values[cell.condition].push(value);
    const key = JSON.stringify([cell.session, cell.condition]);
    const person = people.get(key) ?? { condition: cell.condition, tracks: [] };
    person.tracks.push(value);
    people.set(key, person);
  }
  for (const person of people.values()) overall.values[person.condition].push(mean(person.tracks));
  return [overall, ...perTrack.values()];
}
