import { listeningDistributions, ListeningRating } from './human-listening-distributions';

function row(session: string, track: string, score: number, excerpt = 'excerpt', condition = 'plc-0'): ListeningRating {
  return {
    session_id: session,
    track_id: track,
    score,
    excerpt_id: excerpt,
    trial_id: excerpt,
    condition_id: condition,
    included: true,
    answered: true,
  };
}

describe('Listener distributions', () => {
  it('averages repetitions, excerpts and tracks before plotting one point per listener', () => {
    const panels = listeningDistributions(
      [
        row('a', 'track-1', 0, 'first'),
        row('a', 'track-1', 20, 'first'),
        row('a', 'track-1', 30, 'second'),
        row('a', 'track-2', 80),
        row('b', 'track-1', 60),
        row('b', 'track-2', 100),
      ],
      ['plc-0'],
    );
    expect(panels[0].values['plc-0']).toEqual([50, 80]);
    expect(panels[1].values['plc-0']).toEqual([20, 60]);
    expect(panels[2].values['plc-0']).toEqual([80, 100]);
  });

  it('keeps zero and separate conditions but excludes unanswered, excluded and QC ratings', () => {
    const panels = listeningDistributions(
      [
        row('a', 'track', 0),
        row('a', 'track', 70, 'excerpt', 'plc-1'),
        { ...row('b', 'track', 30), included: false },
        { ...row('c', 'track', 50), answered: false },
        row('a', 'track', 100, 'excerpt', 'reference'),
        row('a', 'track', NaN),
      ],
      ['plc-0', 'plc-1'],
    );
    expect(panels[0].values).toEqual({ 'plc-0': [0], 'plc-1': [70] });
  });

  it('handles an empty study without inventing scores', () => {
    expect(listeningDistributions([], ['plc-0'])).toEqual([{ trackId: null, values: { 'plc-0': [] } }]);
  });
});
