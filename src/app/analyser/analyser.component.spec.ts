import { NEVER, of } from 'rxjs';
import { ModuleType } from '../shared/enums/module-type.enum';
import { RunStatus } from '../shared/enums/run-status.enum';
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

describe('AnalyserComponent run status', () => {
  let runsClient: jasmine.SpyObj<any>;
  let analysisService: AnalysisService;

  beforeEach(() => {
    runsClient = jasmine.createSpyObj('RunsClient', ['getRun', 'getRunAssets']);
    runsClient.getRunAssets.and.returnValue(NEVER);
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
    expect(runsClient.getRunAssets).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('requests analysis assets for a completed run', () => {
    runsClient.getRun.and.returnValue(of({ ...run, status: RunStatus.COMPLETED }));
    const component = createComponent();

    component.ngOnInit();

    expect(analysisService.run.value?.status).toBe(RunStatus.COMPLETED);
    expect(runsClient.getRunAssets.calls.allArgs()).toEqual([
      [run.id, 0],
      [run.id, 1],
      [run.id, 2],
      [run.id, 3],
    ]);
    component.ngOnDestroy();
  });
});
