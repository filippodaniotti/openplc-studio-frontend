import { NEVER, of } from 'rxjs';
import { ModuleType } from '../shared/enums/module-type.enum';
import { RunStatus } from '../shared/enums/run-status.enum';
import { RunArtifactKind } from '../shared/enums/run-artifact-kind.enum';
import { Run } from '../shared/interfaces/run.interface';
import { AnalyserComponent } from './analyser.component';
import { AnalysisService } from './analysis.service';

const run: Run = {
  id: 'run-1',
  created: '2026-01-01T12:00:00Z',
  updated: '2026-01-01T12:00:00Z',
  author: 'test',
  name: 'Analysis test',
  testbenchInternalId: 'internal-1',
  status: RunStatus.CREATED,
  tracks: ['track.wav'],
  modules: {
    [ModuleType.PacketLossSimulator]: [],
    [ModuleType.PLCAlgorithm]: [],
    [ModuleType.OutputAnalyser]: [],
  },
};

describe('AnalysisService sample-mask selection', () => {
  it('does not select a sample mask for original audio', () => {
    const service = new AnalysisService();
    service.sampleMaskMaps.next({ 'BinomialPLS-parent': [32] });

    expect(
      service.resolveSampleMaskIndexForTrack({
        kind: 'original-audio',
        name: 'song.wav',
        sampleMaskKey: null,
      }),
    ).toBe(-1);
  });

  it('selects the reconstructed track parent sample mask', () => {
    const service = new AnalysisService();
    service.sampleMaskMaps.next({ 'OtherPLS-mask': [64], 'BinomialPLS-parent': [32] });

    expect(
      service.resolveSampleMaskIndexForTrack({
        kind: 'reconstructed-track',
        name: 'song/BinomialPLS-parent/ZerosPLC-child.wav',
        sampleMaskKey: 'BinomialPLS-parent',
      }),
    ).toBe(1);
  });
});

describe('AnalyserComponent run status', () => {
  let runsClient: jasmine.SpyObj<any>;
  let analysisService: AnalysisService;

  beforeEach(() => {
    runsClient = jasmine.createSpyObj('RunsClient', ['getRun', 'getRunArtifactsArchive']);
    runsClient.getRunArtifactsArchive.and.returnValue(NEVER);
    analysisService = new AnalysisService();
  });

  function createComponent(): AnalyserComponent {
    return new AnalyserComponent(runsClient, { snapshot: { paramMap: { get: () => run.id } } } as any, analysisService);
  }

  it('does not request analysis assets for an incomplete run', () => {
    runsClient.getRun.and.returnValue(of(run));
    const component = createComponent();

    component.ngOnInit();

    expect(analysisService.run.value?.status).toBe(RunStatus.CREATED);
    expect(runsClient.getRunArtifactsArchive).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('requests ready-only analysis assets while the listening study awaits input', () => {
    runsClient.getRun.and.returnValue(of({ ...run, status: RunStatus.AWAITING_INPUT }));
    const component = createComponent();
    component.ngOnInit();
    expect(runsClient.getRunArtifactsArchive).toHaveBeenCalledWith(run.id, RunArtifactKind.OriginalTracks, true);
    expect(runsClient.getRunArtifactsArchive).toHaveBeenCalledWith(run.id, RunArtifactKind.OutputAnalysis, true);
    component.ngOnDestroy();
  });

  it('uses regions only for the parent mask of the loaded reconstructed track', () => {
    const component = createComponent();
    const originalName = 'song.wav';
    const reconstructedName = 'song/BinomialPLS-parent/ZerosPLC-child.wav';
    const wav = createWavHeader(48000);
    analysisService.trackMaps.next({ [originalName]: wav, [reconstructedName]: wav });
    analysisService.sampleMaskMaps.next({ 'OtherPLS-mask': [64], 'BinomialPLS-parent': [32] });

    component.onTrackChange({
      kind: 'reconstructed-track',
      name: reconstructedName,
      sampleMaskKey: 'BinomialPLS-parent',
    });
    expect(analysisService.currentAudioBlob).not.toBeNull();
    expect(analysisService.selectedSampleMaskIndex.value).toBe(1);

    component.onTrackChange({ kind: 'original-audio', name: originalName, sampleMaskKey: null });
    expect(analysisService.currentAudioBlob).not.toBeNull();
    expect(analysisService.selectedSampleMaskIndex.value).toBe(-1);
  });

  it('requests analysis assets for a completed run', () => {
    runsClient.getRun.and.returnValue(of({ ...run, status: RunStatus.COMPLETED }));
    const component = createComponent();

    component.ngOnInit();

    expect(analysisService.run.value?.status).toBe(RunStatus.COMPLETED);
    expect(runsClient.getRunArtifactsArchive.calls.allArgs()).toEqual([
      [run.id, RunArtifactKind.OriginalTracks],
      [run.id, RunArtifactKind.SampleMasks],
      [run.id, RunArtifactKind.ReconstructedTracks],
      [run.id, RunArtifactKind.OutputAnalysis],
    ]);
    component.ngOnDestroy();
  });
});

function createWavHeader(sampleRate: number): Uint8Array {
  const header = new Uint8Array(44);
  new DataView(header.buffer).setUint32(24, sampleRate, true);
  return header;
}
